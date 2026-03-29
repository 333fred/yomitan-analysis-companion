export interface YomitanPopupEvent {
  type: 'shown' | 'hidden' | 'repositioned';
  rect?: DOMRect;
  container?: HTMLElement;
}

export type YomitanPopupListener = (event: YomitanPopupEvent) => void;

/** How often to probe for popup visibility (ms). */
const PROBE_INTERVAL_MS = 200;
/** Grace period before declaring the popup hidden (ms). */
const HIDE_DELAY_MS = 500;
/** Pixel step when probing for popup edges. */
const EDGE_STEP_PX = 20;
/** Tolerance for considering two rects the same position (px). */
const RECT_TOLERANCE_PX = 5;
/** Minimum dimension to accept a probed rect as a valid popup (px). */
const MIN_POPUP_SIZE_PX = 30;

const LOG = '[YomitanCompanion:Observer]';

/**
 * Detects Yomitan's popup by probing the viewport with `elementFromPoint`.
 *
 * Yomitan renders its popup iframe inside a **closed** Shadow DOM. The
 * shadow host (`<div style="all:initial!important">`) is always 0×0 in
 * layout because the iframe uses `position:fixed`. We therefore cannot
 * rely on the host element's bounding rect.
 *
 * Instead we leverage the Shadow DOM hit-testing spec: `elementFromPoint`
 * at the iframe's visual location returns the shadow host (because the
 * shadow is closed). By probing points near the mouse cursor we can
 * detect AND measure the popup without accessing the closed shadow.
 */
export class YomitanObserver {
  private bodyObserver: MutationObserver | null = null;
  private listeners: YomitanPopupListener[] = [];
  private trackedContainer: HTMLElement | null = null;
  private popupVisible = false;
  private lastRect: DOMRect | null = null;

  private mouseX = 0;
  private mouseY = 0;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private probeTimer: number | null = null;
  private hideTimer: number | null = null;

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
            if (this.popupVisible) this.onPopupHidden();
            this.untrackContainer();
          }
        }
      }
    });
    this.bodyObserver.observe(document.body, { childList: true });

    this.mouseMoveHandler = (e: MouseEvent) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    };
    document.addEventListener('mousemove', this.mouseMoveHandler, { passive: true });
  }

  stop(): void {
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
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
    return this.popupVisible ? this.lastRect : null;
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
    return (
      el.style.getPropertyValue('all') === 'initial' &&
      el.style.getPropertyPriority('all') === 'important'
    );
  }

  private trackContainer(container: HTMLElement): void {
    if (this.trackedContainer === container) return;
    if (this.trackedContainer) this.untrackContainer();
    this.trackedContainer = container;
    console.debug(LOG, 'Yomitan container detected — starting popup probing');
    this.probeTimer = window.setInterval(() => this.probeForPopup(), PROBE_INTERVAL_MS);
  }

  private untrackContainer(): void {
    if (this.probeTimer !== null) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    this.cancelHideTimer();
    this.trackedContainer = null;
    this.popupVisible = false;
    this.lastRect = null;
  }

  private cancelHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  // ── Core probing loop ────────────────────────────────────────────────

  private probeForPopup(): void {
    if (!this.trackedContainer) return;
    if (!this.trackedContainer.isConnected) {
      if (this.popupVisible) this.onPopupHidden();
      this.untrackContainer();
      return;
    }

    const container = this.trackedContainer;

    // Fast path: if already visible, verify it's still there without
    // re-probing bounds (probing varies by ±EDGE_STEP_PX per cycle,
    // which would cause the button to jitter side-to-side).
    if (this.popupVisible && this.lastRect) {
      const cx = this.lastRect.x + this.lastRect.width / 2;
      const cy = this.lastRect.y + this.lastRect.height / 2;
      if (this.inViewport(cx, cy) && document.elementFromPoint(cx, cy) === container) {
        this.cancelHideTimer();
        return; // still there, no need to re-probe
      }
      // Center miss — popup may have moved; fall through to search
    }

    // Search near the mouse cursor (where Yomitan typically shows)
    const hit = this.findPopupHitPoint(container);
    if (hit) {
      const rect = this.probePopupBounds(hit[0], hit[1]);
      if (rect.width >= MIN_POPUP_SIZE_PX && rect.height >= MIN_POPUP_SIZE_PX) {
        // Confirmed visible popup — cancel any pending hide timer
        this.cancelHideTimer();
        if (!this.popupVisible) {
          this.onPopupShown(rect, container);
        } else if (this.hasRectChanged(rect)) {
          this.lastRect = rect;
          this.emit({ type: 'repositioned', rect, container });
        }
        return;
      }
    }

    // Not found — schedule hide
    if (this.popupVisible && this.hideTimer === null) {
      this.hideTimer = window.setTimeout(() => {
        this.onPopupHidden();
        this.hideTimer = null;
      }, HIDE_DELAY_MS);
    }
  }

  /**
   * Probe points in a fan around the mouse to find the Yomitan popup.
   * Returns the first viewport coordinate that hits the container.
   */
  private findPopupHitPoint(container: HTMLElement): [number, number] | null {
    const mx = this.mouseX;
    const my = this.mouseY;

    const offsets: [number, number][] = [
      [0, 0],
      // Below mouse (most common Yomitan position)
      [0, 30], [0, 70], [0, 120], [0, 180], [0, 250],
      [60, 50], [-60, 50], [60, 120], [-60, 120],
      // Above mouse (when popup flips upward near viewport bottom)
      [0, -30], [0, -80], [0, -150], [0, -220],
      [100, 0], [-100, 0],
    ];

    for (const [dx, dy] of offsets) {
      const px = mx + dx;
      const py = my + dy;
      if (!this.inViewport(px, py)) continue;
      if (document.elementFromPoint(px, py) === container) return [px, py];
    }

    return null;
  }

  /**
   * From a known hit point, walk outward to approximate the popup edges.
   * Probes horizontal edges at the vertical midpoint (and vice versa)
   * for more accurate bounds regardless of where the initial hit was.
   */
  private probePopupBounds(hitX: number, hitY: number): DOMRect {
    const c = this.trackedContainer;
    const s = EDGE_STEP_PX;

    // First pass: find approximate vertical extent at hitX
    let top = hitY;
    let bottom = hitY;
    while (top - s >= 0 && document.elementFromPoint(hitX, top - s) === c) top -= s;
    while (bottom + s < window.innerHeight && document.elementFromPoint(hitX, bottom + s) === c) bottom += s;

    // Probe horizontal extent at the vertical midpoint for consistency
    const midY = Math.round((top + bottom) / 2);
    let left = hitX;
    let right = hitX;
    while (left - s >= 0 && document.elementFromPoint(left - s, midY) === c) left -= s;
    while (right + s < window.innerWidth && document.elementFromPoint(right + s, midY) === c) right += s;

    return new DOMRect(left, top, right - left, bottom - top);
  }

  private inViewport(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
  }

  // ── State transitions ────────────────────────────────────────────────

  private onPopupShown(rect: DOMRect, container: HTMLElement): void {
    this.popupVisible = true;
    this.lastRect = rect;
    console.debug(LOG, 'Popup detected', { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) });
    this.emit({ type: 'shown', rect, container });
  }

  private onPopupHidden(): void {
    this.popupVisible = false;
    this.lastRect = null;
    console.debug(LOG, 'Popup hidden');
    this.emit({ type: 'hidden' });
  }

  private hasRectChanged(newRect: DOMRect): boolean {
    if (!this.lastRect) return true;
    const t = RECT_TOLERANCE_PX;
    return (
      Math.abs(this.lastRect.x - newRect.x) > t ||
      Math.abs(this.lastRect.y - newRect.y) > t ||
      Math.abs(this.lastRect.width - newRect.width) > t ||
      Math.abs(this.lastRect.height - newRect.height) > t
    );
  }

  private emit(event: YomitanPopupEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(LOG, 'Listener error:', err);
      }
    }
  }
}
