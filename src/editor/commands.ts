import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import {
  addColumn,
  addRow,
  cellAt,
  nextCell,
  nextRowCell,
  removeColumn,
  removeRow,
  serializeTable,
  tableAt,
} from './table';

export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  heading: number;
  bullet: boolean;
  ordered: boolean;
  task: boolean;
  quote: boolean;
  table: boolean;
}

function lineChanges(
  state: EditorState,
  transform: (line: string, index: number) => string | null,
): ChangeSpec | null {
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (let number = first.number; number <= last.number; number += 1) {
    const line = state.doc.line(number);
    const next = transform(line.text, number - first.number);
    if (next === null || next === line.text) continue;
    changes.push({ from: line.from, to: line.to, insert: next });
  }
  return changes.length > 0 ? changes : null;
}

function dispatchChanges(
  view: EditorView,
  changes: ChangeSpec,
  selection?: EditorSelection | SelectionRange,
): void {
  const spec =
    selection === undefined
      ? undefined
      : 'ranges' in selection
        ? selection
        : EditorSelection.create([selection]);
  view.dispatch({
    changes,
    ...(spec ? { selection: spec } : {}),
    scrollIntoView: true,
  });
  view.focus();
}

export function toggleWrap(
  view: EditorView,
  before: string,
  after = before,
): boolean {
  const result = view.state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: { from: range.from, insert: before + after },
        range: EditorSelection.cursor(range.from + before.length),
      };
    }
    const text = view.state.sliceDoc(range.from, range.to);
    if (
      text.startsWith(before) &&
      text.endsWith(after) &&
      text.length >= before.length + after.length
    ) {
      const inner = text.slice(before.length, text.length - after.length);
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(
          range.from,
          range.from + inner.length,
        ),
      };
    }
    return {
      changes: { from: range.from, to: range.to, insert: before + text + after },
      range: EditorSelection.range(
        range.from + before.length,
        range.to + before.length,
      ),
    };
  });
  dispatchChanges(view, result.changes, result.selection);
  return true;
}

export function toggleHeading(view: EditorView, level: number): boolean {
  const range = view.state.selection.main;
  const first = view.state.doc.lineAt(range.from);
  const last = view.state.doc.lineAt(range.to);
  let allSame = true;
  for (let number = first.number; number <= last.number; number += 1) {
    const text = view.state.doc.line(number).text;
    if (level === 0) {
      if (/^#{1,6}\s+/.test(text)) allSame = false;
    } else if (!new RegExp(`^#{${level}}\\s+`).test(text)) {
      allSame = false;
    }
  }
  const changes = lineChanges(view.state, (line) => {
    const stripped = line.replace(/^#{1,6}\s+/, '');
    if (allSame) return stripped;
    if (level === 0) return stripped;
    return `${'#'.repeat(level)} ${stripped}`;
  });
  if (!changes) return false;
  dispatchChanges(view, changes);
  return true;
}

function togglePrefix(view: EditorView, prefix: string): boolean {
  const first = view.state.doc.lineAt(view.state.selection.main.from);
  const last = view.state.doc.lineAt(view.state.selection.main.to);
  let allHave = true;
  for (let number = first.number; number <= last.number; number += 1) {
    if (!view.state.doc.line(number).text.startsWith(prefix)) {
      allHave = false;
      break;
    }
  }
  const changes = lineChanges(view.state, (line) => {
    if (allHave) return line.slice(prefix.length);
    return line.startsWith(prefix) ? line : prefix + line;
  });
  if (!changes) return false;
  dispatchChanges(view, changes);
  return true;
}

export function toggleBulletList(view: EditorView): boolean {
  return togglePrefix(view, '- ');
}

export function toggleOrderedList(view: EditorView): boolean {
  return togglePrefix(view, '1. ');
}

export function toggleQuote(view: EditorView): boolean {
  return togglePrefix(view, '> ');
}

export function toggleTaskList(view: EditorView): boolean {
  const first = view.state.doc.lineAt(view.state.selection.main.from);
  const last = view.state.doc.lineAt(view.state.selection.main.to);
  const task = /^(\s*)[-*+]\s+\[[ xX]\]\s+/;
  let allTask = true;
  for (let number = first.number; number <= last.number; number += 1) {
    if (!task.test(view.state.doc.line(number).text)) {
      allTask = false;
      break;
    }
  }
  const changes = lineChanges(view.state, (line) => {
    if (allTask) return line.replace(task, '$1');
    if (task.test(line)) return line;
    return '- [ ] ' + line;
  });
  if (!changes) return false;
  dispatchChanges(view, changes);
  return true;
}

export function insertTask(view: EditorView): boolean {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  if (line.text.trim() === '') {
    dispatchChanges(view, {
      from: line.from,
      to: line.to,
      insert: '- [ ] ',
    });
  } else {
    dispatchChanges(view, {
      from: line.to,
      insert: '\n- [ ] ',
    });
  }
  return true;
}

export function insertLink(view: EditorView): boolean {
  const range = view.state.selection.main;
  if (range.empty) {
    const text = '[链接文本](url)';
    dispatchChanges(view, { from: range.from, insert: text }, EditorSelection.range(
      range.from + text.indexOf('url'),
      range.from + text.indexOf('url') + 3,
    ));
    return true;
  }
  const selected = view.state.sliceDoc(range.from, range.to);
  const text = `[${selected}](url)`;
  dispatchChanges(view, { from: range.from, to: range.to, insert: text }, EditorSelection.range(
    range.from + text.lastIndexOf('url'),
    range.from + text.lastIndexOf('url') + 3,
  ));
  return true;
}

export function insertImageMarkdown(
  view: EditorView,
  path: string,
  alt = '图片',
): boolean {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const before = view.state.sliceDoc(line.from, range.from);
  const after = view.state.sliceDoc(range.to, line.to);
  const image = `![${alt}](${path})`;
  const prefix = before.trim() === '' ? '' : '\n\n';
  const suffix = after.trim() === '' ? '\n' : '\n\n';
  const text = prefix + image + suffix;
  dispatchChanges(
    view,
    { from: range.from, to: range.to, insert: text },
    EditorSelection.cursor(range.from + prefix.length + image.length),
  );
  return true;
}

export function insertCodeBlock(view: EditorView, language = ''): boolean {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const fence = '```';
  const body = selected || '';
  const text = `${fence}${language}\n${body}\n${fence}`;
  const selection = body
    ? EditorSelection.cursor(range.from + text.length)
    : EditorSelection.cursor(range.from + fence.length + language.length + 1);
  dispatchChanges(view, { from: range.from, to: range.to, insert: text }, selection);
  return true;
}

export function insertMath(view: EditorView, display = false): boolean {
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  if (display) {
    const text = `$$\n${selected || 'x = y'}\n$$`;
    dispatchChanges(view, { from: range.from, to: range.to, insert: text }, EditorSelection.cursor(
      range.from + 3 + (selected ? selected.length : 5),
    ));
  } else {
    const text = `$${selected || 'x = y'}$`;
    dispatchChanges(view, { from: range.from, to: range.to, insert: text }, EditorSelection.cursor(
      range.from + text.length,
    ));
  }
  return true;
}

export function insertMermaid(view: EditorView): boolean {
  const range = view.state.selection.main;
  const text = '```mermaid\nflowchart TD\n  A[开始] --> B[结束]\n```';
  dispatchChanges(view, { from: range.from, to: range.to, insert: text }, EditorSelection.cursor(
    range.from + '```mermaid\n'.length,
  ));
  return true;
}

export function insertTable(view: EditorView): boolean {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const table = '|  |  |\n| --- | --- |\n|  |  |';
  const insert = line.text.trim() === '' ? table : `\n${table}`;
  const from = line.text.trim() === '' ? line.from : line.to;
  const to = line.text.trim() === '' ? line.to : line.to;
  const selection = EditorSelection.cursor(from + (insert.startsWith('\n') ? 1 : 0) + 2);
  dispatchChanges(view, { from, to, insert }, selection);
  return true;
}

function replaceTable(
  view: EditorView,
  table: NonNullable<ReturnType<typeof tableAt>>,
  data: typeof table.data,
): void {
  const text = serializeTable(data);
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: text },
    scrollIntoView: true,
  });
  view.focus();
}

export function tableAddRow(view: EditorView): boolean {
  const table = tableAt(view.state, view.state.selection.main.head);
  if (!table) return false;
  replaceTable(view, table, addRow(table.data));
  return true;
}

export function tableAddColumn(view: EditorView): boolean {
  const table = tableAt(view.state, view.state.selection.main.head);
  if (!table) return false;
  replaceTable(view, table, addColumn(table.data));
  return true;
}

export function tableRemoveRow(view: EditorView): boolean {
  const table = tableAt(view.state, view.state.selection.main.head);
  if (!table) return false;
  replaceTable(view, table, removeRow(table.data));
  return true;
}

export function tableRemoveColumn(view: EditorView): boolean {
  const table = tableAt(view.state, view.state.selection.main.head);
  if (!table) return false;
  replaceTable(view, table, removeColumn(table.data));
  return true;
}

export function tableNextCell(
  view: EditorView,
  direction: 1 | -1 = 1,
): boolean {
  const target =
    direction > 0
      ? nextCell(view.state, view.state.selection.main.head, 1)
      : nextCell(view.state, view.state.selection.main.head, -1);
  if (target) {
    view.dispatch({
      selection: EditorSelection.range(target.from, target.to),
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }
  if (direction > 0) {
    const table = tableAt(view.state, view.state.selection.main.head);
    if (table) {
      const data = addRow(table.data);
      const rowIndex = data.rows.length - 1;
      const text = serializeTable(data);
      view.dispatch({
        changes: { from: table.from, to: table.to, insert: text },
        selection: EditorSelection.cursor(
          table.from + text.lastIndexOf('\n') + 3,
        ),
        scrollIntoView: true,
      });
      view.focus();
      return true;
    }
  }
  return false;
}

export function tableEnterCell(view: EditorView): boolean {
  const target = nextRowCell(view.state, view.state.selection.main.head);
  if (target) {
    view.dispatch({
      selection: EditorSelection.range(target.from, target.to),
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }
  const table = tableAt(view.state, view.state.selection.main.head);
  if (!table) return false;
  const data = addRow(table.data);
  const text = serializeTable(data);
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: text },
    selection: EditorSelection.cursor(table.from + text.lastIndexOf('\n') + 3),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export function tableSelectCell(view: EditorView): boolean {
  const cell = cellAt(view.state, view.state.selection.main.head);
  if (!cell) return false;
  const selection = view.state.selection.main;
  if (selection.from === cell.from && selection.to === cell.to) return false;
  view.dispatch({
    selection: EditorSelection.range(cell.from, cell.to),
  });
  return true;
}

export function getActiveFormats(state: EditorState): ActiveFormats {
  const pos = state.selection.main.head;
  const names = new Set<string>();
  let node = syntaxTree(state).resolveInner(pos, -1);
  for (let current: typeof node | null = node; current; current = current.parent) {
    names.add(current.name);
  }
  let heading = 0;
  for (let level = 1; level <= 6; level += 1) {
    if (names.has(`ATXHeading${level}`) || names.has(`SetextHeading${level}`)) {
      heading = level;
      break;
    }
  }
  return {
    bold: names.has('StrongEmphasis'),
    italic: names.has('Emphasis'),
    strike: names.has('Strikethrough'),
    code:
      names.has('InlineCode') ||
      names.has('FencedCode') ||
      names.has('CodeBlock'),
    heading,
    bullet: names.has('BulletList'),
    ordered: names.has('OrderedList'),
    task: names.has('Task'),
    quote: names.has('Blockquote'),
    table: names.has('Table'),
  };
}

export function selectedText(view: EditorView): string {
  return view.state.sliceDoc(
    view.state.selection.main.from,
    view.state.selection.main.to,
  );
}

export function replaceSelection(
  view: EditorView,
  text: string,
  selection?: SelectionRange,
): void {
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    ...(selection ? { selection: EditorSelection.create([selection]) } : {}),
    scrollIntoView: true,
  });
}
