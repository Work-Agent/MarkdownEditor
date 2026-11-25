import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

export interface TextRange {
  from: number;
  to: number;
}

export function nodeText(state: EditorState, node: SyntaxNode): string {
  return state.doc.sliceString(node.from, node.to);
}

export function childrenOf(node: SyntaxNode, name: string): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) result.push(child);
  }
  return result;
}

export function firstChild(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

export function ancestorOf(
  node: SyntaxNode | null,
  names: ReadonlySet<string>,
): SyntaxNode | null {
  for (let current = node; current; current = current.parent) {
    if (names.has(current.name)) return current;
  }
  return null;
}

export function selectionTouches(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty) {
      if (range.head >= from && range.head <= to) return true;
    } else if (range.from < to && range.to > from) {
      return true;
    }
  }
  return false;
}

export function rangesIntersect(a: TextRange, b: TextRange): boolean {
  return a.from < b.to && a.to > b.from;
}

export function isInside(
  range: TextRange,
  containers: readonly TextRange[],
): boolean {
  return containers.some(
    (container) => range.from >= container.from && range.to <= container.to,
  );
}

export function lineRange(
  state: EditorState,
  from: number,
  to: number,
): TextRange {
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  return { from: first.from, to: last.to };
}

export function isLineOnly(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  if (first.number !== last.number) return false;
  const before = state.doc.sliceString(first.from, from);
  const after = state.doc.sliceString(to, first.to);
  return before.trim() === '' && after.trim() === '';
}

/**
 * YAML frontmatter：文档开头 `---`，到下一个 `---` / `...` 行。
 * 只识别前 500 行，避免把普通的水平线误判成 frontmatter。
 */
export function frontmatterRange(state: EditorState): TextRange | null {
  if (state.doc.lines < 2) return null;
  const first = state.doc.line(1);
  if (first.text.trim() !== '---') return null;
  const lastLine = Math.min(state.doc.lines, 500);
  for (let number = 2; number <= lastLine; number += 1) {
    const line = state.doc.line(number);
    if (line.text.trim() === '---' || line.text.trim() === '...') {
      return { from: first.from, to: line.to };
    }
  }
  return null;
}

/** 代码 / HTML / 表格等不应被行内渲染扫描的范围。 */
export function excludedRanges(state: EditorState): TextRange[] {
  const result: TextRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === 'FencedCode' ||
        node.name === 'CodeBlock' ||
        node.name === 'HTMLBlock'
      ) {
        result.push({ from: node.from, to: node.to });
        return false;
      }
      if (node.name === 'Table') {
        result.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
  });
  return result;
}

export function collectCodeRanges(state: EditorState): TextRange[] {
  const result: TextRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === 'FencedCode' ||
        node.name === 'CodeBlock' ||
        node.name === 'HTMLBlock' ||
        node.name === 'Table'
      ) {
        result.push({ from: node.from, to: node.to });
        return false;
      }
      if (node.name === 'InlineCode') {
        result.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
  });
  return result;
}

export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~#[\]()]/g, '')
    .replace(/\s+/g, '-');
}

export function isSafeHref(href: string): boolean {
  const value = href.trim().toLowerCase();
  return !(
    value.startsWith('javascript:') ||
    value.startsWith('vbscript:') ||
    value.startsWith('data:text/html')
  );
}
