import type { ThemeMode } from '../types';
import type { TableData } from '../table';

export interface LivePreviewOptions {
  theme: ThemeMode;
  onReveal(pos: number): void;
  onLinkClick(href: string, event: MouseEvent): void;
  onImageClick(src: string, alt: string): void;
  resolveImage(src: string, alt: string, title: string): Promise<string | null>;
  onToggleTask(pos: number, checked: boolean): void;
  onTableCommit(
    from: number,
    to: number,
    data: TableData,
    reveal?: boolean,
  ): void;
  onSave(): void;
  onTableDirty?(dirty: boolean): void;
  requestMeasure(): void;
}
