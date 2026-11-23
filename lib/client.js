/**
 * `@jianghuifr/dsh-highlight` — Web client half.
 *
 * The shipped code preview decides its language from a file-extension table, so
 * dotfiles such as `.bashrc` fall through to plain text. This plugin claims a
 * curated set of dotfile suffixes at the external (`extension`) priority and
 * renders them through the shipped CodeBlock baseline, deciding the language
 * from the suffix name plus a small content probe.
 *
 * The `syntaxExtras` switch registers or disposes that preview definition; the
 * body slot stays registered for the plugin's lifetime.
 */
window.__ModuleLoader__.load({
  id: '@jianghuifr/dsh-highlight',
  factory(require) {
    'use strict'

    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const CodeBlock = primitives.CodeBlock
    const h = React.createElement

    // -----------------------------------------------------------------------
    // Identity and constants
    // -----------------------------------------------------------------------

    const ROW_ID = 'dsh-highlight'
    const ROW_CONFIG_KEY = '@jianghuifr/dsh-highlight#' + ROW_ID
    const LOCALE_NS = 'dshMaterialIconThemeHighlight'
    const PREVIEW_ID = '@jianghuifr/dsh-highlight/dotfile-code'
    const STORAGE_KEY = '@jianghuifr/dsh-highlight:features'
    /** Keys tried when this package's own key is absent: the previous split name, then the merged plugin. */
    const LEGACY_STORAGE_KEYS = [
      '@jianghuifr/dsh-material-icon-theme-highlight:features',
      'dsh-material-icon-theme:features',
    ]
    const FEATURE_KEYS = ['syntaxExtras']

    const DEFAULT_FEATURES = Object.freeze({ syntaxExtras: true })

    // -----------------------------------------------------------------------
    // Feature store (localStorage, shared by the settings page and runtime)
    // -----------------------------------------------------------------------

    let features = null
    const featureListeners = new Set()

    function readOwnFeatures() {
      const next = { ...DEFAULT_FEATURES }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const key of FEATURE_KEYS) {
              if (typeof parsed[key] === 'boolean') next[key] = parsed[key]
            }
          }
          return next
        }
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          const legacy = window.localStorage.getItem(legacyKey)
          if (legacy === null) continue
          try {
            const parsed = JSON.parse(legacy)
            if (parsed !== null && typeof parsed === 'object' && typeof parsed.syntaxExtras === 'boolean') {
              next.syntaxExtras = parsed.syntaxExtras
              break
            }
          } catch {
            // Skip a corrupt legacy value and try the next key.
          }
        }
      } catch {
        // A corrupt or blocked store falls back to the defaults.
      }
      return next
    }

    function getFeatures() {
      if (features === null) features = Object.freeze(readOwnFeatures())
      return features
    }

    function subscribeFeatures(listener) {
      featureListeners.add(listener)
      return () => {
        featureListeners.delete(listener)
      }
    }

    function setFeature(key, value) {
      if (!FEATURE_KEYS.includes(key) || typeof value !== 'boolean') return
      const current = getFeatures()
      if (current[key] === value) return
      features = Object.freeze({ ...current, [key]: value })
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(features))
      } catch {
        // Persistence may be blocked; the live value still applies.
      }
      for (const listener of [...featureListeners]) {
        try {
          listener()
        } catch (error) {
          console.error('[dsh-highlight] feature listener failed', error)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Styles for the settings page
    // -----------------------------------------------------------------------

    const STYLE_NAME = 'dsh-highlight:settings'

    const SETTINGS_CSS = [
      '.dmi-feature-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l3)}',
      '.dmi-feature-row:last-child{border-bottom:0}',
      '.dmi-feature-copy{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.dmi-feature-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px}',
      '.dmi-feature-description{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}',
      '.dmi-feature-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px;padding:8px 0;margin:0}',
      '.dmi-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}',
      '.dmi-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}',
      '.dmi-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.dmi-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform .12s ease}',
      '.dmi-switch[aria-checked="true"] .dmi-switch-thumb{transform:translate(16px);background:var(--dsw-alias-label-primary-foreground)}',
      '.dmi-settings{display:flex;flex-direction:column;padding:2px 0}',
    ].join('\n')

    function installStyle() {
      const existing = document.querySelector('style[data-dsh-mi-style="' + STYLE_NAME + '"]')
      if (existing !== null) return existing
      const style = document.createElement('style')
      style.setAttribute('data-dsh-mi-style', STYLE_NAME)
      style.textContent = SETTINGS_CSS
      ;(document.head === null ? document.documentElement : document.head).appendChild(style)
      return style
    }

    function removeStyle() {
      for (const style of document.querySelectorAll('style[data-dsh-mi-style="' + STYLE_NAME + '"]')) style.remove()
    }

    // -----------------------------------------------------------------------
    // Dotfile suffixes and language probes
    // -----------------------------------------------------------------------

    /** 47 suffixes the shipped extension table does not claim. */
    const DOTFILE_SUFFIXES = [
      'bashrc', 'bash_aliases', 'bash_profile', 'bash_logout', 'bash_login', 'profile',
      'zshrc', 'zprofile', 'zshenv', 'zlogin', 'zlogout', 'kshrc', 'cshrc', 'tcshrc',
      'gitconfig', 'gitignore', 'gitattributes', 'gitmodules', 'npmrc', 'yarnrc', 'nvmrc',
      'node-version', 'python-version', 'ruby-version', 'tool-versions', 'editorconfig',
      'inputrc', 'vimrc', 'gvimrc', 'screenrc', 'xinitrc', 'xprofile', 'curlrc', 'wgetrc',
      'netrc', 'pgpass', 'myclirc', 'sqliterc', 'psqlrc', 'hushlogin', 'dockerignore',
      'envrc', 'latexmkrc', 'eslintrc', 'prettierrc', 'stylelintrc', 'browserslistrc',
    ]

    const DOTFILE_LANGUAGES = {
      'bashrc': 'shellscript',
      'bash_aliases': 'shellscript',
      'bash_profile': 'shellscript',
      'bash_logout': 'shellscript',
      'bash_login': 'shellscript',
      'profile': 'shellscript',
      'zshrc': 'shellscript',
      'zprofile': 'shellscript',
      'zshenv': 'shellscript',
      'zlogin': 'shellscript',
      'zlogout': 'shellscript',
      'kshrc': 'shellscript',
      'cshrc': 'shellscript',
      'tcshrc': 'shellscript',
      'xinitrc': 'shellscript',
      'xprofile': 'shellscript',
      'envrc': 'shellscript',
      'gitconfig': 'ini',
      'npmrc': 'ini',
      'yarnrc': 'ini',
      'editorconfig': 'ini',
      'myclirc': 'ini',
      'latexmkrc': 'perl',
    }

    const SHEBANG_LANGUAGES = {
      'bash': 'shellscript',
      'sh': 'shellscript',
      'zsh': 'shellscript',
      'ksh': 'shellscript',
      'dash': 'shellscript',
      'python': 'python',
      'python3': 'python',
      'perl': 'perl',
      'ruby': 'ruby',
      'node': 'javascript',
    }

    function suffixOf(name) {
      const at = name.lastIndexOf('.')
      return (at === -1 ? name : name.slice(at + 1)).toLowerCase()
    }

    /** Shebang plus first-byte shape probes; returns undefined rather than guessing. */
    function probeLanguage(source) {
      const text = source.slice(0, 4096)
      if (text.startsWith('#!')) {
        const parts = text.slice(2).trim().split(/\s+/u)
        let command = parts[0] === undefined ? '' : parts[0]
        command = command.slice(command.lastIndexOf('/') + 1)
        if (command === 'env') {
          const next = parts.slice(1).find(part => part !== '' && !part.startsWith('-'))
          command = next === undefined ? '' : next.slice(next.lastIndexOf('/') + 1)
        }
        const language = SHEBANG_LANGUAGES[command]
        if (language !== undefined) return language
      }
      const trimmed = text.trimStart()
      if (trimmed.startsWith('{')) return 'json'
      if (trimmed.startsWith('[')) {
        try {
          JSON.parse(trimmed)
          return 'json'
        } catch {
          // Not JSON; an INI section header starts with '[' too.
        }
      }
      if (/^\[[^\]\r\n]+\]\s*$/mu.test(text)) return 'ini'
      if (/^[A-Za-z_][\w.-]*\s*:\s*\S/mu.test(text)) return 'yaml'
      if (/^[A-Za-z_][\w.-]*\s*=\s*/mu.test(text)) return 'ini'
      return undefined
    }

    function languageForDotfile(name, source) {
      const mapped = DOTFILE_LANGUAGES[suffixOf(name)]
      if (mapped !== undefined) return mapped
      return probeLanguage(source)
    }

    function fileNameFromAddress(address) {
      if (typeof address !== 'string' || address === '') return ''
      const segment = address.slice(address.lastIndexOf('/') + 1)
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    }

    // -----------------------------------------------------------------------
    // Document preview body
    // -----------------------------------------------------------------------

    function SyntaxPreview(props) {
      const { resourceAddress, content, wrap, scrollportRef, t } = props
      if (content === null || content === undefined || content.kind !== 'text') return null
      const name = fileNameFromAddress(resourceAddress)
      const code = content.text
      const lang = languageForDotfile(name, code)
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            overflow: 'auto',
            background: 'var(--dsw-alias-markdown-code-block)',
          },
        },
        h(CodeBlock, {
          code,
          lang,
          lineNumbers: true,
          wrap,
          streaming: !content.eof,
          contentRef: scrollportRef,
          copyLabel: t('copy'),
          copiedLabel: t('copied'),
          toolbarLabels: {
            codeLabel: t('code'),
            wrapLabel: t('wrap'),
            unwrapLabel: t('unwrap'),
          },
        }),
      )
    }

    // -----------------------------------------------------------------------
    // Settings page
    // -----------------------------------------------------------------------

    function Switch({ checked, label, labelId, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          'aria-label': label,
          'aria-describedby': labelId,
          className: 'dmi-switch',
          onClick: () => onChange(!checked),
        },
        h('span', { className: 'dmi-switch-thumb' }),
      )
    }

    function SettingsView(props) {
      const t = props.t
      const current = React.useSyncExternalStore(subscribeFeatures, getFeatures, getFeatures)
      if (props.view === 'summary') return t('settings.summary')
      const descriptionId = 'dmi-description-syntaxExtras'
      return h(
        'div',
        { className: 'dmi-settings' },
        h('p', { className: 'dmi-feature-note' }, t('settings.note.hidden')),
        h(
          'div',
          { className: 'dmi-feature-row' },
          h(
            'div',
            { className: 'dmi-feature-copy' },
            h('span', { className: 'dmi-feature-label' }, t('settings.syntaxExtras.label')),
            h('span', { id: descriptionId, className: 'dmi-feature-description' }, t('settings.syntaxExtras.description')),
          ),
          h(Switch, {
            checked: current.syntaxExtras,
            label: t('settings.syntaxExtras.label'),
            labelId: descriptionId,
            onChange: value => setFeature('syntaxExtras', value),
          }),
        ),
        h('p', { className: 'dmi-feature-note' }, t('settings.note.storage')),
      )
    }

    // -----------------------------------------------------------------------
    // Locale dictionaries (en + zh are required by the locale service)
    // -----------------------------------------------------------------------

    const zh = {
      'renderer.title': '代码',
      'copy': '复制',
      'copied': '已复制',
      'code': '代码',
      'wrap': '自动换行',
      'unwrap': '不换行',
      'settings.summary': '为官方漏掉的 dotfile 提供带行号的代码预览；能识别语法的格式会上色。',
      'settings.note.hidden': 'dotfile 默认被文件树隐藏，可通过 @ 引用或文件链接打开。',
      'settings.note.storage': '设置保存在当前浏览器，切换立即生效、刷新后保持。',
      'settings.syntaxExtras.label': 'dotfile 语法高亮',
      'settings.syntaxExtras.description': '认领 .bashrc、.gitconfig 等 47 个后缀，能识别语法的格式会上色。',
    }

    const en = {
      'renderer.title': 'Code',
      'copy': 'Copy',
      'copied': 'Copied',
      'code': 'Code',
      'wrap': 'Wrap',
      'unwrap': 'Unwrap',
      'settings.summary': 'A line-numbered code preview for dotfiles the shipped preview misses; formats with a known grammar are coloured.',
      'settings.note.hidden': 'Dotfiles are hidden in the Files tree; open them through an @ reference or file link.',
      'settings.note.storage': 'Settings are stored in this browser and apply immediately; they survive a reload.',
      'settings.syntaxExtras.label': 'Dotfile highlighting',
      'settings.syntaxExtras.description': 'Claims 47 suffixes such as .bashrc and .gitconfig; formats with a known grammar are coloured.',
    }

    // -----------------------------------------------------------------------
    // Runtime: switch application and preview registration
    // -----------------------------------------------------------------------

    function createRuntime(ctx, t) {
      let disposed = false
      let previewDisposer = null
      let unsubscribeStore = null

      function applySyntaxExtras(enabled) {
        if (enabled) {
          if (previewDisposer === null) {
            previewDisposer = ctx.documentPreviews.register({
              id: PREVIEW_ID,
              extensions: DOTFILE_SUFFIXES,
              priority: 'extension',
              title: () => t('renderer.title'),
              loading: 'text-pages',
              wrap: true,
              sourceLines: true,
            })
          }
        } else if (previewDisposer !== null) {
          previewDisposer()
          previewDisposer = null
        }
      }

      function applyFeatures() {
        applySyntaxExtras(getFeatures().syntaxExtras)
      }

      return {
        start() {
          installStyle()
          applySyntaxExtras(getFeatures().syntaxExtras)
          unsubscribeStore = subscribeFeatures(applyFeatures)
          return () => {
            if (disposed) return
            disposed = true
            if (unsubscribeStore !== null) {
              unsubscribeStore()
              unsubscribeStore = null
            }
            if (previewDisposer !== null) {
              previewDisposer()
              previewDisposer = null
            }
            removeStyle()
          }
        },
      }
    }

    // -----------------------------------------------------------------------
    // Plugin export
    // -----------------------------------------------------------------------

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-highlight: locale')
      const t = ctx.locale.bind(LOCALE_NS)

      ctx.effect(
        () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: ROW_CONFIG_KEY,
          locale: LOCALE_NS,
        }, SettingsView)),
        'dsh-highlight: settings row',
      )

      // The body stays registered for the plugin's lifetime; without a live
      // preview definition the owner never dispatches to it.
      ctx.effect(
        () => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
          name: 'sidebar.right.tab.document',
          key: PREVIEW_ID,
          locale: LOCALE_NS,
        }, SyntaxPreview)),
        'dsh-highlight: dotfile preview body',
      )

      ctx.effect(
        () => createRuntime(ctx, t).start(),
        'dsh-highlight: preview runtime',
      )
    }

    return {
      inject: ['slots', 'documentPreviews', 'locale'],
      apply,
    }
  },
})
