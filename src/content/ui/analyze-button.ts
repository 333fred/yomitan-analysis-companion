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
    btn.innerHTML = `<span class="ycc-button-icon">✨</span><span class="ycc-button-label">Explain</span>`;

    parentShadowRoot.appendChild(btn);
    this.element = btn;
    return btn;
  }

  position(popupRect: DOMRect, mouseY?: number): void {
    if (!this.element) return;

    const btnW = this.element.offsetWidth || 100;
    const btnH = this.element.offsetHeight || 32;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4;
    // The popup rect comes from elementFromPoint probing in 20px steps,
    // so the real popup can extend up to 20px beyond the probed edges.
    const probeMargin = 20;

    // When the popup is below the mouse, the text line is near mouseY.
    // Position above the text line rather than above the popup (which
    // would land between the text and the popup, clipping the text).
    // Add a line-height estimate to clear above the full text line.
    const textLineClearance = 18;
    const aboveAnchorY = mouseY !== undefined && mouseY < popupRect.top
      ? mouseY - textLineClearance - gap - btnH
      : popupRect.top - probeMargin - gap - btnH;

    // Preferred: top-left, above the text/popup
    if (aboveAnchorY >= 0) {
      const left = clamp(popupRect.left, gap, vw - btnW - gap);
      this.element.style.left = `${left}px`;
      this.element.style.top = `${aboveAnchorY}px`;
      return;
    }

    // Fallback: top-left, just below the popup
    if (popupRect.bottom + probeMargin + gap + btnH <= vh) {
      const left = clamp(popupRect.left, gap, vw - btnW - gap);
      this.element.style.left = `${left}px`;
      this.element.style.top = `${popupRect.bottom + probeMargin + gap}px`;
      return;
    }

    // Fallback: to the left of the popup, top-aligned
    if (popupRect.left - probeMargin - gap - btnW >= 0) {
      this.element.style.left = `${popupRect.left - probeMargin - gap - btnW}px`;
      this.element.style.top = `${clamp(popupRect.top, gap, vh - btnH - gap)}px`;
      return;
    }

    // Fallback: to the right of the popup, top-aligned
    if (popupRect.right + probeMargin + gap + btnW <= vw) {
      this.element.style.left = `${popupRect.right + probeMargin + gap}px`;
      this.element.style.top = `${clamp(popupRect.top, gap, vh - btnH - gap)}px`;
      return;
    }

    // Last resort: top-left, clamped to viewport
    this.element.style.left = `${clamp(popupRect.left, gap, vw - btnW - gap)}px`;
    this.element.style.top = `${Math.max(gap, aboveAnchorY)}px`;
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
      labelSpan.textContent = 'Explaining…';
    } else {
      iconSpan.textContent = '✨';
      labelSpan.textContent = 'Explain';
    }
  }

  getElement(): HTMLButtonElement | null {
    return this.element;
  }
}
