function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

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

    const btnW = this.element.offsetWidth || 100;
    const btnH = this.element.offsetHeight || 32;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4;

    // Preferred: centered below the popup
    if (popupRect.bottom + gap + btnH <= vh) {
      const left = popupRect.left + (popupRect.width - btnW) / 2;
      this.element.style.left = `${clamp(left, gap, vw - btnW - gap)}px`;
      this.element.style.top = `${popupRect.bottom + gap}px`;
      return;
    }

    // Fallback: to the right of the popup, vertically centered
    if (popupRect.right + gap + btnW <= vw) {
      this.element.style.left = `${popupRect.right + gap}px`;
      this.element.style.top = `${clamp(popupRect.top + (popupRect.height - btnH) / 2, gap, vh - btnH - gap)}px`;
      return;
    }

    // Fallback: to the left of the popup
    if (popupRect.left - gap - btnW >= 0) {
      this.element.style.left = `${popupRect.left - gap - btnW}px`;
      this.element.style.top = `${clamp(popupRect.top + (popupRect.height - btnH) / 2, gap, vh - btnH - gap)}px`;
      return;
    }

    // Last resort: above the popup, centered
    const left = popupRect.left + (popupRect.width - btnW) / 2;
    this.element.style.left = `${clamp(left, gap, vw - btnW - gap)}px`;
    this.element.style.top = `${Math.max(gap, popupRect.top - gap - btnH)}px`;
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
