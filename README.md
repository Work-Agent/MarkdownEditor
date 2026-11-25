# Markdown Editor

WorkStudio 的 Markdown 编辑器插件：**CodeMirror 6 + 自研 Live Preview**。
编辑和预览在同一视图里，没有独立的预览面板：光标离开元素时渲染，进入元素时显示源码。

## 功能

- **实时渲染**：标题、粗体 / 斜体 / 删除线、行内代码、引用、列表、任务列表
- **块级渲染**：GFM 表格、图片 / 视频 / 音频、KaTeX 数学公式、Mermaid 图表、分隔线、YAML frontmatter
- **Mermaid 渲染器**：使用 Obsidian 官方的 [Pele](https://github.com/obsidianmd/pele) 同步渲染 SVG，CSS 变量跟随主题，不再加载 Mermaid 的异步 chunks
- **直接编辑**：代码块保留源码文本，光标进入时显示围栏，离开时隐藏围栏并保留高亮
- **表格**：渲染态单元格可直接编辑；表格工具条支持 `+行` / `+列` / `−行` / `−列` / `源码` / `完成`；`Tab` / `Shift+Tab` 切换单元格，`Enter` 下移一行
- **链接**：`Cmd/Ctrl+Click` 打开；相对 `.md` 链接在新标签页打开并支持 `#anchor` 跳转；外链在应用内 web 标签打开；支持 `[[wiki]]`、`<autolink>`、`mailto:` 与裸域名
- **图片**：相对路径经插件命令读取为 data URL；点击放大，`Cmd/Ctrl+Click` 或双击进入源码
- **粘贴 / 拖入图片**：写入文档同级的 `media/` 目录，插入 `![](media/...)`
- **链接补全**：在 `[text](` 后补全工作区文件；输入 `:` 补全 emoji
- **代码块复制**：代码块右上角提供 Copy 按钮
- **中文输入法**：composition 期间不重建装饰，避免闪烁
- **源码逃生口**：`Cmd/Ctrl+/` 临时显示全部源码；再按一次恢复 Live Preview
- **主题**：跟随 WorkStudio / 系统浅色与深色主题
- **大纲**：右侧标题导航，自动跟随当前标题；点击跳转；可在设置或工具栏开关；窄窗口下作为浮层
- **保存**：脏态、外部更新冲突提示、`Cmd/Ctrl+S`

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
```

`pnpm build` 生成：

```text
dist/page/index.html
dist/settings/index.html
dist/engine.js
dist/assets/...
commands.json
api.json
api.d.ts
```

依赖全部打包进 `dist`，安装时不需要执行 npm。

## 安装

把整个仓库目录作为本地插件安装到 WorkStudio，或 `pnpm build` 后打 zip 安装。

约定：

- `workstudio.id`: `markdown-editor`
- claims: `.md` / `.markdown` / `.mdown` / `.mkd`
- 内容页：`dist/page/index.html`
- 设置页：`dist/settings/index.html`
- 引擎：`dist/engine.js`
- 技能：`skills/markdown-editor/SKILL.md`

## 命令

| 命令 | 入参 | 说明 |
| --- | --- | --- |
| `markdown-editor.save` | `ref`, `content` | 保存 Markdown 并通知 `workspace` 订阅者 |
| `markdown-editor.readAsset` | `ref` | 读取工作区图片 / 媒体，返回 data URL |
| `markdown-editor.writeImage` | `ref`, `name`, `mime`, `data` | 把 base64 图片写入文档同级 `media/` |
| `markdown-editor.files` | `root`, `query?`, `limit?` | 列出工作区 Markdown / 媒体文件，供链接补全 |

`commands.json` / `api.json` / `api.d.ts` 由 `workstudio-plugin` 从 `definePlugin` 生成，不手写。

## 设置

设置保存在插件数据目录：

- 自动换行
- 正文字号（11–24px）
- 内容宽度（520–1400px）
- 拼写检查
- 显示行号
- 显示大纲

## 快捷键

| 快捷键 | 动作 |
| --- | --- |
| `Cmd/Ctrl+S` | 保存 |
| `Cmd/Ctrl+B` / `I` | 粗体 / 斜体 |
| `Cmd/Ctrl+Shift+X` | 删除线 |
| `Cmd/Ctrl+E` | 行内代码 |
| `Cmd/Ctrl+K` | 链接 |
| `Cmd/Ctrl+T` | 插入表格 |
| `Cmd/Ctrl+Y` | 插入任务 |
| `Cmd/Ctrl+Shift+M` | 数学公式 |
| `Cmd/Ctrl+Shift+K` | 代码块 |
| `Cmd/Ctrl+Shift+I` | Mermaid |
| `Cmd/Ctrl+/` | 切换源码 / Live Preview |
| `Tab` / `Shift+Tab` | 表格单元格切换 |
| `Enter` | 表格下移一行；列表 / 引用自动续写 |
| `Cmd/Ctrl+A` | 表格内先选中当前单元格 |
| `Cmd/Ctrl+Shift+↑/↓` | 上移 / 下移当前行 |

## 结构

```text
src/
├── engine.ts                  # definePlugin：资源适配器 + 命令
├── editor/
│   ├── index.ts               # 编辑器工厂与适配层
│   ├── commands.ts            # 工具栏 / 快捷键命令
│   ├── table.ts               # 表格解析、序列化与单元格导航
│   ├── autocomplete.ts        # 链接 / emoji 补全
│   ├── upload.ts              # 粘贴 / 拖入图片
│   ├── theme.ts               # CM6 主题与代码高亮
│   ├── keymap.ts              # 快捷键
│   └── live-preview/
│       ├── inline.ts          # 行内标记、任务、图片、链接、Emoji
│       ├── block.ts           # 表格、Mermaid/Pele、块级数学、分隔线
│       ├── widgets.ts         # CM6 WidgetType
│       └── helpers.ts         # 语法树 / 选区 / frontmatter 工具
├── page/
│   ├── index.html
│   ├── main.ts                # 资源订阅、保存、冲突、图片、链接
│   ├── toolbar.ts             # 工具栏
│   ├── mock.ts                # 浏览器预览用的内存 bridge
│   └── style.css
└── settings/                  # 插件设置页
```

## 已知边界

- 表格支持单元格直接编辑；复杂表格操作仍以源码为准。
- 外链默认在 WorkStudio 的 web 标签打开；`mailto:` / `tel:` 也走同一入口，具体行为由宿主决定。
- 参考式链接 / 脚注 / 原始 HTML 块保持源码显示，不做 HTML 渲染。
- Pele 目标语法是 Mermaid 12.1.0；布局与视觉风格和 Mermaid 不完全一致，12.2/12.3 的新特性需要回归测试。
- Markdown 的语义由 Lezer 解析；复杂嵌套列表、HTML 与自定义扩展可能需要继续补规则。
- 图片通过 data URL 传给页面，超大图片受 24MB 限制。
