import { completionKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap,
  historyKeymap,
  indentWithTab,
  moveLineDown,
  moveLineUp,
} from '@codemirror/commands';
import { markdownKeymap } from '@codemirror/lang-markdown';
import { searchKeymap } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import {
  insertCodeBlock,
  insertLink,
  insertMath,
  insertMermaid,
  insertTable,
  insertTask,
  tableEnterCell,
  tableNextCell,
  tableSelectCell,
  toggleBulletList,
  toggleHeading,
  toggleOrderedList,
  toggleQuote,
  toggleTaskList,
  toggleWrap,
} from './commands';

export interface KeymapOptions {
  onSave(): void;
  onToggleSource(): void;
}

export function createKeymap(options: KeymapOptions) {
  return keymap.of([
    {
      key: 'Mod-s',
      run: () => {
        options.onSave();
        return true;
      },
    },
    { key: 'Mod-b', run: (view) => toggleWrap(view, '**') },
    { key: 'Mod-i', run: (view) => toggleWrap(view, '*') },
    { key: 'Mod-Shift-x', run: (view) => toggleWrap(view, '~~') },
    { key: 'Mod-e', run: (view) => toggleWrap(view, '`') },
    { key: 'Mod-k', run: (view) => insertLink(view) },
    { key: 'Mod-t', run: (view) => insertTable(view) },
    { key: 'Mod-y', run: (view) => insertTask(view) },
    { key: 'Mod-Shift-m', run: (view) => insertMath(view) },
    { key: 'Mod-Shift-k', run: (view) => insertCodeBlock(view) },
    { key: 'Mod-Shift-i', run: (view) => insertMermaid(view) },
    { key: 'Mod-Shift-7', run: (view) => toggleOrderedList(view) },
    { key: 'Mod-Shift-8', run: (view) => toggleBulletList(view) },
    { key: 'Mod-Shift-9', run: (view) => toggleQuote(view) },
    { key: 'Mod-Shift-l', run: (view) => toggleTaskList(view) },
    { key: 'Mod-Alt-1', run: (view) => toggleHeading(view, 1) },
    { key: 'Mod-Alt-2', run: (view) => toggleHeading(view, 2) },
    { key: 'Mod-Alt-3', run: (view) => toggleHeading(view, 3) },
    { key: 'Mod-Alt-0', run: (view) => toggleHeading(view, 0) },
    { key: 'Mod-Shift-ArrowUp', run: (view) => moveLineUp(view) },
    { key: 'Mod-Shift-ArrowDown', run: (view) => moveLineDown(view) },
    {
      key: 'Mod-/',
      run: () => {
        options.onToggleSource();
        return true;
      },
    },
    { key: 'Tab', run: (view) => tableNextCell(view, 1) },
    { key: 'Shift-Tab', run: (view) => tableNextCell(view, -1) },
    { key: 'Enter', run: (view) => tableEnterCell(view) },
    { key: 'Mod-a', run: (view) => tableSelectCell(view) },
    ...markdownKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...completionKeymap,
    indentWithTab,
  ]);
}
