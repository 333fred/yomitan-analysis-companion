import { SectionRenderer } from './section-renderer';

const SHIMMER_LINE_COUNT = 5;
const MIN_WIDTH = 350;
const MAX_WIDTH = 600;
const MAX_PANEL_HEIGHT = 400;
const MIN_USABLE_HEIGHT = 150;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

export class CompanionPanel {
  private container: HTMLDivElement | null = null;
  private sectionRenderer: SectionRenderer;

  constructor() {
    this.sectionRenderer = new SectionRenderer();
  }

  create(parentShadowRoot: ShadowRoot): HTMLDivElement {
    this.destroy();

    const panel = document.createElement('div');
    panel.className = 'ycc-panel ycc-hidden';

    parentShadowRoot.appendChild(panel);
    this.container = panel;
    return panel;
  }

  position(popupRect: DOMRect, buttonRect: DOMRect): void {
    if (!this.container) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4;

    const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, popupRect.width + 20));
    const left = clamp(
      popupRect.left + (popupRect.width - width) / 2,
      gap, vw - width - gap,
    );

    this.container.style.width = `${width}px`;
    this.container.style.left = `${left}px`;

    const spaceBelow = vh - buttonRect.bottom - gap;
    const spaceAbove = popupRect.top - gap;

    if (spaceBelow >= MIN_USABLE_HEIGHT) {
      // Below button (preferred)
      this.container.style.top = `${buttonRect.bottom + gap}px`;
      this.container.style.transform = '';
      this.container.style.maxHeight = `${Math.min(MAX_PANEL_HEIGHT, spaceBelow)}px`;
    } else if (spaceAbove >= MIN_USABLE_HEIGHT) {
      // Above popup — anchor bottom edge just above the popup using translateY
      this.container.style.top = `${popupRect.top - gap}px`;
      this.container.style.transform = 'translateY(-100%)';
      this.container.style.maxHeight = `${Math.min(MAX_PANEL_HEIGHT, spaceAbove)}px`;
    } else {
      // Tight — use whichever side is bigger
      if (spaceBelow >= spaceAbove) {
        this.container.style.top = `${buttonRect.bottom + gap}px`;
        this.container.style.transform = '';
        this.container.style.maxHeight = `${Math.max(100, spaceBelow)}px`;
      } else {
        this.container.style.top = `${popupRect.top - gap}px`;
        this.container.style.transform = 'translateY(-100%)';
        this.container.style.maxHeight = `${Math.max(100, spaceAbove)}px`;
      }
    }
  }

  show(): void {
    this.container?.classList.remove('ycc-hidden');
  }

  hide(): void {
    this.container?.classList.add('ycc-hidden');
  }

  destroy(): void {
    this.container?.remove();
    this.container = null;
  }

  showLoading(): void {
    if (!this.container) return;
    this.clear();
    this.show();

    const loader = document.createElement('div');
    loader.className = 'ycc-panel-loading';
    for (let i = 0; i < SHIMMER_LINE_COUNT; i++) {
      const line = document.createElement('div');
      line.className = 'ycc-shimmer-line';
      loader.appendChild(line);
    }
    this.container.appendChild(loader);
  }

  showError(message: string, retryable: boolean, onRetry?: () => void): void {
    if (!this.container) return;
    this.clear();
    this.show();

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

    this.container.appendChild(errorDiv);
  }

  appendStreamingChunk(chunk: string): void {
    if (!this.container) return;

    // Clear loading shimmer on first chunk
    const loader = this.container.querySelector('.ycc-panel-loading');
    if (loader) {
      loader.remove();
    }

    this.sectionRenderer.appendChunk(chunk);
  }

  finishStreaming(): void {
    this.sectionRenderer.finalize();
  }

  clear(): void {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.sectionRenderer.attach(this.container);
  }

  getElement(): HTMLDivElement | null {
    return this.container;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
