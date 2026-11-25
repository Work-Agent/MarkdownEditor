import {
  Compartment,
  EditorState,
  Transaction,
} from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { history } from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion } from '@codemirror/autocomplete';
import { search } from '@codemirror/search';
import { livePreview, type LivePreviewOptions } from './live-preview';
import { editorTheme, highlightTheme } from './theme';
import { createKeymap } from './keymap';
import { linkCompletion, emojiCompletion } from './autocomplete';
import { uploadExtensions } from './upload';
import { serializeTable, type TableData } from './table';
import type {
  EditorSettings,
  MarkdownEditorHandle,
  MarkdownEditorOptions,
  ThemeMode,
} from './types';

function applyCssSettings(
  parent: HTMLElement,
  settings: EditorSettings,
): void {
  parent.style.setProperty('--md-font-size', `${Math.max(11, Math.min(24, settings.fontSize))}px`);
  parent.style.setProperty(
    '--md-content-width',
    `${Math.max(520, Math.min(1400, settings.contentWidth))}px`,
  );
}

export function createMarkdownEditor(
  options: MarkdownEditorOptions,
): MarkdownEditorHandle {
  const parent = options.parent;
  const themeCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  const lineNumbersCompartment = new Compartment();
  const spellcheckCompartment = new Compartment();
  const livePreviewCompartment = new Compartment();

  let settings = { ...options.settings };
  let theme = options.theme;
  let sourceMode = false;
  let applying = false;
  const viewRef: { current: EditorView | null } = { current: null };

  const reveal = (pos: number): void => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      selection: { anchor: Math.max(0, Math.min(pos, view.state.doc.length)) },
      scrollIntoView: true,
    });
    view.focus();
  };

  const liveOptions: LivePreviewOptions = {
    theme,
    onReveal: reveal,
    onLinkClick: (href, event) => options.openLink(href, event),
    onImageClick: (src, alt) => options.openImage(src, alt),
    resolveImage: (src, alt, title) => options.resolveImage(src, alt, title),
    onToggleTask: (pos, checked) => {
      const view = viewRef.current;
      if (!view) return;
      const from = Math.max(0, Math.min(pos, view.state.doc.length - 3));
      const current = view.state.sliceDoc(from, from + 3);
      if (!/^\[[ xX]\]$/.test(current)) return;
      view.dispatch({
        changes: { from, to: from + 3, insert: checked ? '[x]' : '[ ]' },
      });
      view.focus();
    },
    onTableCommit: (from, to, data: TableData, reveal = false) => {
      const view = viewRef.current;
      if (!view) return;
      const text = serializeTable(data);
      const doc = view.state.doc;
      const anchor = reveal
        ? Math.min(from, doc.length)
        : from > 0
          ? from - 1
          : Math.min(from + text.length + 1, doc.length);
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor },
        scrollIntoView: true,
      });
      view.focus();
    },
    onSave: () => options.onSave(),
    onTableDirty: (dirty) => options.onTableDirty?.(dirty),
    requestMeasure: () => viewRef.current?.requestMeasure(),
  };

  const contentAttributes = (): ReturnType<typeof EditorView.contentAttributes.of> =>
    EditorView.contentAttributes.of({
      spellcheck: settings.spellcheck ? 'true' : 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    });

  const extensions = [
    EditorState.allowMultipleSelections.of(false),
    EditorState.tabSize.of(2),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    indentOnInput(),
    search({ top: true }),
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      addKeymap: false,
    }),
    highlightTheme,
    themeCompartment.of(editorTheme(theme === 'dark')),
    wrapCompartment.of(settings.lineWrap ? EditorView.lineWrapping : []),
    lineNumbersCompartment.of(
      settings.lineNumbers
        ? [lineNumbers(), highlightActiveLineGutter()]
        : [],
    ),
    spellcheckCompartment.of(contentAttributes()),
    livePreviewCompartment.of(livePreview(liveOptions)),
    autocompletion({
      override: [
        linkCompletion(async () => {
          try {
            return await options.listFiles();
          } catch {
            return [];
          }
        }),
        emojiCompletion,
      ],
      activateOnTyping: true,
      closeOnBlur: true,
      icons: false,
      maxRenderedOptions: 40,
    }),
    uploadExtensions({
      uploadImage: (file) => options.uploadImage(file),
      onStatus: (message, error) => options.onStatus?.(message, error),
    }),
    placeholder('开始写 Markdown…'),
    EditorView.scrollMargins.of(() => ({ top: 24, bottom: 100 })),
    createKeymap({
      onSave: () => options.onSave(),
      onToggleSource: () => toggleSource(),
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !applying) {
        options.onChange(update.state.doc.toString());
      }
      if (update.docChanged || update.selectionSet || update.focusChanged) {
        options.onUpdate?.(update.view);
      }
    }),
  ];

  applyCssSettings(parent, settings);
  parent.dataset.theme = theme;

  const view = new EditorView({
    state: EditorState.create({
      doc: options.value,
      extensions,
    }),
    parent,
  });
  viewRef.current = view;

  const setValue: MarkdownEditorHandle['setValue'] = (markdownText, opts) => {
    const current = view.state.doc.toString();
    if (current === markdownText) return;
    const scrollTop = view.scrollDOM.scrollTop;
    applying = true;
    try {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: markdownText,
        },
        selection: { anchor: 0 },
        ...(opts?.addToHistory === false
          ? { annotations: Transaction.addToHistory.of(false) }
          : {}),
      });
    } finally {
      applying = false;
    }
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = Math.min(
        scrollTop,
        view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight,
      );
    });
  };

  const setSettings = (next: EditorSettings): void => {
    settings = { ...next };
    applyCssSettings(parent, settings);
    view.dispatch({
      effects: [
        wrapCompartment.reconfigure(
          settings.lineWrap ? EditorView.lineWrapping : [],
        ),
        lineNumbersCompartment.reconfigure(
          settings.lineNumbers
            ? [lineNumbers(), highlightActiveLineGutter()]
            : [],
        ),
        spellcheckCompartment.reconfigure(contentAttributes()),
      ],
    });
  };

  const setTheme = (next: ThemeMode): void => {
    theme = next;
    liveOptions.theme = next;
    parent.dataset.theme = next;
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(editorTheme(next === 'dark')),
        livePreviewCompartment.reconfigure(
          sourceMode ? [] : livePreview(liveOptions),
        ),
      ],
    });
  };

  const toggleSource = (): void => {
    sourceMode = !sourceMode;
    view.dispatch({
      effects: livePreviewCompartment.reconfigure(
        sourceMode ? [] : livePreview(liveOptions),
      ),
    });
    view.focus();
  };

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue,
    focus: () => view.focus(),
    destroy: () => {
      viewRef.current = null;
      view.destroy();
    },
    setSettings,
    setTheme,
    toggleSource,
    isSource: () => sourceMode,
  };
}

export { getActiveFormats } from './commands';
export type {
  EditorSettings,
  FileEntry,
  MarkdownEditorHandle,
  MarkdownEditorOptions,
  ThemeMode,
} from './types';
export { DEFAULT_SETTINGS } from './types';
