export interface YomitanPopupEvent {
  type: 'shown' | 'hidden' | 'repositioned';
  rect?: DOMRect;
  container?: HTMLElement;
}

export type YomitanPopupListener = (event: YomitanPopupEvent) => void;

const POSITION_POLL_INTERVAL_MS = 200;

/**
 * Detects Yomitan's popup container in the DOM.
 *
 * Yomitan injects a <div> with a closed shadow root containing an iframe.
 * Since the shadow DOM is closed we cannot access .shadowRoot — instead we
 * identify the host element by the `all: initial !important` inline style
 * that Yomitan always applies to its shadow host.
 */
export class YomitanObserver {
  private bodyObserver: MutationObserver | null = null;
  private listeners: YomitanPopupListener[] = [];
  private currentContainer: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private positionCheckInterval: number | null = null;
  private lastRect: DOMRect | null = null;

  start(): void {
    if (this.bodyObserver) return;

    // Check for any existing Yomitan containers that were added before we started
    this.scanExistingChildren();

    this.bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && this.isYomitanContainer(node)) {
            this.handlePopupShown(node);
          }
        }
        for (const node of mutation.removedNodes) {
          if (node === this.currentContainer) {
            this.handlePopupHidden();
          }
        }
      }
    });

    this.bodyObserver.observe(document.body, { childList: true });
  }

  stop(): void {
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.stopPositionTracking();

    if (this.currentContainer) {
      this.currentContainer = null;
      this.lastRect = null;
    }
  }

  addListener(listener: YomitanPopupListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: YomitanPopupListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx !== -1) this.listeners.splice(idx, 1);
  }

  getCurrentPopupRect(): DOMRect | null {
    if (!this.currentContainer) return null;
    return this.currentContainer.getBoundingClientRect();
  }

  isPopupVisible(): boolean {
    return this.currentContainer !== null;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private scanExistingChildren(): void {
    for (const child of document.body.children) {
      if (child instanceof HTMLElement && this.isYomitanContainer(child)) {
        this.handlePopupShown(child);
        break;
      }
    }
  }

  /**
   * Heuristic: Yomitan's shadow host is a plain <div> whose inline style
   * contains `all: initial !important`.  This is distinctive enough to
   * avoid false positives while being resilient to Yomitan version changes.
   */
  private isYomitanContainer(el: HTMLElement): boolean {
    if (el.tagName !== 'DIV') return false;

    // Primary check: Yomitan sets `all: initial !important` on the shadow host
    const allValue = el.style.getPropertyValue('all');
    const allPriority = el.style.getPropertyPriority('all');
    if (allValue === 'initial' && allPriority === 'important') {
      return true;
    }

    return false;
  }

  private handlePopupShown(container: HTMLElement): void {
    // If we're already tracking this container, skip
    if (this.currentContainer === container) return;

    // If there was a previous container, clean up first
    if (this.currentContainer) {
      this.handlePopupHidden();
    }

    this.currentContainer = container;
    const rect = container.getBoundingClientRect();
    this.lastRect = rect;

    this.emit({ type: 'shown', rect, container });
    this.startPositionTracking();
  }

  private handlePopupHidden(): void {
    this.stopPositionTracking();
    this.emit({ type: 'hidden' });
    this.currentContainer = null;
    this.lastRect = null;
  }

  private startPositionTracking(): void {
    if (!this.currentContainer) return;

    // ResizeObserver for size changes
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.currentContainer) return;
      const rect = this.currentContainer.getBoundingClientRect();
      this.lastRect = rect;
      this.emit({ type: 'repositioned', rect, container: this.currentContainer });
    });
    this.resizeObserver.observe(this.currentContainer);

    // Polling for position changes (the closed shadow DOM prevents
    // us from observing internal layout shifts)
    this.positionCheckInterval = window.setInterval(() => {
      if (!this.currentContainer) return;

      // If the container was removed from the DOM without triggering
      // the MutationObserver (e.g. innerHTML wipe), detect it here.
      if (!this.currentContainer.isConnected) {
        this.handlePopupHidden();
        return;
      }

      const rect = this.currentContainer.getBoundingClientRect();
      if (this.hasRectChanged(rect)) {
        this.lastRect = rect;
        this.emit({ type: 'repositioned', rect, container: this.currentContainer });
      }
    }, POSITION_POLL_INTERVAL_MS);
  }

  private stopPositionTracking(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.positionCheckInterval !== null) {
      window.clearInterval(this.positionCheckInterval);
      this.positionCheckInterval = null;
    }
  }

  private hasRectChanged(newRect: DOMRect): boolean {
    if (!this.lastRect) return true;
    return (
      this.lastRect.x !== newRect.x ||
      this.lastRect.y !== newRect.y ||
      this.lastRect.width !== newRect.width ||
      this.lastRect.height !== newRect.height
    );
  }

  private emit(event: YomitanPopupEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[YomitanCompanion] Listener error:', err);
      }
    }
  }
}
