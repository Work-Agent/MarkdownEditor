import {
  RangeSet,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import {
  firstChild,
  frontmatterRange,
  isInside,
  lineRange,
  selectionTouches,
  type TextRange,
} from './helpers';
import { HrWidget, MathWidget, MermaidWidget, TableWidget } from './widgets';
import { parseTable } from '../table';
import type { LivePreviewOptions } from './options';

interface BlockState {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
}

function linePrefixIsBlank(textBefore: string): boolean {
  return textBefore.trim() === '';
}

function addBlock(
  state: import('@codemirror/state').EditorState,
  from: number,
  to: number,
  widget: import('@codemirror/view').WidgetType,
  decorations: Range<Decoration>[],
  atomic: Range<Decoration>[],
): void {
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  if (
    !linePrefixIsBlank(state.doc.sliceString(first.from, from)) ||
    !linePrefixIsBlank(state.doc.sliceString(to, last.to))
  ) {
    return;
  }
  const range = lineRange(state, from, to);
  const decoration = Decoration.replace({ widget, block: true }).range(
    range.from,
    range.to,
  );
  decorations.push(decoration);
  atomic.push(decoration);
}

function buildBlock(
  state: import('@codemirror/state').EditorState,
  options: LivePreviewOptions,
): BlockState {
  const decorations: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const fm = frontmatterRange(state);
  const excluded: TextRange[] = [];
  const occupied: TextRange[] = [];
  if (fm) excluded.push(fm);

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        excluded.push({ from: node.from, to: node.to });
      }
      if (node.name === 'Table') {
        excluded.push({ from: node.from, to: node.to });
        return false;
      }
      if (node.name === 'HTMLBlock') {
        excluded.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
  });

  syntaxTree(state).iterate({
    enter(node) {
      if (fm && node.from >= fm.from && node.to <= fm.to) return false;
      const active = selectionTouches(state, node.from, node.to);

      if (node.name === 'Table') {
        if (active) return false;
        const raw = state.doc.sliceString(node.from, node.to);
        const data = parseTable(raw);
        if (!data) return false;
        const first = state.doc.lineAt(node.from);
        const last = state.doc.lineAt(node.to);
        addBlock(
          state,
          node.from,
          node.to,
          new TableWidget(raw, data, first.from, last.to, options),
          decorations,
          atomic,
        );
        occupied.push({ from: node.from, to: node.to });
        return false;
      }

      if (node.name === 'FencedCode') {
        const info = firstChild(node.node, 'CodeInfo');
        const language = info
          ? state.doc.sliceString(info.from, info.to).trim().toLowerCase()
          : '';
        if (language !== 'mermaid' && language !== 'math') return false;
        const codeText = firstChild(node.node, 'CodeText');
        const source = codeText
          ? state.doc.sliceString(codeText.from, codeText.to).replace(/\n$/, '')
          : '';
        if (active) {
          occupied.push({ from: node.from, to: node.to });
          return false;
        }
        if (language === 'mermaid') {
          addBlock(
            state,
            node.from,
            node.to,
            new MermaidWidget(source, node.from, options),
            decorations,
            atomic,
          );
        } else {
          addBlock(
            state,
            node.from,
            node.to,
            new MathWidget(source.trim(), true, node.from, options),
            decorations,
            atomic,
          );
        }
        occupied.push({ from: node.from, to: node.to });
        return false;
      }

      if (node.name === 'HorizontalRule') {
        if (active) return false;
        addBlock(
          state,
          node.from,
          node.to,
          new HrWidget(node.from, options),
          decorations,
          atomic,
        );
        return false;
      }

      return undefined;
    },
  });

  // $$...$$ 块级数学。Lezer 的 Markdown 解析器不识别数学，需要在
  // 代码 / 表格 / HTML / frontmatter 之外单独扫描。
  const text = state.doc.toString();
  const patterns = [
    /(^|\n)([ \t]*\$\$[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\$\$[ \t]*)(?=\r?\n|$)/g,
    /(^|\n)([ \t]*\$\$([^\n$]+?)\$\$[ \t]*)(?=\r?\n|$)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const lead = match[1] ?? '';
      const raw = match[2] ?? '';
      const source = (match[3] ?? '').trim();
      if (!source) continue;
      const from = match.index + lead.length;
      const to = from + raw.length;
      const range = { from, to };
      if (isInside(range, excluded) || isInside(range, occupied)) continue;
      if (selectionTouches(state, from, to)) continue;
      addBlock(
        state,
        from,
        to,
        new MathWidget(source, true, from, options),
        decorations,
        atomic,
      );
      occupied.push(range);
    }
  }

  return {
    decorations: Decoration.set(decorations, true),
    atomic: RangeSet.of(atomic, true),
  };
}

export function blockPreview(options: LivePreviewOptions): {
  extension: Extension;
} {
  const field = StateField.define<BlockState>({
    create(state) {
      return buildBlock(state, options);
    },
    update(value, transaction) {
      if (
        transaction.docChanged ||
        transaction.selection ||
        transaction.reconfigured
      ) {
        return buildBlock(transaction.state, options);
      }
      return value;
    },
  });

  return {
    extension: [
      field,
      EditorView.decorations.compute([field], (state) => state.field(field).decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
    ],
  };
}
