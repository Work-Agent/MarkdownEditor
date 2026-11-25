import { WidgetType } from '@codemirror/view';
import katex from 'katex';
import { mount, type Mounted } from 'pele';
import type { TableData } from '../table';
import type { LivePreviewOptions } from './options';

function directUrl(src: string): boolean {
  return /^(https?:|data:|blob:|plugin:)/i.test(src) || src.startsWith('//');
}

function mediaKind(src: string): 'image' | 'video' | 'audio' {
  const clean = src.split(/[?#]/)[0] ?? src;
  if (/\.(mp4|webm|mov)$/i.test(clean)) return 'video';
  if (/\.(mp3|wav|ogg|oga|weba)$/i.test(clean)) return 'audio';
  return 'image';
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

export class LinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly href: string,
    readonly title: string,
    readonly from: number,
    readonly options: LivePreviewOptions,
  ) {
    super();
  }

  override eq(other: LinkWidget): boolean {
    return (
      other.text === this.text &&
      other.href === this.href &&
      other.title === this.title &&
      other.from === this.from
    );
  }

  override toDOM(): HTMLElement {
    const anchor = document.createElement('a');
    anchor.className = 'cm-md-link';
    anchor.textContent = this.text || this.href;
    anchor.title = this.title
      ? `${this.title}\nCmd/Ctrl+click 打开`
      : 'Cmd/Ctrl+click 打开，单击编辑';
    if (/^(javascript:|vbscript:|data:text\/html)/i.test(this.href)) {
      anchor.removeAttribute('href');
      anchor.classList.add('is-unsafe');
    } else {
      anchor.href = this.href;
      anchor.rel = 'noreferrer noopener';
    }
    anchor.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.metaKey || event.ctrlKey) {
        this.options.onLinkClick(this.href, event);
      } else {
        this.options.onReveal(this.from);
      }
    });
    return anchor;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly title: string,
    readonly from: number,
    readonly options: LivePreviewOptions,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.title === this.title &&
      other.from === this.from
    );
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-md-image';
    const kind = mediaKind(this.src);
    let media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
    if (kind === 'video') {
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = true;
      media = video;
    } else if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'metadata';
      media = audio;
    } else {
      const image = document.createElement('img');
      image.alt = this.alt;
      image.decoding = 'async';
      media = image;
    }
    media.className = `cm-md-image-media cm-md-image-${kind}`;
    if (this.title) media.title = this.title;

    const loading = document.createElement('span');
    loading.className = 'cm-md-image-loading';
    loading.textContent = kind === 'image' ? '图片加载中…' : '媒体加载中…';
    wrapper.appendChild(loading);
    wrapper.appendChild(media);

    const finish = (url: string): void => {
      media.src = url;
      loading.remove();
      wrapper.classList.add('is-loaded');
    };
    const fail = (message: string): void => {
      loading.className = 'cm-md-image-error';
      loading.textContent = message;
      wrapper.classList.add('is-error');
    };

    const readyEvent = kind === 'image' ? 'load' : 'loadeddata';
    media.addEventListener(readyEvent, () => {
      loading.remove();
      wrapper.classList.add('is-loaded');
      this.options.requestMeasure();
    });
    media.addEventListener('error', () => {
      fail('资源加载失败');
      this.options.requestMeasure();
    });

    if (directUrl(this.src)) {
      finish(this.src);
    } else {
      void this.options
        .resolveImage(this.src, this.alt, this.title)
        .then((url) => {
          if (url) finish(url);
          else fail('找不到图片');
        })
        .catch(() => fail('图片读取失败'));
    }

    if (kind === 'image') {
      media.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      media.addEventListener('click', (event) => {
        const mouse = event as MouseEvent;
        mouse.preventDefault();
        mouse.stopPropagation();
        if (mouse.metaKey || mouse.ctrlKey || mouse.altKey) {
          this.options.onReveal(this.from);
          return;
        }
        this.options.onImageClick(this.src, this.alt);
      });
      media.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onReveal(this.from);
      });
    }
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
    readonly options: LivePreviewOptions,
  ) {
    super();
  }

  override eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  override toDOM(): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cm-md-task-checkbox';
    input.checked = this.checked;
    input.setAttribute('aria-label', this.checked ? '取消完成' : '标记完成');
    input.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    input.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.onToggleTask(this.pos, !this.checked);
    });
    return input;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export class EmojiWidget extends WidgetType {
  constructor(readonly emoji: string) {
    super();
  }

  override eq(other: EmojiWidget): boolean {
    return other.emoji === this.emoji;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-emoji';
    span.textContent = this.emoji;
    return span;
  }
}

export class CopyButtonWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  override eq(other: CopyButtonWidget): boolean {
    return other.code === this.code;
  }

  override toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-md-code-copy';
    button.textContent = 'Copy';
    button.title = '复制代码';
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void copyText(this.code).then(() => {
        button.textContent = '已复制';
        window.setTimeout(() => {
          button.textContent = 'Copy';
        }, 1600);
      });
    });
    return button;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export class HrWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly options: LivePreviewOptions,
  ) {
    super();
  }

  override eq(other: HrWidget): boolean {
    return other.from === this.from;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-hr-widget';
    wrapper.appendChild(document.createElement('hr'));
    wrapper.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.onReveal(this.from);
    });
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function cloneTableData(data: TableData): TableData {
  return {
    headers: [...data.headers],
    alignments: [...data.alignments],
    rows: data.rows.map((row) => [...row]),
  };
}

function selectCellContents(cell: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  selection.removeAllRanges();
  selection.addRange(range);
}

export class TableWidget extends WidgetType {
  private cleanupKeydown: (() => void) | null = null;

  constructor(
    readonly raw: string,
    readonly data: TableData,
    readonly from: number,
    readonly to: number,
    readonly options: LivePreviewOptions,
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      other.raw === this.raw &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  override toDOM(): HTMLElement {
    this.cleanupKeydown?.();
    this.cleanupKeydown = null;
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-table-widget';
    wrapper.title = '单元格可直接编辑；点击“源码”查看 Markdown';
    wrapper.contentEditable = 'false';

    const toolbar = document.createElement('div');
    toolbar.className = 'cm-md-table-toolbar';
    toolbar.contentEditable = 'false';
    const label = document.createElement('span');
    label.className = 'cm-md-table-label';
    label.textContent = '表格';
    toolbar.appendChild(label);

    const tableEl = document.createElement('table');
    let current = cloneTableData(this.data);
    let dirty = false;
    let rendering = false;
    let headerCells: HTMLTableCellElement[] = [];
    let bodyCells: HTMLTableCellElement[][] = [];

    const read = (): TableData => {
      const next = cloneTableData(current);
      next.headers = headerCells.map((cell) => cell.textContent ?? '');
      next.rows = bodyCells.map((row) =>
        row.map((cell) => cell.textContent ?? ''),
      );
      const width = Math.max(
        next.headers.length,
        ...next.rows.map((row) => row.length),
        1,
      );
      while (next.headers.length < width) next.headers.push('');
      while (next.alignments.length < width) next.alignments.push(null);
      for (const row of next.rows) {
        while (row.length < width) row.push('');
      }
      return next;
    };

    const commit = (reveal = false): void => {
      if (!dirty && !reveal) return;
      const next = read();
      dirty = false;
      this.options.onTableDirty?.(false);
      this.options.onTableCommit(this.from, this.to, next, reveal);
    };

    const allCells = (): HTMLTableCellElement[] => [
      ...headerCells,
      ...bodyCells.flat(),
    ];

    const focusAt = (row: number, col: number): void => {
      const cells = row < 0 ? headerCells : bodyCells[row];
      const cell = cells?.[col];
      if (!cell) return;
      cell.focus();
      selectCellContents(cell);
    };

    const render = (): void => {
      rendering = true;
      try {
      tableEl.textContent = '';
      headerCells = [];
      bodyCells = [];

      const makeCell = (
        tag: 'th' | 'td',
        value: string,
        row: number,
        col: number,
      ): HTMLTableCellElement => {
        const cell = document.createElement(tag);
        cell.contentEditable = 'true';
        cell.spellcheck = false;
        cell.textContent = value;
        cell.dataset['row'] = String(row);
        cell.dataset['col'] = String(col);
        const align = current.alignments[col];
        if (align) cell.style.textAlign = align;
        cell.addEventListener('input', () => {
          dirty = true;
          this.options.onTableDirty?.(true);
        });
        cell.addEventListener('paste', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const text = event.clipboardData?.getData('text/plain') ?? '';
          document.execCommand('insertText', false, text);
          dirty = true;
          this.options.onTableDirty?.(true);
        });
        return cell;
      };

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (let col = 0; col < current.headers.length; col += 1) {
        const cell = makeCell('th', current.headers[col] ?? '', -1, col);
        headerCells.push(cell);
        headRow.appendChild(cell);
      }
      thead.appendChild(headRow);
      tableEl.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let row = 0; row < current.rows.length; row += 1) {
        const tr = document.createElement('tr');
        const rowCells: HTMLTableCellElement[] = [];
        for (let col = 0; col < current.headers.length; col += 1) {
          const cell = makeCell('td', current.rows[row]?.[col] ?? '', row, col);
          rowCells.push(cell);
          tr.appendChild(cell);
        }
        bodyCells.push(rowCells);
        tbody.appendChild(tr);
      }
      tableEl.appendChild(tbody);
      } finally {
        rendering = false;
      }
    };

    const addButton = (
      text: string,
      title: string,
      action: () => void,
    ): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cm-md-table-tool';
      button.textContent = text;
      button.title = title;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      toolbar.appendChild(button);
    };

    addButton('+ 行', '在末尾增加一行', () => {
      current = read();
      current.rows.push(current.headers.map(() => ''));
      dirty = true;
      this.options.onTableDirty?.(true);
      render();
      requestAnimationFrame(() => focusAt(current.rows.length - 1, 0));
    });
    addButton('+ 列', '在末尾增加一列', () => {
      current = read();
      current.headers.push('');
      current.alignments.push(null);
      for (const row of current.rows) row.push('');
      dirty = true;
      this.options.onTableDirty?.(true);
      render();
      requestAnimationFrame(() => focusAt(-1, current.headers.length - 1));
    });
    addButton('− 行', '删除最后一行', () => {
      current = read();
      if (current.rows.length === 0) return;
      current.rows.pop();
      dirty = true;
      this.options.onTableDirty?.(true);
      render();
      requestAnimationFrame(() =>
        focusAt(current.rows.length > 0 ? 0 : -1, 0),
      );
    });
    addButton('− 列', '删除最后一列', () => {
      current = read();
      if (current.headers.length <= 1) return;
      current.headers.pop();
      current.alignments.pop();
      for (const row of current.rows) row.pop();
      dirty = true;
      this.options.onTableDirty?.(true);
      render();
      requestAnimationFrame(() => focusAt(-1, 0));
    });
    addButton('源码', '编辑 Markdown 表格源码', () => {
      if (!dirty) {
        this.options.onReveal(this.from);
        return;
      }
      commit(true);
    });
    addButton('完成', '提交单元格修改', () => {
      commit(false);
      wrapper.blur();
    });

    for (const type of [
      'beforeinput',
      'input',
      'compositionstart',
      'compositionupdate',
      'compositionend',
      'copy',
      'cut',
    ]) {
      wrapper.addEventListener(type, (event) => event.stopPropagation());
    }

    wrapper.addEventListener('focusout', (event) => {
      if (rendering) return;
      const next = event.relatedTarget as Node | null;
      if (next && wrapper.contains(next)) return;
      commit(false);
    });

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || !wrapper.contains(target)) return;
      // 表格 widget 在 contenteditable 内部；必须在捕获阶段切断，
      // 否则 CodeMirror 的 Mod+A / 撤销等快捷键会作用到整篇文档。
      event.stopPropagation();
      if (!(target instanceof HTMLElement)) return;
      const cell = target.closest<HTMLTableCellElement>('td,th');
      if (!cell || !wrapper.contains(cell)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectCellContents(cell);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        commit(false);
        this.options.onSave();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        commit(false);
        wrapper.blur();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        current = cloneTableData(this.data);
        dirty = false;
        this.options.onTableDirty?.(false);
        render();
        wrapper.blur();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const cells = allCells();
        const index = cells.indexOf(cell);
        const next =
          cells[index + (event.shiftKey ? -1 : 1)] ??
          (event.shiftKey ? cells[cells.length - 1] : cells[0]);
        if (next) {
          next.focus();
          selectCellContents(next);
        }
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const row = Number(cell.dataset['row']);
        const col = Number(cell.dataset['col']);
        if (row < 0) {
          focusAt(0, col);
          return;
        }
        if (row + 1 >= current.rows.length) {
          current = read();
          current.rows.push(current.headers.map(() => ''));
          dirty = true;
          this.options.onTableDirty?.(true);
          render();
          requestAnimationFrame(() => focusAt(row + 1, col));
          return;
        }
        focusAt(row + 1, col);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    this.cleanupKeydown = () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };

    render();
    wrapper.append(toolbar, tableEl);
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  override destroy(): void {
    this.cleanupKeydown?.();
    this.cleanupKeydown = null;
  }
}

export class MathWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly displayMode: boolean,
    readonly from: number,
    readonly options: LivePreviewOptions,
  ) {
    super();
  }

  override eq(other: MathWidget): boolean {
    return (
      other.source === this.source &&
      other.displayMode === this.displayMode &&
      other.from === this.from
    );
  }

  override toDOM(): HTMLElement {
    const element = document.createElement(this.displayMode ? 'div' : 'span');
    element.className = this.displayMode
      ? 'cm-md-math cm-md-math-block'
      : 'cm-md-math cm-md-math-inline';
    try {
      element.innerHTML = katex.renderToString(this.source, {
        displayMode: this.displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch (error) {
      element.classList.add('is-error');
      element.textContent = this.source;
      element.title = error instanceof Error ? error.message : String(error);
    }
    element.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.onReveal(this.from);
    });
    return element;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

let peleSeq = 0;

export class MermaidWidget extends WidgetType {
  private mounted: Mounted | null = null;

  constructor(
    readonly code: string,
    readonly from: number,
    readonly options: LivePreviewOptions,
  ) {
    super();
  }

  override eq(other: MermaidWidget): boolean {
    return other.code === this.code && other.from === this.from;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-md-mermaid';
    wrapper.title = '点击编辑 Mermaid 源码';
    wrapper.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.options.onReveal(this.from);
    });

    const showError = (error: unknown): void => {
      wrapper.classList.add('is-error');
      const message = document.createElement('pre');
      message.textContent = `Mermaid 渲染失败\n${
        error instanceof Error ? error.message : String(error)
      }`;
      wrapper.appendChild(message);
      this.options.requestMeasure();
    };

    try {
      this.mounted = mount(wrapper, this.code, {
        idPrefix: `cm-pele-${++peleSeq}-`,
        fontFamily:
          getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
        fontSize: 14,
        responsive: true,
        links: false,
        images: false,
        zoom: false,
        onRender: () => {
          wrapper.classList.add('is-ready');
          this.options.requestMeasure();
        },
        onError: showError,
      });
    } catch (error) {
      showError(error);
    }
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  override destroy(): void {
    this.mounted?.destroy();
    this.mounted = null;
  }
}
