export interface YomitanPopupEvent {
  type: 'shown' | 'hidden' | 'repositioned';
  rect?: DOMRect;
  container?: HTMLElement;
}

export type YomitanPopupListener = (event: YomitanPopupEvent) => void;

const POSITION_POLL_INTERVAL_MS = 200;

/** Minimum dimension (px) to consider the popup actually visible. */
const MIN_VISIBLE_SIZE = 10;

/**
 * Detects Yomitan's popup container in the DOM.
 *
 * Yomitan injects a <div> with a closed shadow root containing an iframe.
 * The container stays in the DOM persistently — the popup is "hidden" when
 * the iframe inside is sized to 0×0. Since the shadow DOM is closed we
 * identify the host by its `all: initial !important` style and track
 * visibility via bounding-rect dimensions.
 */
export class YomitanObserver {
  private bodyObserver: MutationObserver | null = null;
  private listeners: YomitanPopupListener[] = [];
  /** The Yomitan shadow-host div (persists in DOM even when popup is hidden) */
  private trackedContainer: HTMLElement | null = null;
  /** Whether we consider the popup currently visible */
  private popupVisible = false;
  private resizeObserver: ResizeObserver | null = null;
  private positionCheckInterval: number | null = null;
  private lastRect: DOMRect | null = null;

  start(): void {
    if (this.bodyObserver) return;

    this.scanExistingChildren();

    this.bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && this.isYomitanContainer(node)) {
            this.trackContainer(node);
          }
        }
        for (const node of mutation.removedNodes) {
          if (node === this.trackedContainer) {
            if (this.popupVisible) {
              this.onPopupHidden();
            }
            this.untrackContainer();
          }
        }
      }
    });

    this.bodyObserver.observe(document.body, { childList: true });
  }

  stop(): void {
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.untrackContainer();
  }

  addListener(listener: YomitanPopupListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: YomitanPopupListener): void {
    const idx = this.listeners.indexOf(listener);
    if (idx !== -1) this.listeners.splice(idx, 1);
  }

  getCurrentPopupRect(): DOMRect | null {
    if (!this.trackedContainer || !this.popupVisible) return null;
    return this.trackedContainer.getBoundingClientRect();
  }

  isPopupVisible(): boolean {
    return this.popupVisible;
  }

  // ── Private ──────────────────────────────────────────────────────────

  private scanExistingChildren(): void {
    for (const child of document.body.children) {
      if (child instanceof HTMLElement && this.isYomitanContainer(child)) {
        this.trackContainer(child);
        break;
      }
    }
  }

  /**
   * Heuristic: Yomitan's shadow host is a plain <div> whose inline style
   * contains `all: initial !important`.
   */
  private isYomitanContainer(el: HTMLElement): boolean {
    if (el.tagName !== 'DIV') return false;
    const allValue = el.style.getPropertyValue('all');
    const allPriority = el.style.getPropertyPriority('all');
    return allValue === 'initial' && allPriority === 'important';
  }

  private isRectVisible(rect: DOMRect): boolean {
    return rect.width >= MIN_VISIBLE_SIZE && rect.height >= MIN_VISIBLE_SIZE;
  }

  /**
   * Start tracking a Yomitan container. We observe it continuously
   * since Yomitan keeps the element in the DOM and toggles the iframe
   * size inside the closed shadow root to show/hide the popup.
   */
  private trackContainer(container: HTMLElement): void {
    if (this.trackedContainer === container) return;

    // Clean up any previous tracking
    if (this.trackedContainer) {
      this.untrackContainer();
    }

    this.trackedContainer = container;
    this.startPositionTracking();

    // Check if it's already visible
    const rect = container.getBoundingClientRect();
    if (this.isRectVisible(rect)) {
      this.onPopupShown(rect, container);
    }
  }

  private untrackContainer(): void {
    this.stopPositionTracking();
    this.trackedContainer = null;
    this.popupVisible = false;
    this.lastRect = null;
  }

  private onPopupShown(rect: DOMRect, container: HTMLElement): void {
    this.popupVisible = true;
    this.lastRect = rect;
    this.emit({ type: 'shown', rect, container });
  }

  private onPopupHidden(): void {
    this.popupVisible = false;
    this.lastRect = null;
    this.emit({ type: 'hidden' });
  }

  private startPositionTracking(): void {
    if (!this.trackedContainer) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.checkVisibilityChange();
    });
    this.resizeObserver.observe(this.trackedContainer);

    this.positionCheckInterval = window.setInterval(() => {
      this.checkVisibilityChange();
    }, POSITION_POLL_INTERVAL_MS);
  }

  /**
   * Core polling check. Detects show/hide/reposition by comparing the
   * container's bounding rect to our last known state.
   */
  private checkVisibilityChange(): void {
    if (!this.trackedContainer) return;

    if (!this.trackedContainer.isConnected) {
      if (this.popupVisible) this.onPopupHidden();
      this.untrackContainer();
      return;
    }

    const rect = this.trackedContainer.getBoundingClientRect();
    const visible = this.isRectVisible(rect);

    if (visible && !this.popupVisible) {
      // Popup just appeared
      this.onPopupShown(rect, this.trackedContainer);
    } else if (!visible && this.popupVisible) {
      // Popup just disappeared
      this.onPopupHidden();
    } else if (visible && this.popupVisible && this.hasRectChanged(rect)) {
      // Popup moved or resized
      this.lastRect = rect;
      this.emit({ type: 'repositioned', rect, container: this.trackedContainer });
    }
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
