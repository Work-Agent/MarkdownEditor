import type { Extension } from '@codemirror/state';
import { inlinePreview } from './inline';
import { blockPreview } from './block';
import type { LivePreviewOptions } from './options';

export type { LivePreviewOptions } from './options';

/** 行内标记 + 块级 widget 的 Live Preview 组合。 */
export function livePreview(options: LivePreviewOptions): Extension {
  const inline = inlinePreview(options);
  const block = blockPreview(options);
  return [inline.extension, inline.atomic, block.extension];
}
