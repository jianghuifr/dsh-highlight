# @jianghuifr/dsh-highlight

[![CI](https://github.com/jianghuifr/dsh-highlight/actions/workflows/ci.yml/badge.svg)](https://github.com/jianghuifr/dsh-highlight/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@jianghuifr/dsh-highlight.svg)](https://www.npmjs.com/package/@jianghuifr/dsh-highlight)

A syntax-highlighted code preview for the shell dotfiles the DeepSeek Harness Web UI would otherwise show as plain text (.bashrc, .gitconfig, …).

属于同一插件拆分出的三个独立包之一：[icons](https://github.com/jianghuifr/dsh-material-icon-theme-icon) · [dotfile highlight](https://github.com/jianghuifr/dsh-highlight) · [UI optimize](https://github.com/jianghuifr/dsh-ui-optimize)。

## 功能

官方预览按文件后缀表决定语言，`.bashrc`、`.zshrc`、`.gitconfig` 这类 dotfile 没有表项，会落到纯文本。本插件以外部优先级（`priority: 'extension'`）认领 **47 个精选后缀**，用官方基线 `CodeBlock` 渲染带行号、复制、换行按钮的代码视图。

![dotfile 代码预览](docs/syntax-preview.png)

语言判定 = 名字表 + 内容探测：`bashrc/zshrc/… → shellscript`、`gitconfig/npmrc/editorconfig → ini`、`latexmkrc → perl`；未命中时探测 shebang、JSON、INI 段头、YAML、`KEY=value`；都不中则无颜色但保留行号与复制（如 `.vimrc`）。


## 安装

```bash
# 发布到 npm 之后
plugin_manager install_bundle target=@jianghuifr/dsh-highlight
```

本地开发也可直接 link 本目录（或在 Plugins → Add plugin 选择本目录）：

```bash
plugin_manager install_bundle target=<本仓库绝对路径>
```

## 设置页

**Plugins → Installed plugins → 本插件详情 → Components → `dotfile 代码高亮 ›`**

![设置页](docs/settings.png)

开关存在浏览器 `localStorage`，切换立即生效、刷新后保持；会从旧合并版 `dsh-material-icon-theme` 的共享 key 迁移一次。

## 开发

```bash
npm ci
npm run verify     # check + eslint + node --test
npm test
npm run check
```

零 npm 运行时依赖（仅 eslint 作为开发依赖），`lib/client.js` 是手写经典脚本、无构建步骤。

仓库结构：

```
lib/index.js       # 宿主半边
lib/client.js      # 客户端半边（经典脚本 bundle）
locale/            # en/zh 插件页 meta
test/              # node --test
scripts/check.mjs  # 自检
.github/workflows/ # CI + Release
docs/              # README 截图
```

## 发版

见 [docs/release.md](docs/release.md)：staged publishing + trusted publishing，CI 只暂存，维护者用 2FA 批准后上线。

## 已知边界

1. 无点文件名（`Dockerfile`/`Makefile`/`Jenkinsfile`）无法被预览注册表认领，需要上游改。
2. 只认领 47 个精选后缀。
3. dotfile 默认被 Files 面板过滤（隐藏文件），需通过 `@` 引用或文件链接打开。

## 许可

MIT，见 [LICENSE](LICENSE)。
