import type {
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import { EMOJI_LIST } from './live-preview/emoji';
import type { FileEntry } from './types';

export function linkCompletion(
  listFiles: () => Promise<FileEntry[]>,
): CompletionSource {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const match = context.matchBefore(/!?\[[^\]]*\]\([^)\n]*$/);
    if (!match) return null;
    const open = match.text.lastIndexOf('(');
    if (open < 0) return null;
    const prefix = match.text.slice(open + 1);
    const from = context.pos - prefix.length;
    const files = await listFiles();
    if (files.length === 0) return null;
    return {
      from,
      options: files.map((file) => ({
        label: encodeURI(file.path),
        detail:
          file.kind === 'markdown'
            ? 'Markdown'
            : file.kind === 'image'
              ? '图片'
              : file.kind === 'video'
                ? '视频'
                : file.kind === 'audio'
                  ? '音频'
                  : '文件',
        type: file.kind === 'markdown' ? 'text' : 'property',
        apply: encodeURI(file.path),
      })),
      validFor: /^[^)\n]*$/,
    };
  };
}

export function emojiCompletion(
  context: CompletionContext,
): CompletionResult | null {
  const match = context.matchBefore(/:[a-z0-9_+-]*$/i);
  if (!match) return null;
  if (match.from === match.to && !context.explicit) return null;
  const prefix = match.text.slice(1).toLowerCase();
  const options = EMOJI_LIST.filter(({ name }) => name.startsWith(prefix))
    .slice(0, 24)
    .map(({ name, char }) => ({
      label: `:${name}:`,
      detail: char,
      apply: `:${name}:`,
    }));
  if (options.length === 0) return null;
  return {
    from: match.from,
    options,
    validFor: /^:[a-z0-9_+-]*$/i,
  };
}
