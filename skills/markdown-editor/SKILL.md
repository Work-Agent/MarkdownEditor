---
name: markdown-editor
description: 编辑和保存工作区中的 Markdown 文档，处理图片、表格、代码块、数学公式与 Mermaid。
---

# Markdown 编辑器

插件 id：`markdown-editor`。资源适配器认领 `.md` / `.markdown` / `.mdown` / `.mkd`。

## 读取

Markdown 通过 `workspace/<ref>` 的资源快照读取：

```ts
const snapshot = await window.workStudio.subscribe('workspace', ref);
// [{ locator: ref, title: '...', text: '完整 Markdown' }]
```

Agent 侧直接读取资源即可；页面拿到的是同一份全文。

## 保存

```ts
await window.workStudio.command('markdown-editor', 'markdown-editor', 'save', {
  ref: 'file:///path/to/note.md',
  content: '# 新内容\n',
});
```

保存会写入文件并 `ctx.changed(ref, 'content')`，所有订阅者会收到新快照。

## 资源

```ts
// 读取图片 / 视频 / 音频，返回 data URL
await window.workStudio.command('markdown-editor', 'markdown-editor', 'readAsset', {
  ref: 'file:///path/to/media/photo.png',
});

// 写入 base64 图片到文档同级 media/
await window.workStudio.command('markdown-editor', 'markdown-editor', 'writeImage', {
  ref: 'file:///path/to/note.md',
  name: 'photo.png',
  mime: 'image/png',
  data: 'iVBORw0KGgo...',
});

// 列出工作区文件，供链接补全
await window.workStudio.command('markdown-editor', 'markdown-editor', 'files', {
  root: '/path/to/workspace',
  limit: 600,
});
```

## 编辑约定

- 文档原文是唯一事实源。页面只通过 CodeMirror decoration 渲染，不在渲染层改写 Markdown。
- 图片粘贴默认写成 `![name](media/<timestamp>-<name>.png)`。
- 渲染态表格的单元格可直接编辑；表格的 `+行` / `+列` / `−行` / `−列` / `源码` / `完成` 都在表格 widget 工具条里。
- 相对链接与图片路径相对于当前 Markdown 文件解析。
- 外部链接用 `shell/views.open` 打开；相对 `.md` 链接先 `workspace/registry.openRef`，再以 `plugin://markdown-editor/content?ref=...` 打开新标签页。
- 支持 `Cmd/Ctrl+S`、`Cmd/Ctrl+B`、`Cmd/Ctrl+I`、`Cmd/Ctrl+K`、`Cmd/Ctrl+/`。
