import type { EditorView } from '@codemirror/view';
import { getActiveFormats } from '../editor/commands';

export interface ToolbarActions {
  undo(): void;
  redo(): void;
  bold(): void;
  italic(): void;
  strike(): void;
  code(): void;
  link(): void;
  image(): void;
  heading(level: number): void;
  bullet(): void;
  ordered(): void;
  task(): void;
  quote(): void;
  codeBlock(): void;
  math(): void;
  mermaid(): void;
  outline(): void;
  tableInsert(): void;
  tableAddRow(): void;
  tableAddColumn(): void;
  tableRemoveRow(): void;
  tableRemoveColumn(): void;
  save(): void;
}

interface ButtonSpec {
  action: keyof ToolbarActions;
  title: string;
  label: string;
  format?: string;
  className?: string;
}

function makeButton(spec: ButtonSpec, actions: ToolbarActions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `md-tool ${spec.className ?? ''}`.trim();
  button.title = spec.title;
  button.setAttribute('aria-label', spec.title);
  button.dataset['action'] = spec.action;
  if (spec.format) button.dataset['format'] = spec.format;
  button.textContent = spec.label;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    (actions[spec.action] as () => void)();
  });
  return button;
}

function makeGroup(children: HTMLElement[]): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'md-tool-group';
  for (const child of children) group.appendChild(child);
  return group;
}

export function createToolbar(
  host: HTMLElement,
  actions: ToolbarActions,
): { update(view: EditorView): void } {
  host.textContent = '';

  const historyGroup = makeGroup([
    makeButton({ action: 'undo', title: '撤销 (Cmd/Ctrl+Z)', label: '↶' }, actions),
    makeButton({ action: 'redo', title: '重做 (Cmd/Ctrl+Shift+Z)', label: '↷' }, actions),
  ]);

  const heading = document.createElement('select');
  heading.className = 'md-heading-select';
  heading.title = '段落样式';
  heading.innerHTML = [
    '<option value="0">正文</option>',
    '<option value="1">标题 1</option>',
    '<option value="2">标题 2</option>',
    '<option value="3">标题 3</option>',
    '<option value="4">标题 4</option>',
    '<option value="5">标题 5</option>',
    '<option value="6">标题 6</option>',
  ].join('');
  heading.addEventListener('change', () => {
    actions.heading(Number(heading.value));
  });

  const formatGroup = makeGroup([
    makeButton({ action: 'bold', title: '粗体 (Cmd/Ctrl+B)', label: 'B', format: 'bold', className: 'is-strong' }, actions),
    makeButton({ action: 'italic', title: '斜体 (Cmd/Ctrl+I)', label: 'I', format: 'italic', className: 'is-em' }, actions),
    makeButton({ action: 'strike', title: '删除线 (Cmd/Ctrl+Shift+X)', label: 'S', format: 'strike', className: 'is-strike' }, actions),
    makeButton({ action: 'code', title: '行内代码 (Cmd/Ctrl+E)', label: '</>', format: 'code' }, actions),
    makeButton({ action: 'link', title: '链接 (Cmd/Ctrl+K)', label: '↗', format: 'link' }, actions),
    makeButton({ action: 'image', title: '插入图片', label: '▧' }, actions),
  ]);

  const blockGroup = makeGroup([
    makeButton({ action: 'bullet', title: '无序列表', label: '•', format: 'bullet' }, actions),
    makeButton({ action: 'ordered', title: '有序列表', label: '1.', format: 'ordered' }, actions),
    makeButton({ action: 'task', title: '任务列表', label: '☑', format: 'task' }, actions),
    makeButton({ action: 'quote', title: '引用', label: '❝', format: 'quote' }, actions),
    makeButton({ action: 'codeBlock', title: '代码块 (Cmd/Ctrl+Shift+K)', label: '{ }' }, actions),
  ]);

  const tableDetails = document.createElement('details');
  tableDetails.className = 'md-menu';
  const summary = document.createElement('summary');
  summary.className = 'md-tool';
  summary.title = '表格';
  summary.textContent = '▦';
  tableDetails.appendChild(summary);
  const menu = document.createElement('div');
  menu.className = 'md-menu-panel';
  const tableItems: Array<[keyof ToolbarActions, string]> = [
    ['tableInsert', '插入表格'],
    ['tableAddRow', '增加一行'],
    ['tableAddColumn', '增加一列'],
    ['tableRemoveRow', '删除最后一行'],
    ['tableRemoveColumn', '删除最后一列'],
  ];
  for (const [action, label] of tableItems) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.addEventListener('click', () => {
      (actions[action] as () => void)();
      tableDetails.open = false;
    });
    menu.appendChild(item);
  }
  tableDetails.appendChild(menu);

  const insertGroup = makeGroup([
    makeButton({ action: 'math', title: '数学公式', label: '∑' }, actions),
    makeButton({ action: 'mermaid', title: 'Mermaid 图表', label: '◇' }, actions),
    makeButton({ action: 'outline', title: '大纲', label: '≡' }, actions),
    tableDetails,
  ]);

  host.append(historyGroup, heading, formatGroup, blockGroup, insertGroup);

  return {
    update(view: EditorView): void {
      const formats = getActiveFormats(view.state);
      for (const element of host.querySelectorAll<HTMLElement>('[data-format]')) {
        const format = element.dataset['format'];
        const active =
          format === 'bold'
            ? formats.bold
            : format === 'italic'
              ? formats.italic
              : format === 'strike'
                ? formats.strike
                : format === 'code'
                  ? formats.code
                  : format === 'bullet'
                    ? formats.bullet
                    : format === 'ordered'
                      ? formats.ordered
                      : format === 'task'
                        ? formats.task
                        : format === 'quote'
                          ? formats.quote
                          : format === 'link'
                            ? false
                            : false;
        element.classList.toggle('is-active', active);
      }
      heading.value = String(formats.heading);
    },
  };
}
