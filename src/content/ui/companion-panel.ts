import { SectionRenderer } from './section-renderer';

const SHIMMER_LINE_COUNT = 5;
const RIGHT_PANEL_WIDTH = 380;
const BOTTOM_PANEL_HEIGHT = 300;

export type PanelPosition = 'right' | 'bottom';

export interface ModelGroup {
  label: string;
  options: Array<{ value: string; label: string }>;
}

export class CompanionPanel {
  private container: HTMLDivElement | null = null;
  private contentArea: HTMLDivElement | null = null;
  private sentenceEl: HTMLDivElement | null = null;
  private aiContentEl: HTMLDivElement | null = null;
  private footerEl: HTMLDivElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private makeDefaultBtn: HTMLButtonElement | null = null;
  private sectionRenderer: SectionRenderer;
  private position: PanelPosition = 'right';
  private onCloseCallback: (() => void) | null = null;
  private onModelChangeCallback: ((encodedValue: string) => void) | null = null;
  private onMakeDefaultCallback: ((encodedValue: string) => void) | null = null;
  private defaultModelValue = '';

  constructor() {
    this.sectionRenderer = new SectionRenderer();
  }

  create(parentShadowRoot: ShadowRoot): HTMLDivElement {
    this.destroy();

    const panel = document.createElement('div');
    panel.className = `ycc-side-panel ycc-side-panel--${this.position}`;

    // Header
    const header = document.createElement('div');
    header.className = 'ycc-side-panel-header';

    const title = document.createElement('span');
    title.className = 'ycc-side-panel-title';
    title.textContent = '✨ AI Analysis';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ycc-side-panel-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Scrollable content
    const content = document.createElement('div');
    content.className = 'ycc-side-panel-content';

    // Sentence display (hidden until setSentence is called)
    const sentenceDisplay = document.createElement('div');
    sentenceDisplay.className = 'ycc-sentence-display ycc-hidden';
    content.appendChild(sentenceDisplay);
    this.sentenceEl = sentenceDisplay;

    // AI response container (where section renderer attaches)
    const aiContent = document.createElement('div');
    content.appendChild(aiContent);
    this.aiContentEl = aiContent;

    panel.appendChild(content);

    // Footer with model switcher
    const footer = document.createElement('div');
    footer.className = 'ycc-side-panel-footer ycc-hidden';

    const modelSelect = document.createElement('select');
    modelSelect.className = 'ycc-model-select';
    modelSelect.addEventListener('change', () => {
      this.updateMakeDefaultState();
      this.onModelChangeCallback?.(modelSelect.value);
    });
    footer.appendChild(modelSelect);
    this.modelSelect = modelSelect;

    const makeDefaultBtn = document.createElement('button');
    makeDefaultBtn.className = 'ycc-make-default-btn';
    makeDefaultBtn.type = 'button';
    makeDefaultBtn.textContent = 'Make Default';
    makeDefaultBtn.disabled = true;
    makeDefaultBtn.addEventListener('click', () => {
      if (this.modelSelect) {
        this.onMakeDefaultCallback?.(this.modelSelect.value);
      }
    });
    footer.appendChild(makeDefaultBtn);
    this.makeDefaultBtn = makeDefaultBtn;

    panel.appendChild(footer);
    this.footerEl = footer;

    parentShadowRoot.appendChild(panel);
    this.container = panel;
    this.contentArea = content;
    return panel;
  }

  setPosition(pos: PanelPosition): void {
    this.position = pos;
    if (this.container) {
      this.container.className = `ycc-side-panel ycc-side-panel--${pos}`;
      // If currently open, reapply page margin
      if (this.isOpen()) {
        this.applyPageMargin();
      }
    }
  }

  onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }

  open(): void {
    if (!this.container) return;
    this.container.classList.add('ycc-open');
    this.applyPageMargin();
  }

  close(): void {
    if (!this.container) return;
    this.container.classList.remove('ycc-open');
    this.removePageMargin();
    this.onCloseCallback?.();
  }

  isOpen(): boolean {
    return this.container?.classList.contains('ycc-open') ?? false;
  }

  destroy(): void {
    this.removePageMargin();
    this.container?.remove();
    this.container = null;
    this.contentArea = null;
    this.sentenceEl = null;
    this.aiContentEl = null;
    this.footerEl = null;
    this.modelSelect = null;
    this.makeDefaultBtn = null;
  }

  // ── Sentence display ────────────────────────────────────────────────

  setSentence(word: string, sentence: string, wordOffset: number): void {
    if (!this.sentenceEl) return;

    this.sentenceEl.innerHTML = '';

    const before = sentence.slice(0, wordOffset);
    const target = sentence.slice(wordOffset, wordOffset + word.length);
    const after = sentence.slice(wordOffset + word.length);

    if (before) this.sentenceEl.appendChild(document.createTextNode(before));
    const mark = document.createElement('mark');
    mark.className = 'ycc-sentence-word';
    mark.textContent = target;
    this.sentenceEl.appendChild(mark);
    if (after) this.sentenceEl.appendChild(document.createTextNode(after));

    this.sentenceEl.classList.remove('ycc-hidden');
  }

  // ── Model switcher ──────────────────────────────────────────────────

  setModels(groups: ModelGroup[], currentValue: string, defaultValue: string): void {
    if (!this.modelSelect || !this.footerEl) return;

    this.defaultModelValue = defaultValue;
    this.modelSelect.innerHTML = '';

    for (const group of groups) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      for (const opt of group.options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        optgroup.appendChild(option);
      }
      this.modelSelect.appendChild(optgroup);
    }

    this.modelSelect.value = currentValue;
    this.footerEl.classList.remove('ycc-hidden');
    this.updateMakeDefaultState();
  }

  getCurrentModel(): string {
    return this.modelSelect?.value ?? '';
  }

  setDefaultModel(encodedValue: string): void {
    this.defaultModelValue = encodedValue;
    this.updateMakeDefaultState();
  }

  onModelChange(cb: (encodedValue: string) => void): void {
    this.onModelChangeCallback = cb;
  }

  onMakeDefault(cb: (encodedValue: string) => void): void {
    this.onMakeDefaultCallback = cb;
  }

  // ── Content management ──────────────────────────────────────────────

  showLoading(): void {
    if (!this.aiContentEl) return;
    this.clearAiContent();

    const loader = document.createElement('div');
    loader.className = 'ycc-panel-loading';
    for (let i = 0; i < SHIMMER_LINE_COUNT; i++) {
      const line = document.createElement('div');
      line.className = 'ycc-shimmer-line';
      loader.appendChild(line);
    }
    this.aiContentEl.appendChild(loader);
  }

  showError(message: string, retryable: boolean, onRetry?: () => void): void {
    if (!this.aiContentEl) return;
    this.clearAiContent();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'ycc-error';

    const msgRow = document.createElement('div');
    msgRow.className = 'ycc-error-message';
    msgRow.innerHTML = `<span class="ycc-error-icon">⚠️</span><span>${this.escapeHtml(message)}</span>`;
    errorDiv.appendChild(msgRow);

    if (retryable && onRetry) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'ycc-error-retry';
      retryBtn.textContent = 'Retry';
      retryBtn.type = 'button';
      retryBtn.addEventListener('click', onRetry);
      errorDiv.appendChild(retryBtn);
    }

    this.aiContentEl.appendChild(errorDiv);
  }

  appendStreamingChunk(chunk: string): void {
    if (!this.aiContentEl) return;

    const loader = this.aiContentEl.querySelector('.ycc-panel-loading');
    if (loader) loader.remove();

    this.sectionRenderer.appendChunk(chunk);
  }

  finishStreaming(): void {
    this.sectionRenderer.finalize();
  }

  clearContent(): void {
    this.clearAiContent();
    this.sentenceEl?.classList.add('ycc-hidden');
  }

  getElement(): HTMLDivElement | null {
    return this.container;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private clearAiContent(): void {
    if (!this.aiContentEl) return;
    this.aiContentEl.innerHTML = '';
    this.sectionRenderer.attach(this.aiContentEl);
  }

  private updateMakeDefaultState(): void {
    if (!this.makeDefaultBtn || !this.modelSelect) return;
    this.makeDefaultBtn.disabled = this.modelSelect.value === this.defaultModelValue;
  }

  private applyPageMargin(): void {
    if (this.position === 'right') {
      document.documentElement.style.marginRight = `${RIGHT_PANEL_WIDTH}px`;
    } else {
      document.documentElement.style.marginBottom = `${BOTTOM_PANEL_HEIGHT}px`;
    }
  }

  private removePageMargin(): void {
    document.documentElement.style.marginRight = '';
    document.documentElement.style.marginBottom = '';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
