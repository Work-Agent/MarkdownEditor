import '@workstudio/sdk/global';
import '../page/mock';

const bridge = window.workStudio;
const app = document.querySelector<HTMLDivElement>('#app');

interface Settings {
  lineWrap: boolean;
  fontSize: number;
  contentWidth: number;
  spellcheck: boolean;
  lineNumbers: boolean;
  showOutline: boolean;
}

const DEFAULTS: Settings = {
  lineWrap: true,
  fontSize: 15,
  contentWidth: 880,
  spellcheck: false,
  lineNumbers: false,
  showOutline: true,
};

let settings: Settings = { ...DEFAULTS };

function normalize(value: unknown): Settings {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    lineWrap:
      typeof source['lineWrap'] === 'boolean'
        ? source['lineWrap']
        : DEFAULTS.lineWrap,
    fontSize:
      typeof source['fontSize'] === 'number'
        ? Math.max(11, Math.min(24, source['fontSize']))
        : DEFAULTS.fontSize,
    contentWidth:
      typeof source['contentWidth'] === 'number'
        ? Math.max(520, Math.min(1400, source['contentWidth']))
        : DEFAULTS.contentWidth,
    spellcheck:
      typeof source['spellcheck'] === 'boolean'
        ? source['spellcheck']
        : DEFAULTS.spellcheck,
    lineNumbers:
      typeof source['lineNumbers'] === 'boolean'
        ? source['lineNumbers']
        : DEFAULTS.lineNumbers,
    showOutline:
      typeof source['showOutline'] === 'boolean'
        ? source['showOutline']
        : DEFAULTS.showOutline,
  };
}

function status(text: string, error = false): void {
  const node = app?.querySelector<HTMLParagraphElement>('#status');
  if (!node) return;
  node.textContent = text;
  node.classList.toggle('is-error', error);
}

function save(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  void bridge
    .command('markdown-editor', 'settings', 'set', patch)
    .then((result) => {
      if (!result.ok) throw new Error(result.error.message);
      status('已保存');
    })
    .catch((error: unknown) => {
      status(error instanceof Error ? error.message : String(error), true);
    });
}

function render(): void {
  if (!app) return;
  app.innerHTML = `
    <main>
      <h1>Markdown 编辑器 设置</h1>

      <div class="field">
        <label for="wrap">
          <span>自动换行</span>
          <small>长行在编辑器中折行显示，不改变 Markdown 内容。</small>
        </label>
        <input id="wrap" type="checkbox" ${settings.lineWrap ? 'checked' : ''} />
      </div>

      <div class="field">
        <label for="size">
          <span>正文字号</span>
          <small>11 - 24 px</small>
        </label>
        <input id="size" type="number" min="11" max="24" step="1" value="${settings.fontSize}" />
      </div>

      <div class="field">
        <label for="width">
          <span>内容宽度</span>
          <small>编辑区最大宽度，520 - 1400 px</small>
        </label>
        <input id="width" type="number" min="520" max="1400" step="20" value="${settings.contentWidth}" />
      </div>

      <div class="field">
        <label for="spell">
          <span>拼写检查</span>
          <small>使用浏览器 / 系统拼写检查。</small>
        </label>
        <input id="spell" type="checkbox" ${settings.spellcheck ? 'checked' : ''} />
      </div>

      <div class="field">
        <label for="lines">
          <span>显示行号</span>
          <small>在编辑器左侧显示行号。</small>
        </label>
        <input id="lines" type="checkbox" ${settings.lineNumbers ? 'checked' : ''} />
      </div>

      <div class="field">
        <label for="outline">
          <span>显示大纲</span>
          <small>在右侧显示标题导航，可点击跳转。</small>
        </label>
        <input id="outline" type="checkbox" ${settings.showOutline ? 'checked' : ''} />
      </div>

      <div class="actions">
        <button id="reset" type="button">恢复默认</button>
      </div>
      <p id="status">设置会保存到插件数据目录。</p>
    </main>`;

  app.querySelector<HTMLInputElement>('#wrap')?.addEventListener('change', (event) => {
    save({ lineWrap: (event.target as HTMLInputElement).checked });
  });
  app.querySelector<HTMLInputElement>('#size')?.addEventListener('change', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) save({ fontSize: value });
  });
  app.querySelector<HTMLInputElement>('#width')?.addEventListener('change', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) save({ contentWidth: value });
  });
  app.querySelector<HTMLInputElement>('#spell')?.addEventListener('change', (event) => {
    save({ spellcheck: (event.target as HTMLInputElement).checked });
  });
  app.querySelector<HTMLInputElement>('#lines')?.addEventListener('change', (event) => {
    save({ lineNumbers: (event.target as HTMLInputElement).checked });
  });
  app.querySelector<HTMLInputElement>('#outline')?.addEventListener('change', (event) => {
    save({ showOutline: (event.target as HTMLInputElement).checked });
  });
  app.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', () => {
    settings = { ...DEFAULTS };
    render();
    void bridge
      .command('markdown-editor', 'settings', 'set', settings)
      .then((result) => {
        if (!result.ok) throw new Error(result.error.message);
        status('已恢复默认');
      })
      .catch((error: unknown) => {
        status(error instanceof Error ? error.message : String(error), true);
      });
  });
}

void bridge
  .subscribe('markdown-editor', 'settings')
  .then((value) => {
    settings = normalize(value);
    render();
  })
  .catch(() => {
    render();
  });

bridge.onUpdate((update) => {
  if (update.domain !== 'markdown-editor' || update.resource !== 'settings') return;
  settings = normalize(update.data);
  render();
});

window.addEventListener('beforeunload', () => {
  bridge.unsubscribe('markdown-editor', 'settings');
});

render();
