/**
 * 浏览器里直接打开页面时的最小 bridge。
 *
 * WorkStudio 内由 preload 注入真正的 window.workStudio；这里只在缺失时
 * 提供一份内存实现，方便 `vite` 预览与截图，不影响宿主加载。
 */
import type { WorkStudioBridge } from '@work-studio/sdk';

const IMAGE =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop stop-color="#dbeafe"/><stop offset="1" stop-color="#fae8ff"/></linearGradient></defs>' +
      '<rect width="720" height="240" rx="18" fill="url(#g)"/>' +
      '<text x="360" y="128" text-anchor="middle" font-family="system-ui" font-size="28" fill="#334155">Markdown Editor</text>' +
      '</svg>',
  );

const SAMPLE = `---
title: Markdown 编辑器
tags: [demo, live-preview]
---

# Markdown 编辑器

这是一份用来验证 **Live Preview** 的示例文档。它同时包含了编辑、渲染、表格、任务、代码、数学公式和 Mermaid。

> 编辑和预览在同一个视图里：光标进入元素时显示源码，离开时恢复渲染。
>
> - 支持嵌套列表
> - 支持 **粗体**、*斜体*、~~删除线~~、\`行内代码\`
> - 支持 [外部链接](https://example.com) 与 [相对链接](./notes/other.md)

## 任务

- [ ] 做一个真正可用的 Markdown 编辑器
- [x] 选好底座：CodeMirror 6 + Live Preview
- [ ] 支持表格、图片、数学公式、Mermaid
- [ ] 支持中文输入法与撤销重做

## 图片

![示例图片](${IMAGE})

## 表格

| 能力 | 状态 | 说明 |
| :--- | :---: | ---: |
| 行内渲染 | 完成 | 粗体 / 斜体 / 代码 |
| 表格 | 完成 | 点击进入源码 |
| 数学 | 完成 | KaTeX |
| Mermaid | 完成 | 懒加载渲染 |

## 代码

~~~ts
interface Note {
  title: string;
  tags: string[];
}

export function createNote(title: string): Note {
  return { title, tags: [] };
}
~~~

## 数学

行内公式：$E = mc^2$，以及块级公式：

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Mermaid

~~~mermaid
flowchart LR
  A[Markdown] --> B[Lezer]
  B --> C[CodeMirror 6]
  C --> D[Live Preview]
~~~

## 其他

- Emoji：:smile: :rocket: :tada:
- 自动链接：<https://example.com>
- 分隔线：

---
`;

const SETTINGS_KEY = 'workstudio.markdown-editor.mock.settings';
const CONTENT_KEY = 'workstudio.markdown-editor.mock.content';

function storedContent(ref: string): string {
  try {
    return localStorage.getItem(`${CONTENT_KEY}:${ref}`) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function storedSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

const allowMock =
  location.protocol !== 'plugin:' && location.protocol !== 'work:';

if (!window.workStudio && allowMock) {
  const bridge = {
    async subscribe(domain: string, resource: string) {
      if (domain === 'workspace' && resource === 'registry') {
        return { current: { id: 'mock', name: 'Demo', path: '/demo' }, workspaces: [] };
      }
      if (domain === 'workspace') {
        const ref = resource;
        return [{ locator: ref, title: 'demo.md', text: storedContent(ref) }];
      }
      if (domain === 'markdown-editor' && resource === 'settings') {
        return storedSettings();
      }
      return null;
    },
    unsubscribe(_domain: string, _resource: string) {},
    async command(domain: string, _resource: string, action: string, input?: unknown) {
      const payload = (input ?? {}) as Record<string, unknown>;
      if (domain === 'markdown-editor') {
        if (action === 'save') {
          try {
            localStorage.setItem(
              `${CONTENT_KEY}:${String(payload['ref'] ?? '')}`,
              String(payload['content'] ?? ''),
            );
          } catch {
            // 忽略存储失败。
          }
          return { ok: true, data: { saved: true } };
        }
        if (action === 'readAsset') {
          return { ok: true, data: { dataUrl: IMAGE, mime: 'image/svg+xml' } };
        }
        if (action === 'writeImage') {
          return {
            ok: true,
            data: { path: `media/mock-${Date.now()}.png`, ref: '' },
          };
        }
        if (action === 'files') {
          return {
            ok: true,
            data: {
              files: [
                { name: 'other.md', path: 'notes/other.md', ref: 'file:///demo/notes/other.md', kind: 'markdown' },
                { name: 'demo.md', path: 'demo.md', ref: 'file:///demo/demo.md', kind: 'markdown' },
                { name: 'photo.png', path: 'media/photo.png', ref: 'file:///demo/media/photo.png', kind: 'image' },
              ],
            },
          };
        }
        if (action === 'set') {
          const next = { ...storedSettings(), ...payload };
          try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
          } catch {
            // 忽略存储失败。
          }
          return { ok: true, data: next };
        }
      }
      if (domain === 'shell') {
        return { ok: true, data: null };
      }
      return { ok: true, data: null };
    },
    notify(
      _domain: string,
      _resource: string,
      _action: string,
      _value?: unknown,
    ) {},
    onUpdate(_listener: (update: unknown) => void) {
      return () => {};
    },
  };
  window.workStudio = bridge as unknown as WorkStudioBridge;
  (window as unknown as { __workstudioMock?: boolean }).__workstudioMock = true;
}

export const mockMode = Boolean(
  (window as unknown as { __workstudioMock?: boolean }).__workstudioMock,
);
