/**
 * Client bundle contract for the highlight package: loader identity, plugin
 * exports, the dotfile preview registration and language probes, the switch,
 * store persistence and runtime disposal.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const STORAGE_KEY = '@jianghuifr/dsh-highlight:features'

function createStorage(entries = {}) {
  const map = new Map(Object.entries(entries).map(([key, value]) => [key, String(value)]))
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    dump() {
      return Object.fromEntries(map)
    },
  }
}

function createDom() {
  const styles = []
  const attributes = new WeakMap()

  function attrsOf(element) {
    let map = attributes.get(element)
    if (map === undefined) {
      map = new Map()
      attributes.set(element, map)
    }
    return map
  }

  function createElement(tagName) {
    const element = {
      tagName: String(tagName).toUpperCase(),
      nodeType: 1,
      isConnected: true,
      children: [],
      style: {},
      textContent: '',
      setAttribute(name, value) {
        attrsOf(element).set(String(name), String(value))
      },
      getAttribute(name) {
        return attrsOf(element).has(name) ? attrsOf(element).get(name) : null
      },
      hasAttribute(name) {
        return attrsOf(element).has(name)
      },
      removeAttribute(name) {
        attrsOf(element).delete(name)
      },
      appendChild(child) {
        element.children.push(child)
        if (child.tagName === 'STYLE') styles.push(child)
        return child
      },
      remove() {
        element.isConnected = false
        const index = styles.indexOf(element)
        if (index !== -1) styles.splice(index, 1)
      },
      querySelector() {
        return null
      },
      querySelectorAll() {
        return []
      },
    }
    return element
  }

  const head = createElement('head')
  const body = createElement('body')
  const documentElement = createElement('html')
  documentElement.appendChild(head)
  documentElement.appendChild(body)

  function styleNameOf(selector) {
    const match = /data-dsh-mi-style="([^"]+)"/u.exec(selector)
    return match === null ? null : match[1]
  }

  const document = {
    head,
    body,
    documentElement,
    readyState: 'complete',
    createElement,
    querySelector(selector) {
      const name = styleNameOf(selector)
      if (name !== null) return styles.find(style => style.getAttribute('data-dsh-mi-style') === name) ?? null
      return null
    },
    querySelectorAll(selector) {
      const name = styleNameOf(selector)
      if (name !== null) return styles.filter(style => style.getAttribute('data-dsh-mi-style') === name)
      return []
    },
  }

  const window = {
    localStorage: createStorage(),
    setTimeout() {
      return 0
    },
    clearTimeout() {},
  }

  return { document, window, styles }
}

const FakeCodeBlock = function CodeBlock() {
  return null
}

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      const merged = { ...(props ?? {}) }
      if (children.length === 1) merged.children = children[0]
      else if (children.length > 1) merged.children = children
      if (typeof type === 'function' && type !== FakeCodeBlock) return type(merged)
      return { type, props: merged, children }
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
}

function mountClient({ storage = createStorage() } = {}) {
  const dom = createDom()
  dom.window.localStorage = storage
  let captured = null
  dom.window.__ModuleLoader__ = {
    load(entry) {
      captured = entry
    },
  }
  vm.runInNewContext(clientSource, {
    window: dom.window,
    document: dom.document,
    console,
  }, { filename: 'lib/client.js' })
  assert.ok(captured !== null)
  const requireFake = specifier => {
    if (specifier === 'react') return fakeReact()
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { CodeBlock: FakeCodeBlock }
    throw new Error('unexpected require: ' + specifier)
  }
  return { captured, exports: captured.factory(requireFake), dom, storage }
}

function createContext() {
  const events = { locale: [], slotOwners: [], registrations: [], previews: [], previewDisposals: 0, effects: [] }
  const ctx = {
    effect(callback, label) {
      const disposer = callback()
      events.effects.push({ label, disposer })
      return disposer
    },
    locale: {
      register(namespace, dictionaries) {
        events.locale.push({ namespace, dictionaries })
        return () => {}
      },
      bind(namespace) {
        return key => 't:' + key + '@' + namespace
      },
    },
    slots: {
      inject(owner, callback) {
        events.slotOwners.push(owner)
        return callback()
      },
      register(options, component) {
        events.registrations.push({ options, component })
        return () => {}
      },
    },
    documentPreviews: {
      register(definition) {
        events.previews.push(definition)
        return () => {
          events.previewDisposals += 1
        }
      },
    },
  }
  return { ctx, events }
}

function applyPlugin(options) {
  const client = mountClient(options)
  const context = createContext()
  client.exports.apply(context.ctx)
  return { ...client, ...context }
}

function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

function switches(tree) {
  const found = []
  walk(tree, node => {
    if (node.type === 'button' && node.props.role === 'switch') found.push(node)
  })
  return found
}

function codeBlocks(tree) {
  const found = []
  walk(tree, node => {
    if (node.type === FakeCodeBlock) found.push(node)
  })
  return found
}

function registration(events, name) {
  const entry = events.registrations.find(candidate => candidate.options.name === name)
  assert.ok(entry !== undefined, 'missing registration for ' + name)
  return entry
}

test('client bundle registers the package id and runs no factory side effects', () => {
  const dom = createDom()
  dom.window.__ModuleLoader__ = { load(entry) { dom.window.__captured = entry } }
  vm.runInNewContext(clientSource, { window: dom.window, document: dom.document, console })
  assert.equal(dom.window.__captured.id, packageJson.name)
  assert.equal(dom.window.__captured.id, '@jianghuifr/dsh-highlight')
  assert.equal(dom.styles.length, 0)
})

test('client exports the highlight plugin contract and registers its slots', () => {
  const { exports, events } = applyPlugin()
  assert.deepEqual(Array.from(exports.inject), ['slots', 'documentPreviews', 'locale'])
  assert.deepEqual(events.slotOwners, ['plugins.row.config', 'sidebar.right.tab.document'])
  const row = registration(events, 'plugins.row.config')
  assert.equal(row.options.key, '@jianghuifr/dsh-highlight#dsh-highlight')
  const body = registration(events, 'sidebar.right.tab.document')
  assert.equal(body.options.key, '@jianghuifr/dsh-highlight/dotfile-code')
})

test('locale namespace carries English and Chinese dictionaries with every key', () => {
  const { events } = applyPlugin()
  const [{ namespace, dictionaries }] = events.locale
  assert.equal(namespace, 'dshMaterialIconThemeHighlight')
  const englishKeys = Object.keys(dictionaries.en).sort()
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), englishKeys)
  for (const key of ['copy', 'copied', 'code', 'wrap', 'unwrap', 'renderer.title', 'settings.syntaxExtras.label']) {
    assert.ok(englishKeys.includes(key), 'missing locale key ' + key)
  }
})

test('the switch on registers exactly the 47 claimed dotfile suffixes', () => {
  const { events } = applyPlugin()
  assert.equal(events.previews.length, 1)
  const definition = events.previews[0]
  assert.equal(definition.id, '@jianghuifr/dsh-highlight/dotfile-code')
  assert.equal(definition.priority, 'extension')
  assert.equal(definition.loading, 'text-pages')
  assert.equal(definition.wrap, true)
  assert.equal(definition.sourceLines, true)
  assert.equal(definition.extensions.length, 47)
  assert.equal(new Set(definition.extensions).size, 47)
  assert.equal(definition.title(), 't:renderer.title@dshMaterialIconThemeHighlight')
})

test('settings page renders one switch, on by default, and disposes the preview when off', () => {
  const { events, storage } = applyPlugin()
  const SettingsView = registration(events, 'plugins.row.config').component
  const page = SettingsView({ view: 'page', t: key => 't:' + key })
  assert.equal(switches(page).length, 1)
  assert.equal(switches(page)[0].props['aria-checked'], true)
  switches(page)[0].props.onClick()
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).syntaxExtras, false)
  assert.equal(events.previewDisposals, 1)
  const off = switches(SettingsView({ view: 'page', t: key => 't:' + key }))
  assert.equal(off[0].props['aria-checked'], false)
})

test('syntax preview resolves languages from suffixes and content probes', () => {
  const { events } = applyPlugin()
  const SyntaxPreview = registration(events, 'sidebar.right.tab.document').component
  const render = (address, text) => {
    const tree = SyntaxPreview({
      resourceAddress: address,
      content: { kind: 'text', text, pages: [], eof: true },
      wrap: false,
      scrollportRef: () => {},
      t: key => key,
    })
    const blocks = codeBlocks(tree)
    assert.equal(blocks.length, 1, 'expected one CodeBlock for ' + address)
    return blocks[0].props
  }
  assert.equal(render('dsh-resource://file/session/s/.bashrc', 'echo hi\n').lang, 'shellscript')
  assert.equal(render('dsh-resource://file/session/s/.gitconfig', '[user]\nname = x\n').lang, 'ini')
  assert.equal(render('dsh-resource://file/session/s/.latexmkrc', '1;\n').lang, 'perl')
  assert.equal(render('dsh-resource://file/session/s/.sqliterc', '#!/usr/bin/env python3\n').lang, 'python')
  assert.equal(render('dsh-resource://file/session/s/.prettierrc', '{"semi":false}\n').lang, 'json')
  assert.equal(render('dsh-resource://file/session/s/.inputrc', 'set editing-mode vi\n').lang, undefined)
  assert.equal(render('dsh-resource://file/session/s/.tool-versions', 'nodejs 22.1.0\n').lang, undefined)
  assert.equal(SyntaxPreview({
    resourceAddress: 'dsh-resource://file/session/s/.bashrc',
    content: { kind: 'bytes', data: new Uint8Array() },
    wrap: false,
    scrollportRef: () => {},
    t: key => key,
  }), null)
})

test('legacy stores migrate: the previous split key, then the merged plugin key', () => {
  const previousSplit = createStorage({
    '@jianghuifr/dsh-material-icon-theme-highlight:features': JSON.stringify({ syntaxExtras: false }),
  })
  const split = applyPlugin({ storage: previousSplit })
  assert.equal(split.events.previews.length, 0, 'previous split key should turn the preview off')

  const merged = createStorage({ 'dsh-material-icon-theme:features': JSON.stringify({ syntaxExtras: false }) })
  const mergedClient = applyPlugin({ storage: merged })
  assert.equal(mergedClient.events.previews.length, 0, 'merged plugin key should turn the preview off')
})

test('dispose unregisters the preview and removes the settings style', () => {
  const { events, dom } = applyPlugin()
  assert.equal(dom.styles.length, 1)
  const runtime = events.effects.find(entry => entry.label === 'dsh-highlight: preview runtime')
  assert.ok(runtime !== undefined)
  runtime.disposer()
  assert.equal(events.previewDisposals, 1)
  assert.equal(dom.styles.length, 0)
  runtime.disposer()
  assert.equal(events.previewDisposals, 1)
})
