import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export interface UploadOptions {
  uploadImage(file: File): Promise<string | null>;
  onStatus?(message: string, error?: boolean): void;
}

function filesFrom(items: DataTransferItemList | null): File[] {
  if (!items) return [];
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files.filter(
    (file) =>
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/'),
  );
}

function insertAt(view: EditorView, pos: number, text: string): number {
  view.dispatch({
    changes: { from: pos, to: pos, insert: text },
    selection: EditorSelection.cursor(pos + text.length),
  });
  return pos + text.length;
}

async function insertFiles(
  view: EditorView,
  files: readonly File[],
  pos: number,
  options: UploadOptions,
): Promise<void> {
  let cursor = pos;
  for (const file of files) {
    options.onStatus?.(`正在写入 ${file.name}…`);
    try {
      const path = await options.uploadImage(file);
      if (!path) {
        options.onStatus?.(`写入失败：${file.name}`, true);
        continue;
      }
      const alt = file.name.replace(/\.[^.]+$/, '') || '图片';
      const text = `![${alt}](${path})`;
      cursor = insertAt(view, cursor, text);
      options.onStatus?.('图片已插入');
    } catch (error) {
      options.onStatus?.(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }
  view.focus();
}

export function uploadExtensions(options: UploadOptions) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const clipboard = event.clipboardData;
      if (!clipboard) return false;

      const files = filesFrom(clipboard.items);
      if (files.length > 0) {
        event.preventDefault();
        void insertFiles(
          view,
          files,
          view.state.selection.main.head,
          options,
        );
        return true;
      }

      const pasted = clipboard.getData('text/plain').trim();
      if (
        /^https?:\/\/\S+$/i.test(pasted) &&
        !view.state.selection.main.empty
      ) {
        event.preventDefault();
        const range = view.state.selection.main;
        const selected = view.state.sliceDoc(range.from, range.to);
        view.dispatch({
          changes: {
            from: range.from,
            to: range.to,
            insert: `[${selected}](${pasted})`,
          },
          selection: EditorSelection.cursor(
            range.from + selected.length + pasted.length + 4,
          ),
        });
        return true;
      }
      return false;
    },

    drop(event, view) {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        (file) =>
          file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/'),
      );
      if (files.length === 0) return false;
      event.preventDefault();
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
        view.state.selection.main.head;
      void insertFiles(view, files, pos, options);
      return true;
    },

    dragover(event) {
      if (Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === 'file')) {
        event.preventDefault();
        return true;
      }
      return false;
    },
  });
}
