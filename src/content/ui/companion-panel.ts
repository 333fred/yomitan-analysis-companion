import { SectionRenderer } from './section-renderer';

const SHIMMER_LINE_COUNT = 5;
const RIGHT_PANEL_WIDTH = 380;
const BOTTOM_PANEL_HEIGHT = 300;

export type PanelPosition = 'right' | 'bottom';

export class CompanionPanel {
  private container: HTMLDivElement | null = null;
  private contentArea: HTMLDivElement | null = null;
  private sectionRenderer: SectionRenderer;
  private position: PanelPosition = 'right';
  private onCloseCallback: (() => void) | null = null;

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
    panel.appendChild(content);

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
  }

  showLoading(): void {
    if (!this.contentArea) return;
    this.clearContent();

    const loader = document.createElement('div');
    loader.className = 'ycc-panel-loading';
    for (let i = 0; i < SHIMMER_LINE_COUNT; i++) {
      const line = document.createElement('div');
      line.className = 'ycc-shimmer-line';
      loader.appendChild(line);
    }
    this.contentArea.appendChild(loader);
  }

  showError(message: string, retryable: boolean, onRetry?: () => void): void {
    if (!this.contentArea) return;
    this.clearContent();

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

    this.contentArea.appendChild(errorDiv);
  }

  appendStreamingChunk(chunk: string): void {
    if (!this.contentArea) return;

    const loader = this.contentArea.querySelector('.ycc-panel-loading');
    if (loader) loader.remove();

    this.sectionRenderer.appendChunk(chunk);
  }

  finishStreaming(): void {
    this.sectionRenderer.finalize();
  }

  clearContent(): void {
    if (!this.contentArea) return;
    this.contentArea.innerHTML = '';
    this.sectionRenderer.attach(this.contentArea);
  }

  getElement(): HTMLDivElement | null {
    return this.container;
  }

  // ── Private ──────────────────────────────────────────────────────────

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
