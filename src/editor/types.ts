import type { EditorView } from '@codemirror/view';

export type ThemeMode = 'light' | 'dark';

export interface EditorSettings {
  /** 自动换行 */
  lineWrap: boolean;
  /** 正文字号 px */
  fontSize: number;
  /** 内容最大宽度 px */
  contentWidth: number;
  /** 拼写检查 */
  spellcheck: boolean;
  /** 显示行号 */
  lineNumbers: boolean;
  /** 显示右侧大纲 */
  showOutline: boolean;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  lineWrap: true,
  fontSize: 15,
  contentWidth: 880,
  spellcheck: false,
  lineNumbers: false,
  showOutline: true,
};

export interface FileEntry {
  name: string;
  path: string;
  ref: string;
  kind: 'markdown' | 'image' | 'video' | 'audio' | 'doc';
}

export interface MarkdownEditorOptions {
  parent: HTMLElement;
  value: string;
  theme: ThemeMode;
  settings: EditorSettings;
  onChange(markdown: string): void;
  onSave(): void;
  onUpdate?(view: EditorView): void;
  onTableDirty?(dirty: boolean): void;
  resolveImage(src: string, alt: string, title: string): Promise<string | null>;
  openImage(src: string, alt: string): void;
  openLink(href: string, event: MouseEvent): void;
  uploadImage(file: File): Promise<string | null>;
  listFiles(): Promise<FileEntry[]>;
  onStatus?(message: string, error?: boolean): void;
}

export interface MarkdownEditorHandle {
  view: EditorView;
  getValue(): string;
  setValue(markdown: string, options?: { addToHistory?: boolean }): void;
  focus(): void;
  destroy(): void;
  setSettings(settings: EditorSettings): void;
  setTheme(theme: ThemeMode): void;
  toggleSource(): void;
  isSource(): boolean;
}
