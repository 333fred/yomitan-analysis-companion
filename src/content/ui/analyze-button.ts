export class AnalyzeButton {
  private element: HTMLButtonElement | null = null;
  private clickHandler: (() => void) | null = null;
  private boundClickHandler: (() => void) | null = null;

  create(parentShadowRoot: ShadowRoot): HTMLButtonElement {
    this.destroy();

    const btn = document.createElement('button');
    btn.className = 'ycc-button ycc-hidden';
    btn.type = 'button';
    btn.innerHTML = `<span class="ycc-button-icon">✨</span><span class="ycc-button-label">Analyze</span>`;

    parentShadowRoot.appendChild(btn);
    this.element = btn;
    return btn;
  }

  position(popupRect: DOMRect): void {
    if (!this.element) return;

    const btnWidth = this.element.offsetWidth || 100;
    const left = popupRect.left + (popupRect.width - btnWidth) / 2;
    const top = popupRect.bottom + 4;

    this.element.style.left = `${Math.max(4, left)}px`;
    this.element.style.top = `${top}px`;
  }

  show(): void {
    this.element?.classList.remove('ycc-hidden');
  }

  hide(): void {
    this.element?.classList.add('ycc-hidden');
  }

  destroy(): void {
    if (this.element && this.boundClickHandler) {
      this.element.removeEventListener('click', this.boundClickHandler);
    }
    this.element?.remove();
    this.element = null;
    this.clickHandler = null;
    this.boundClickHandler = null;
  }

  onClick(handler: () => void): void {
    if (!this.element) return;

    if (this.boundClickHandler) {
      this.element.removeEventListener('click', this.boundClickHandler);
    }

    this.clickHandler = handler;
    this.boundClickHandler = () => this.clickHandler?.();
    this.element.addEventListener('click', this.boundClickHandler);
  }

  setLoading(loading: boolean): void {
    if (!this.element) return;

    this.element.disabled = loading;

    const iconSpan = this.element.querySelector('.ycc-button-icon') as HTMLElement;
    const labelSpan = this.element.querySelector('.ycc-button-label') as HTMLElement;

    if (loading) {
      iconSpan.innerHTML = '<span class="ycc-spinner"></span>';
      labelSpan.textContent = 'Analyzing…';
    } else {
      iconSpan.textContent = '✨';
      labelSpan.textContent = 'Analyze';
    }
  }

  getElement(): HTMLButtonElement | null {
    return this.element;
  }
}
