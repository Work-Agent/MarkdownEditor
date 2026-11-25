import { RangeSet, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import {
  ancestorOf,
  childrenOf,
  collectCodeRanges,
  firstChild,
  frontmatterRange,
  isInside,
  nodeText,
  selectionTouches,
  type TextRange,
} from './helpers';
import { EMOJI } from './emoji';
import {
  CopyButtonWidget,
  EmojiWidget,
  ImageWidget,
  LinkWidget,
  MathWidget,
  TaskWidget,
} from './widgets';
import type { LivePreviewOptions } from './options';

interface InlineState {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
}

interface ParsedLink {
  text: string;
  url: string;
  title: string;
}

function parseLink(raw: string): ParsedLink | null {
  const wiki = raw.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (wiki) {
    const target = (wiki[1] ?? '').trim();
    const text = (wiki[2] ?? target).trim();
    return {
      text,
      url: /\.(md|markdown|mdown|mkd)$/i.test(target) ? target : `${target}.md`,
      title: 'Wiki 链接',
    };
  }
  const match = raw.match(
    /^\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["']([^"']*)["'])?\s*\)$/,
  );
  if (!match) return null;
  const url = (match[2] ?? '').replace(/^<|>$/g, '');
  if (!url) return null;
  return { text: match[1] ?? '', url, title: match[3] ?? '' };
}

function parseAutolink(raw: string): ParsedLink | null {
  const match = raw.match(/^<([a-z][a-z0-9+.-]*:[^>]+)>$/i);
  if (!match) return null;
  const url = match[1] ?? '';
  return { text: url.replace(/^mailto:/, ''), url, title: '' };
}

function parseImage(raw: string): ParsedLink | null {
  const match = raw.match(
    /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["']([^"']*)["'])?\s*\)$/,
  );
  if (!match) return null;
  const url = (match[2] ?? '').replace(/^<|>$/g, '');
  if (!url) return null;
  return { text: match[1] ?? '', url, title: match[3] ?? '' };
}

function mark(node: SyntaxNode, className: string): Range<Decoration> {
  return Decoration.mark({ class: className }).range(node.from, node.to);
}

function contentRange(
  node: SyntaxNode,
  marks: readonly SyntaxNode[],
): TextRange | null {
  if (marks.length < 2) return null;
  const first = marks[0];
  const last = marks[marks.length - 1];
  if (!first || !last) return null;
  return { from: first.to, to: last.from };
}

function addLineClasses(
  view: EditorView,
  node: SyntaxNode,
  className: string,
  decorations: Range<Decoration>[],
): void {
  const state = view.state;
  const first = state.doc.lineAt(node.from);
  const last = state.doc.lineAt(node.to);
  for (let number = first.number; number <= last.number; number += 1) {
    const line = state.doc.line(number);
    decorations.push(Decoration.line({ class: className }).range(line.from));
  }
}

function buildInline(
  view: EditorView,
  options: LivePreviewOptions,
): InlineState {
  const state = view.state;
  const decorations: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const fm = frontmatterRange(state);
  const codeRanges = collectCodeRanges(state);
  if (fm) codeRanges.push(fm);

  const addReplace = (from: number, to: number, widget: Decoration): void => {
    const range = widget.range(from, to);
    decorations.push(range);
    atomic.push(range);
  };

  if (fm) {
    const first = state.doc.lineAt(fm.from);
    const last = state.doc.lineAt(fm.to);
    for (let number = first.number; number <= last.number; number += 1) {
      const line = state.doc.line(number);
      decorations.push(
        Decoration.line({ class: 'cm-md-frontmatter' }).range(line.from),
      );
    }
  }

  const ranges =
    view.visibleRanges.length > 0
      ? view.visibleRanges
      : [{ from: 0, to: state.doc.length }];
  const visibleFrom = Math.min(...ranges.map((range) => range.from));
  const visibleTo = Math.max(...ranges.map((range) => range.to));
  const from = Math.max(0, visibleFrom - 200);
  const to = Math.min(state.doc.length, visibleTo + 200);

  // 只遍历一次。不能按 visibleRanges 逐段 iterate：第二次进入 Document
  // 时会被去重逻辑提前截断，导致后半个文档的 Emoji / 链接 / 图片漏掉。
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (fm && node.from >= fm.from && node.to <= fm.to) return false;

      const current = node.node;
      const active = selectionTouches(state, node.from, node.to);

        switch (node.name) {
          case 'FencedCode': {
            addLineClasses(view, current, 'cm-md-code-line', decorations);
            const marks = childrenOf(current, 'CodeMark');
            const info = firstChild(current, 'CodeInfo');
            if (!active) {
              for (const marker of marks) addReplace(marker.from, marker.to, Decoration.replace({}));
              if (info) addReplace(info.from, info.to, Decoration.replace({}));
            }
            const codeText = firstChild(current, 'CodeText');
            const code = codeText
              ? state.doc.sliceString(codeText.from, codeText.to).replace(/\n$/, '')
              : '';
            decorations.push(
              Decoration.widget({
                widget: new CopyButtonWidget(code),
                side: -1,
              }).range(node.from),
            );
            return false;
          }

          case 'CodeBlock': {
            addLineClasses(view, current, 'cm-md-code-line', decorations);
            return false;
          }

          case 'Table': {
            addLineClasses(view, current, 'cm-md-table-source', decorations);
            return false;
          }

          case 'HorizontalRule': {
            decorations.push(
              Decoration.line({ class: 'cm-md-hr-source' }).range(
                state.doc.lineAt(node.from).from,
              ),
            );
            return false;
          }

          case 'HTMLBlock': {
            addLineClasses(view, current, 'cm-md-html-block', decorations);
            return false;
          }

          case 'ATXHeading1':
          case 'ATXHeading2':
          case 'ATXHeading3':
          case 'ATXHeading4':
          case 'ATXHeading5':
          case 'ATXHeading6': {
            const level = node.name.slice(-1);
            addLineClasses(view, current, `cm-md-h${level}`, decorations);
            return undefined;
          }

          case 'SetextHeading1':
          case 'SetextHeading2': {
            const level = node.name.slice(-1);
            const first = state.doc.lineAt(node.from);
            decorations.push(
              Decoration.line({ class: `cm-md-h${level}` }).range(first.from),
            );
            const underline = firstChild(current, 'HeaderMark');
            if (underline) {
              const line = state.doc.lineAt(underline.from);
              decorations.push(
                Decoration.line({
                  class: 'cm-md-setext-underline',
                }).range(line.from),
              );
            }
            return undefined;
          }

          case 'Blockquote': {
            addLineClasses(view, current, 'cm-md-quote', decorations);
            return undefined;
          }

          case 'HeaderMark': {
            const parent = current.parent;
            if (parent && parent.name.startsWith('ATXHeading') && !active) {
              let end = node.to;
              while (state.doc.sliceString(end, end + 1) === ' ') end += 1;
              addReplace(node.from, end, Decoration.replace({}));
            }
            return false;
          }

          case 'QuoteMark': {
            const quote = ancestorOf(current, new Set(['Blockquote']));
            if (quote && !active) {
              let end = node.to;
              while (state.doc.sliceString(end, end + 1) === ' ') end += 1;
              addReplace(node.from, end, Decoration.replace({}));
            }
            return false;
          }

          case 'ListMark': {
            decorations.push(mark(current, 'cm-md-list-mark'));
            return false;
          }

          case 'InlineCode': {
            const marks = childrenOf(current, 'CodeMark');
            if (!active) {
              for (const marker of marks) addReplace(marker.from, marker.to, Decoration.replace({}));
            }
            const range = contentRange(current, marks);
            if (range) {
              decorations.push(
                Decoration.mark({ class: 'cm-md-inline-code' }).range(
                  range.from,
                  range.to,
                ),
              );
            } else {
              decorations.push(mark(current, 'cm-md-inline-code'));
            }
            return false;
          }

          case 'StrongEmphasis':
          case 'Emphasis':
          case 'Strikethrough': {
            const markName =
              node.name === 'StrongEmphasis'
                ? 'EmphasisMark'
                : node.name === 'Emphasis'
                  ? 'EmphasisMark'
                  : 'StrikethroughMark';
            const className =
              node.name === 'StrongEmphasis'
                ? 'cm-md-strong'
                : node.name === 'Emphasis'
                  ? 'cm-md-em'
                  : 'cm-md-strike';
            const marks = childrenOf(current, markName);
            if (!active) {
              for (const marker of marks) addReplace(marker.from, marker.to, Decoration.replace({}));
            }
            const range = contentRange(current, marks);
            if (range) {
              decorations.push(
                Decoration.mark({ class: className }).range(range.from, range.to),
              );
            }
            return undefined;
          }

          case 'Link': {
            const link = parseLink(nodeText(state, current));
            if (!link) return false;
            if (!active) {
              addReplace(
                node.from,
                node.to,
                Decoration.replace({
                  widget: new LinkWidget(
                    link.text,
                    link.url,
                    link.title,
                    node.from,
                    options,
                  ),
                }),
              );
              return false;
            }
            const marks = childrenOf(current, 'LinkMark');
            const range = contentRange(current, marks.length >= 2 ? marks.slice(0, 2) : marks);
            if (range) {
              decorations.push(
                Decoration.mark({ class: 'cm-md-link' }).range(
                  range.from,
                  range.to,
                ),
              );
            }
            const url = firstChild(current, 'URL');
            if (url) decorations.push(mark(url, 'cm-md-url'));
            return false;
          }

          case 'Autolink': {
            const link = parseAutolink(nodeText(state, current));
            if (!link) return false;
            if (!active) {
              addReplace(
                node.from,
                node.to,
                Decoration.replace({
                  widget: new LinkWidget(
                    link.text,
                    link.url,
                    link.title,
                    node.from,
                    options,
                  ),
                }),
              );
              return false;
            }
            const url = firstChild(current, 'URL');
            if (url) decorations.push(mark(url, 'cm-md-url'));
            return false;
          }

          case 'Image': {
            if (active) return false;
            const image = parseImage(nodeText(state, current));
            if (!image) return false;
            addReplace(
              node.from,
              node.to,
              Decoration.replace({
                widget: new ImageWidget(
                  image.url,
                  image.text,
                  image.title,
                  node.from,
                  options,
                ),
              }),
            );
            return false;
          }

          case 'TaskMarker': {
            if (active) return false;
            const checked = nodeText(state, current).toLowerCase().includes('x');
            addReplace(
              node.from,
              node.to,
              Decoration.replace({
                widget: new TaskWidget(checked, node.from, options),
              }),
            );
            return false;
          }

          case 'Emoji': {
            if (active) return false;
            const name = nodeText(state, current).slice(1, -1);
            const emoji = EMOJI[name];
            if (!emoji) return false;
            addReplace(
              node.from,
              node.to,
              Decoration.replace({ widget: new EmojiWidget(emoji) }),
            );
            return false;
          }

          case 'HTMLTag': {
            decorations.push(mark(current, 'cm-md-html'));
            return false;
          }

          default:
            return undefined;
        }
      },
  });

  // 行内数学：$...$。跳过代码块、行内代码、表格、HTML。
  for (const visible of ranges) {
    const from = Math.max(0, visible.from - 200);
    const to = Math.min(state.doc.length, visible.to + 200);
    const text = state.doc.sliceString(from, to);
    const regex = /(^|[^\\$])\$([^$\n]+?)\$(?!\$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const prefix = match[1] ?? '';
      const source = (match[2] ?? '').trim();
      if (!source) continue;
      const start = from + match.index + prefix.length;
      const end = start + (match[0].length - prefix.length);
      if (end <= start) continue;
      if (isInside({ from: start, to: end }, codeRanges)) continue;
      if (selectionTouches(state, start, end)) continue;
      addReplace(
        start,
        end,
        Decoration.replace({
          widget: new MathWidget(source, false, start, options),
        }),
      );
    }
  }

  return {
    decorations: Decoration.set(decorations, true),
    atomic: RangeSet.of(atomic, true),
  };
}

class InlinePreviewPlugin {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
  private readonly compositionEnd: () => void;

  constructor(private readonly view: EditorView, private readonly options: LivePreviewOptions) {
    const state = buildInline(view, options);
    this.decorations = state.decorations;
    this.atomic = state.atomic;
    this.compositionEnd = () => {
      const next = buildInline(this.view, this.options);
      this.decorations = next.decorations;
      this.atomic = next.atomic;
      this.view.requestMeasure();
    };
    this.view.contentDOM.addEventListener('compositionend', this.compositionEnd);
  }

  update(update: ViewUpdate): void {
    if (update.view.composing) return;
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.transactions.some((transaction) => transaction.reconfigured)
    ) {
      const next = buildInline(update.view, this.options);
      this.decorations = next.decorations;
      this.atomic = next.atomic;
    }
  }

  destroy(): void {
    this.view.contentDOM.removeEventListener('compositionend', this.compositionEnd);
  }
}

export function inlinePreview(options: LivePreviewOptions): {
  extension: Extension;
  atomic: Extension;
} {
  const plugin = ViewPlugin.fromClass(
    class extends InlinePreviewPlugin {
      constructor(view: EditorView) {
        super(view, options);
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
  return {
    extension: plugin,
    // 只把 replace / widget 的范围设为原子；mark 装饰不能进去，
    // 否则方向键无法在加粗文本内部移动。
    atomic: EditorView.atomicRanges.of(
      (view) => view.plugin(plugin)?.atomic ?? RangeSet.empty,
    ),
  };
}
