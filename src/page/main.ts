import '@work-studio/sdk/global';
import './mock';
import 'katex/dist/katex.min.css';
import './style.css';

import { redo, undo } from '@codemirror/commands';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  createMarkdownEditor,
  DEFAULT_SETTINGS,
  type EditorSettings,
  type FileEntry,
  type MarkdownEditorHandle,
  type ThemeMode,
} from '../editor';
import {
  insertCodeBlock,
  insertImageMarkdown,
  insertMath,
  insertMermaid,
  insertTable,
  tableAddColumn,
  tableAddRow,
  tableRemoveColumn,
  tableRemoveRow,
  toggleBulletList,
  toggleHeading,
  toggleOrderedList,
  toggleQuote,
  toggleTaskList,
  toggleWrap,
} from '../editor/commands';
import { createToolbar } from './toolbar';

const bridge = window.workStudio;
const params = new URLSearchParams(location.search);
const ref = params.get('ref') ?? 'file:///demo.md';
const PLUGIN_ID = location.hostname || 'markdown-editor';
const isMock = Boolean(
  (window as unknown as { __workstudioMock?: boolean }).__workstudioMock,
);

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`缺少页面元素：${selector}`);
  return node;
}

const editorHost = el<HTMLDivElement>('#editor');
const outlineEl = el<HTMLDivElement>('#outline');
const outlineList = el<HTMLDivElement>('#outline-list');
const outlineClose = el<HTMLButtonElement>('#outline-close');
const toolbarHost = el<HTMLDivElement>('#toolbar');
const titleEl = el<HTMLDivElement>('#title');
const dirtyEl = el<HTMLSpanElement>('#dirty');
const saveButton = el<HTMLButtonElement>('#save');
const statusEl = el<HTMLSpanElement>('#status');
const countEl = el<HTMLSpanElement>('#count');
const conflictEl = el<HTMLDivElement>('#conflict');
const conflictReload = el<HTMLButtonElement>('#conflict-reload');
const conflictKeep = el<HTMLButtonElement>('#conflict-keep');
const lightbox = el<HTMLDivElement>('#lightbox');
const lightboxImage = el<HTMLImageElement>('#lightbox-image');
const lightboxClose = el<HTMLButtonElement>('#lightbox-close');
const imagePicker = el<HTMLInputElement>('#image-picker');

let editor = undefined as unknown as MarkdownEditorHandle;
let toolbar: ReturnType<typeof createToolbar> | null = null;
let settings: EditorSettings = { ...DEFAULT_SETTINGS };
let content = '';
let dirty = false;
let tableLocalDirty = false;
let saving = false;
let conflictText: string | null = null;
let workspaceRoot = '';
let filesCache: { at: number; files: FileEntry[] } | null = null;
let pendingImageInsert: ((path: string) => void) | null = null;
const assetCache = new Map<string, Promise<string | null>>();

interface OutlineItem {
  level: number;
  text: string;
  from: number;
}

let outlineItems: OutlineItem[] = [];
let outlineKey: string | null = null;
let outlineFrame = 0;

function fileName(value: string): string {
  const tail = value.split(/[/?#]/).filter(Boolean).pop() ?? 'Markdown';
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

function setStatus(text: string, error = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', error);
}

function updateDirty(): void {
  const hasChanges = dirty || tableLocalDirty;
  dirtyEl.textContent = hasChanges ? '● 未保存' : '';
  saveButton.classList.toggle('is-primary', hasChanges);
  saveButton.disabled = saving;
  document.title = `${dirty ? '● ' : ''}${fileName(ref)}`;
}

function countText(text: string): string {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latin = text
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
    .match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const lines = text === '' ? 0 : text.split('\n').length;
  return `${cjk + latin} 字 · ${text.length} 字符 · ${lines} 行`;
}

function extractText(snapshot: unknown): string | null {
  if (Array.isArray(snapshot)) {
    for (const item of snapshot) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { text?: unknown }).text === 'string'
      ) {
        return (item as { text: string }).text;
      }
    }
    return null;
  }
  if (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    typeof (snapshot as { text?: unknown }).text === 'string'
  ) {
    return (snapshot as { text: string }).text;
  }
  return null;
}

function showConflict(): void {
  conflictEl.hidden = conflictText === null;
}

function applySnapshot(snapshot: unknown, options: { force?: boolean } = {}): void {
  const text = extractText(snapshot);
  if (text === null) return;
  if ((!dirty && !tableLocalDirty) || options.force) {
    editor.setValue(text, { addToHistory: false });
    content = text;
    dirty = false;
    tableLocalDirty = false;
    conflictText = null;
    showConflict();
    updateDirty();
    setStatus('已加载');
    return;
  }
  if (text === content && !tableLocalDirty) {
    dirty = false;
    conflictText = null;
    showConflict();
    updateDirty();
    setStatus('已保存');
    return;
  }
  conflictText = text;
  showConflict();
  setStatus('文件已在外部更新', true);
}

async function save(): Promise<void> {
  if (saving) return;
  content = editor.getValue();
  saving = true;
  updateDirty();
  setStatus('保存中…');
  try {
    const result = await bridge.command<{ saved: boolean }>(
      'markdown-editor',
      'markdown-editor',
      'save',
      { ref, content },
    );
    if (!result.ok) throw new Error(result.error.message);
    dirty = false;
    tableLocalDirty = false;
    conflictText = null;
    showConflict();
    updateDirty();
    setStatus('已保存');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    saving = false;
    updateDirty();
  }
}

function resolveRef(src: string): string | null {
  let clean = src.trim();
  if (!clean) return null;
  if (clean.startsWith('#')) return null;
  if (clean.startsWith('file://')) return clean;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  try {
    clean = decodeURI(clean);
  } catch {
    // 保留原值。
  }
  clean = clean.replace(/^\/+/, '');
  try {
    return new URL(clean, ref).href;
  } catch {
    return null;
  }
}

function resolveImage(
  src: string,
  _alt: string,
  _title: string,
): Promise<string | null> {
  if (/^(https?:|data:|blob:|plugin:)/i.test(src)) {
    return Promise.resolve(src);
  }
  const key = `${ref}\u0000${src}`;
  const cached = assetCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const target = resolveRef(src);
    if (!target) return null;
    const result = await bridge.command<{ dataUrl: string }>(
      'markdown-editor',
      'markdown-editor',
      'readAsset',
      { ref: target },
    );
    return result.ok ? result.data.dataUrl : null;
  })().catch(() => null);
  assetCache.set(key, promise);
  return promise;
}

function openImage(src: string, alt: string): void {
  void resolveImage(src, alt, '').then((url) => {
    if (!url) {
      setStatus('图片加载失败', true);
      return;
    }
    lightboxImage.src = url;
    lightboxImage.alt = alt;
    lightbox.hidden = false;
    lightboxClose.focus();
  });
}

function closeLightbox(): void {
  lightbox.hidden = true;
  lightboxImage.removeAttribute('src');
  editor?.focus();
}

function hash(value: string): string {
  let h = 0;
  for (let index = 0; index < value.length; index += 1) {
    h = (h * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(h).toString(36);
}

async function openWeb(url: string): Promise<void> {
  const result = await bridge.command('shell', 'views', 'open', {
    id: `web:${hash(url)}`,
    type: 'web',
    title: url,
    url,
  });
  if (!result.ok) setStatus(result.error.message, true);
}

async function openMarkdown(target: string): Promise<void> {
  const hashIndex = target.indexOf('#');
  const anchor = hashIndex >= 0 ? target.slice(hashIndex + 1) : '';
  const clean = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const opened = await bridge.command('workspace', 'registry', 'openRef', {
    ref: clean,
  });
  if (!opened.ok) {
    setStatus(opened.error.message, true);
    return;
  }
  const query = `ref=${encodeURIComponent(clean)}${
    anchor ? `&anchor=${encodeURIComponent(anchor)}` : ''
  }`;
  const url = `plugin://${PLUGIN_ID}/content?${query}`;
  const result = await bridge.command('shell', 'views', 'open', {
    id: `md:${hash(target)}`,
    type: 'page',
    title: fileName(clean),
    url,
  });
  if (!result.ok) setStatus(result.error.message, true);
}

function pathOfRef(target: string): string | null {
  try {
    const url = new URL(target);
    if (url.protocol !== 'file:') return null;
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
    return path;
  } catch {
    return null;
  }
}

function openLink(href: string, _event: MouseEvent): void {
  const value = href.trim();
  if (!value) return;
  if (/^(javascript:|vbscript:|data:text\/html)/i.test(value)) {
    setStatus('不支持的链接协议', true);
    return;
  }
  if (value.startsWith('#')) {
    scrollToAnchor(value.slice(1));
    return;
  }
  if (/^(https?:|mailto:|tel:)/i.test(value)) {
    void openWeb(value);
    return;
  }
  if (
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]|$)/i.test(value) &&
    !/\.(md|markdown|mdown|mkd|png|jpe?g|gif|webp|avif|svg|bmp|ico|mp4|webm|mov|mp3|wav|ogg|oga|weba|pdf)([?#]|$)/i.test(
      value,
    )
  ) {
    void openWeb(`https://${value}`);
    return;
  }
  const target = value.startsWith('file://') ? value : resolveRef(value);
  if (!target) {
    setStatus(`无法解析链接：${value}`, true);
    return;
  }
  const clean = target.split(/[?#]/)[0] ?? target;
  if (/\.(md|markdown|mdown|mkd)$/i.test(clean)) {
    void openMarkdown(target);
    return;
  }
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(clean)) {
    openImage(value, fileName(value));
    return;
  }
  const path = pathOfRef(target);
  if (path) {
    void bridge
      .command('shell', 'native', 'openPath', { path })
      .then((result) => {
        if (!result.ok) setStatus(result.error.message, true);
      });
    return;
  }
  setStatus(`无法打开：${value}`, true);
}

function scrollToAnchor(anchor: string): void {
  const text = editor.getValue();
  let decoded = anchor;
  try {
    decoded = decodeURIComponent(anchor);
  } catch {
    // 保留原始值。
  }
  const target = decoded.toLowerCase();
  let offset = 0;
  for (const line of text.split('\n')) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      const slug = (match[2] ?? '')
        .trim()
        .toLowerCase()
        .replace(/[`*_~#[\]()]/g, '')
        .replace(/\s+/g, '-');
      if (slug === target || (match[2] ?? '').trim().toLowerCase() === target) {
        editor.view.dispatch({
          selection: EditorSelection.cursor(offset),
          scrollIntoView: true,
        });
        editor.focus();
        return;
      }
    }
    offset += line.length + 1;
  }
  setStatus(`找不到锚点：${anchor}`, true);
}

function fallbackRoot(): string {
  try {
    const url = new URL('.', ref);
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
    return path;
  } catch {
    return '';
  }
}

async function loadWorkspaceRoot(): Promise<string> {
  if (workspaceRoot) return workspaceRoot;
  try {
    const snapshot = (await bridge.subscribe('workspace', 'registry')) as {
      current?: { path?: string };
    } | null;
    workspaceRoot = snapshot?.current?.path ?? '';
    bridge.unsubscribe('workspace', 'registry');
  } catch {
    workspaceRoot = '';
  }
  if (!workspaceRoot) workspaceRoot = fallbackRoot();
  return workspaceRoot;
}

async function listFiles(): Promise<FileEntry[]> {
  if (filesCache && Date.now() - filesCache.at < 15_000) {
    return filesCache.files;
  }
  const root = await loadWorkspaceRoot();
  if (!root) return [];
  const result = await bridge.command<{ files: FileEntry[] }>(
    'markdown-editor',
    'markdown-editor',
    'files',
    { root, limit: 600 },
  );
  if (!result.ok) return [];
  const files = result.data.files ?? [];
  filesCache = { at: Date.now(), files };
  return files;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file: File): Promise<string | null> {
  setStatus(`正在写入 ${file.name || '图片'}…`);
  const data = await fileToDataUrl(file);
  const result = await bridge.command<{ path: string }>(
    'markdown-editor',
    'markdown-editor',
    'writeImage',
    {
      ref,
      name: file.name || 'image.png',
      mime: file.type || 'image/png',
      data,
    },
  );
  if (!result.ok) {
    setStatus(result.error.message, true);
    return null;
  }
  setStatus('图片已写入 media/');
  return result.data.path;
}

function pickImage(): void {
  pendingImageInsert = (path) => {
    if (editor) insertImageMarkdown(editor.view, path);
  };
  imagePicker.click();
}

imagePicker.addEventListener('change', () => {
  const file = imagePicker.files?.[0];
  imagePicker.value = '';
  if (!file) return;
  const insert = pendingImageInsert;
  pendingImageInsert = null;
  void uploadImage(file).then((path) => {
    if (!path) return;
    if (insert) insert(path);
    else editor.focus();
  });
});

function cleanHeadingText(source: string): string {
  return source
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function collectOutline(view: EditorView): OutlineItem[] {
  const lines = view.state.doc.toString().split('\n');
  const items: OutlineItem[] = [];
  let frontmatterEnd = -1;
  if ((lines[0] ?? '').trim() === '---') {
    const limit = Math.min(lines.length - 1, 500);
    for (let index = 1; index <= limit; index += 1) {
      const line = (lines[index] ?? '').trim();
      if (line === '---' || line === '...') {
        frontmatterEnd = index;
        break;
      }
    }
  }

  let fence: string | null = null;
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (index <= frontmatterEnd) {
      offset += line.length + 1;
      continue;
    }

    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? '`')[0] ?? '`';
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      offset += line.length + 1;
      continue;
    }
    if (fence) {
      offset += line.length + 1;
      continue;
    }

    const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (atx) {
      const text = cleanHeadingText(atx[2] ?? '');
      items.push({ level: (atx[1] ?? '#').length, text, from: offset });
    } else {
      const next = lines[index + 1] ?? '';
      if (line.trim() && /^=+\s*$/.test(next)) {
        items.push({ level: 1, text: cleanHeadingText(line), from: offset });
      } else if (line.trim() && /^-{3,}\s*$/.test(next)) {
        items.push({ level: 2, text: cleanHeadingText(line), from: offset });
      }
    }
    offset += line.length + 1;
  }

  return items;
}

function updateOutlineActive(view: EditorView): void {
  if (outlineEl.hidden || outlineItems.length === 0) return;
  const head = view.state.selection.main.head;
  let activeFrom = -1;
  for (const item of outlineItems) {
    if (item.from <= head) activeFrom = item.from;
  }
  for (const button of outlineList.querySelectorAll<HTMLButtonElement>('.md-outline-item')) {
    button.classList.toggle(
      'is-active',
      Number(button.dataset['from'] ?? -1) === activeFrom,
    );
  }
}

function renderOutline(view: EditorView): void {
  if (outlineEl.hidden) return;
  const key = view.state.doc.toString();
  if (key === outlineKey) {
    updateOutlineActive(view);
    return;
  }
  outlineKey = key;
  outlineItems = collectOutline(view);
  outlineList.textContent = '';
  if (outlineItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'md-outline-empty';
    empty.textContent = '暂无标题';
    outlineList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of outlineItems) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'md-outline-item';
    button.dataset['from'] = String(item.from);
    button.style.setProperty('--outline-level', String(item.level - 1));
    button.textContent = item.text || '(无标题)';
    button.title = item.text;
    button.addEventListener('click', () => {
      editor.view.dispatch({
        selection: { anchor: item.from },
        scrollIntoView: true,
      });
      editor.focus();
    });
    fragment.appendChild(button);
  }
  outlineList.appendChild(fragment);
  updateOutlineActive(view);
}

function scheduleOutline(view: EditorView): void {
  if (outlineEl.hidden) return;
  if (outlineFrame) cancelAnimationFrame(outlineFrame);
  outlineFrame = requestAnimationFrame(() => {
    outlineFrame = 0;
    renderOutline(view);
  });
}

function setOutlineVisible(visible: boolean): void {
  outlineEl.hidden = !visible;
  toolbarHost
    .querySelector<HTMLElement>('[data-action="outline"]')
    ?.classList.toggle('is-active', visible);
  if (visible && editor) scheduleOutline(editor.view);
}

function toggleOutline(): void {
  const visible = !settings.showOutline;
  settings = { ...settings, showOutline: visible };
  setOutlineVisible(visible);
  void bridge
    .command('markdown-editor', 'settings', 'set', { showOutline: visible })
    .then((result) => {
      if (!result.ok) setStatus(result.error.message, true);
    });
}

function applySettings(next: unknown): void {
  const source =
    typeof next === 'object' && next !== null
      ? (next as Record<string, unknown>)
      : {};
  settings = {
    lineWrap:
      typeof source['lineWrap'] === 'boolean'
        ? source['lineWrap']
        : DEFAULT_SETTINGS.lineWrap,
    fontSize:
      typeof source['fontSize'] === 'number'
        ? Math.max(11, Math.min(24, source['fontSize']))
        : DEFAULT_SETTINGS.fontSize,
    contentWidth:
      typeof source['contentWidth'] === 'number'
        ? Math.max(520, Math.min(1400, source['contentWidth']))
        : DEFAULT_SETTINGS.contentWidth,
    spellcheck:
      typeof source['spellcheck'] === 'boolean'
        ? source['spellcheck']
        : DEFAULT_SETTINGS.spellcheck,
    lineNumbers:
      typeof source['lineNumbers'] === 'boolean'
        ? source['lineNumbers']
        : DEFAULT_SETTINGS.lineNumbers,
    showOutline:
      typeof source['showOutline'] === 'boolean'
        ? source['showOutline']
        : DEFAULT_SETTINGS.showOutline,
  };
  editor?.setSettings(settings);
  setOutlineVisible(settings.showOutline);
}

const initialHostTheme = document.documentElement.dataset['theme'];
let hostTheme: ThemeMode | null =
  initialHostTheme === 'dark' || initialHostTheme === 'light'
    ? initialHostTheme
    : null;
let currentTheme: ThemeMode = 'light';

function preferredTheme(): ThemeMode {
  if (hostTheme) return hostTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(): void {
  const theme = preferredTheme();
  currentTheme = theme;
  document.documentElement.dataset['theme'] = theme;
  editor?.setTheme(theme);
}

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', applyTheme);
const themeObserver = new MutationObserver(() => {
  const value = document.documentElement.dataset['theme'];
  if (value !== 'dark' && value !== 'light') return;
  if (value === currentTheme) return;
  hostTheme = value;
  currentTheme = value;
  editor?.setTheme(value);
});
themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

function createActions(): Parameters<typeof createToolbar>[1] {
  return {
    undo: () => {
      undo(editor.view);
      editor.focus();
    },
    redo: () => {
      redo(editor.view);
      editor.focus();
    },
    bold: () => {
      toggleWrap(editor.view, '**');
    },
    italic: () => {
      toggleWrap(editor.view, '*');
    },
    strike: () => {
      toggleWrap(editor.view, '~~');
    },
    code: () => {
      toggleWrap(editor.view, '`');
    },
    link: () => {
      insertLinkView();
    },
    image: () => pickImage(),
    heading: (level) => {
      toggleHeading(editor.view, level);
    },
    bullet: () => {
      toggleBulletList(editor.view);
    },
    ordered: () => {
      toggleOrderedList(editor.view);
    },
    task: () => {
      toggleTaskList(editor.view);
    },
    quote: () => {
      toggleQuote(editor.view);
    },
    codeBlock: () => {
      insertCodeBlock(editor.view);
    },
    math: () => {
      insertMath(editor.view);
    },
    mermaid: () => {
      insertMermaid(editor.view);
    },
    outline: () => {
      toggleOutline();
    },
    tableInsert: () => {
      insertTable(editor.view);
    },
    tableAddRow: () => {
      tableAddRow(editor.view);
    },
    tableAddColumn: () => {
      tableAddColumn(editor.view);
    },
    tableRemoveRow: () => {
      tableRemoveRow(editor.view);
    },
    tableRemoveColumn: () => {
      tableRemoveColumn(editor.view);
    },
    save: () => {
      void save();
    },
  };
}

function insertLinkView(): void {
  const view = editor.view;
  const range = view.state.selection.main;
  if (range.empty) {
    const text = '[链接文本](https://)';
    const from = range.from + text.lastIndexOf('https://');
    view.dispatch({
      changes: { from: range.from, insert: text },
      selection: EditorSelection.range(from, from + 'https://'.length),
      scrollIntoView: true,
    });
  } else {
    const selected = view.state.sliceDoc(range.from, range.to);
    const text = `[${selected}](https://)`;
    const from = range.from + text.lastIndexOf('https://');
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: EditorSelection.range(from, from + 'https://'.length),
      scrollIntoView: true,
    });
  }
  view.focus();
}

async function boot(): Promise<void> {
  titleEl.textContent = fileName(ref);
  document.title = fileName(ref);
  applyTheme();

  let initial: unknown = null;
  try {
    initial = await bridge.subscribe('workspace', ref);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
  const initialText = extractText(initial) ?? '';
  content = initialText;

  editor = createMarkdownEditor({
    parent: editorHost,
    value: initialText,
    theme: preferredTheme(),
    settings,
    onChange(markdown) {
      content = markdown;
      dirty = true;
      updateDirty();
      if (!isMock) setStatus('未保存');
    },
    onSave: () => {
      void save();
    },
    onTableDirty(value) {
      tableLocalDirty = value;
      updateDirty();
    },
    onUpdate(view) {
      toolbar?.update(view);
      countEl.textContent = countText(view.state.doc.toString());
      scheduleOutline(view);
      updateOutlineActive(view);
    },
    resolveImage,
    openImage,
    openLink,
    uploadImage,
    listFiles,
    onStatus: (message, error) => setStatus(message, error),
  });

  toolbar = createToolbar(toolbarHost, createActions());
  toolbar.update(editor.view);
  updateDirty();
  countEl.textContent = countText(editor.getValue());
  setOutlineVisible(settings.showOutline);
  scheduleOutline(editor.view);

  saveButton.addEventListener('click', () => {
    void save();
  });

  outlineClose.addEventListener('click', () => {
    if (settings.showOutline) toggleOutline();
  });

  conflictReload.addEventListener('click', () => {
    void bridge
      .subscribe('workspace', ref)
      .then((snapshot) => applySnapshot(snapshot, { force: true }))
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : String(error), true);
      });
  });
  conflictKeep.addEventListener('click', () => {
    conflictText = null;
    showConflict();
    setStatus('保留当前修改');
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) {
      event.stopPropagation();
      closeLightbox();
    }
  });

  try {
    const nextSettings = await bridge.subscribe('markdown-editor', 'settings');
    applySettings(nextSettings);
  } catch {
    applySettings(settings);
  }

  const offUpdate = bridge.onUpdate((update) => {
    if (update.domain === 'workspace' && update.resource === ref) {
      if (update.type === 'snapshot') applySnapshot(update.data);
      return;
    }
    if (update.domain === 'markdown-editor' && update.resource === 'settings') {
      applySettings(update.data);
    }
  });

  window.addEventListener('beforeunload', () => {
    offUpdate();
    themeObserver.disconnect();
    mediaQuery.removeEventListener('change', applyTheme);
    bridge.unsubscribe('workspace', ref);
    bridge.unsubscribe('markdown-editor', 'settings');
    editor.destroy();
  });

  const anchor = params.get('anchor');
  if (anchor) {
    requestAnimationFrame(() => scrollToAnchor(anchor));
  }

  if (isMock && !initialText) {
    setStatus('浏览器预览模式：保存只写入 localStorage');
  } else {
    setStatus('就绪');
  }
}

void boot();
