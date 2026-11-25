import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

export type Align = 'left' | 'right' | 'center' | null;

export interface TableData {
  headers: string[];
  alignments: Align[];
  rows: string[][];
}

export interface TableLocation {
  from: number;
  to: number;
  firstLine: number;
  lastLine: number;
  data: TableData;
}

export interface CellLocation {
  from: number;
  to: number;
  line: number;
  index: number;
  empty: boolean;
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  if (line.trimStart().startsWith('|')) cells.shift();
  if (line.trimEnd().endsWith('|')) cells.pop();
  return cells.map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function separatorCells(line: string): string[] | null {
  const cells = splitRow(line);
  if (cells.length === 0) return null;
  const normalized = cells.map((cell) => cell.replace(/\s+/g, ''));
  if (!normalized.every((cell) => /^:?-{1,}:?$/.test(cell))) return null;
  return normalized;
}

function alignmentOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return null;
}

export function parseTable(source: string): TableData | null {
  const lines = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line, index, all) => line.trim() !== '' || index < all.length - 1);
  if (lines.length < 2) return null;
  const headers = splitRow(lines[0] ?? '');
  const separator = separatorCells(lines[1] ?? '');
  if (!separator || headers.length === 0) return null;
  const alignments: Align[] = [];
  for (let index = 0; index < headers.length; index += 1) {
    alignments.push(alignmentOf(separator[index] ?? '---'));
  }
  const rows: string[][] = [];
  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') continue;
    const cells = splitRow(line);
    const row: string[] = [];
    for (let column = 0; column < headers.length; column += 1) {
      row.push(cells[column] ?? '');
    }
    rows.push(row);
  }
  return { headers, alignments, rows };
}

function alignmentCell(align: Align): string {
  if (align === 'left') return ':---';
  if (align === 'right') return '---:';
  if (align === 'center') return ':---:';
  return '---';
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function serializeTable(data: TableData): string {
  const width = Math.max(1, data.headers.length);
  const header = Array.from({ length: width }, (_, index) =>
    escapeCell(data.headers[index] ?? ''),
  );
  const align = Array.from({ length: width }, (_, index) =>
    alignmentCell(data.alignments[index] ?? null),
  );
  const rows = data.rows.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index] ?? '')),
  );
  return [
    `| ${header.join(' | ')} |`,
    `| ${align.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function tableAt(
  state: EditorState,
  pos: number,
): TableLocation | null {
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = tree.resolveInner(pos, -1);
  while (node && node.name !== 'Table') node = node.parent;
  if (!node) return null;
  const data = parseTable(state.doc.sliceString(node.from, node.to));
  if (!data) return null;
  const firstLine = state.doc.lineAt(node.from).number;
  const lastLine = state.doc.lineAt(node.to).number;
  return {
    from: state.doc.lineAt(node.from).from,
    to: state.doc.lineAt(node.to).to,
    firstLine,
    lastLine,
    data,
  };
}

function rowCells(line: string): Array<{ from: number; to: number; empty: boolean }> {
  const result: Array<{ from: number; to: number; empty: boolean }> = [];
  let segmentStart = 0;
  let escaped = false;
  const push = (start: number, end: number): void => {
    let from = start;
    let to = end;
    while (from < to && /\s/.test(line[from] ?? '')) from += 1;
    while (to > from && /\s/.test(line[to - 1] ?? '')) to -= 1;
    result.push({ from, to, empty: from === to });
  };
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '|') {
      push(segmentStart, index);
      segmentStart = index + 1;
    }
  }
  push(segmentStart, line.length);
  if (line.trimStart().startsWith('|')) result.shift();
  if (line.trimEnd().endsWith('|')) result.pop();
  return result;
}

export function cellAt(state: EditorState, pos: number): CellLocation | null {
  const table = tableAt(state, pos);
  if (!table) return null;
  const line = state.doc.lineAt(pos);
  if (line.number === table.firstLine + 1) return null;
  const cells = rowCells(line.text);
  if (cells.length === 0) return null;
  const relative = pos - line.from;
  let index = cells.findIndex((cell) => relative <= cell.to);
  if (index < 0) index = cells.length - 1;
  const cell = cells[index]!;
  return {
    from: line.from + cell.from,
    to: line.from + cell.to,
    line: line.number,
    index,
    empty: cell.empty,
  };
}

function nextNavigableLine(
  state: EditorState,
  table: TableLocation,
  line: number,
  direction: 1 | -1,
): number | null {
  let target = line + direction;
  while (
    (direction > 0 && target <= table.lastLine) ||
    (direction < 0 && target >= table.firstLine)
  ) {
    if (target !== table.firstLine + 1) return target;
    target += direction;
  }
  return null;
}

export function nextCell(
  state: EditorState,
  pos: number,
  direction: 1 | -1 = 1,
): CellLocation | null {
  const table = tableAt(state, pos);
  if (!table) return null;
  const cell = cellAt(state, pos);
  if (!cell) return null;
  const line = state.doc.line(cell.line);
  const cells = rowCells(line.text);
  const nextIndex = cell.index + direction;
  if (nextIndex >= 0 && nextIndex < cells.length) {
    const target = cells[nextIndex]!;
    return {
      from: line.from + target.from,
      to: line.from + target.to,
      line: cell.line,
      index: nextIndex,
      empty: target.empty,
    };
  }
  const targetLine = nextNavigableLine(state, table, cell.line, direction);
  if (targetLine == null) return null;
  const target = state.doc.line(targetLine);
  const targetCells = rowCells(target.text);
  if (targetCells.length === 0) return null;
  const index = direction > 0 ? 0 : targetCells.length - 1;
  const targetCell = targetCells[index]!;
  return {
    from: target.from + targetCell.from,
    to: target.from + targetCell.to,
    line: targetLine,
    index,
    empty: targetCell.empty,
  };
}

export function nextRowCell(
  state: EditorState,
  pos: number,
): CellLocation | null {
  const table = tableAt(state, pos);
  if (!table) return null;
  const cell = cellAt(state, pos);
  if (!cell) return null;
  const targetLine = nextNavigableLine(state, table, cell.line, 1);
  if (targetLine == null) return null;
  const line = state.doc.line(targetLine);
  const cells = rowCells(line.text);
  const target = cells[Math.min(cell.index, cells.length - 1)];
  if (!target) return null;
  return {
    from: line.from + target.from,
    to: line.from + target.to,
    line: targetLine,
    index: cell.index,
    empty: target.empty,
  };
}

export function addRow(data: TableData): TableData {
  return {
    ...data,
    rows: [...data.rows, data.headers.map(() => '')],
  };
}

export function addColumn(data: TableData): TableData {
  return {
    headers: [...data.headers, ''],
    alignments: [...data.alignments, null],
    rows: data.rows.map((row) => [...row, '']),
  };
}

export function removeRow(data: TableData): TableData {
  if (data.rows.length === 0) return data;
  return { ...data, rows: data.rows.slice(0, -1) };
}

export function removeColumn(data: TableData): TableData {
  if (data.headers.length <= 1) return data;
  return {
    headers: data.headers.slice(0, -1),
    alignments: data.alignments.slice(0, -1),
    rows: data.rows.map((row) => row.slice(0, -1)),
  };
}
