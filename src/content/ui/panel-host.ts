import { getStyles } from './styles';
import { AnalyzeButton } from './analyze-button';
import { CompanionPanel, type PanelPosition } from './companion-panel';

const HOST_ID = 'yomitan-copilot-companion-host';

export class PanelHost {
  private hostElement: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private button: AnalyzeButton;
  private panel: CompanionPanel;
  private reopenBtn: HTMLButtonElement | null = null;
  private theme: 'light' | 'dark' = 'light';

  constructor() {
    this.button = new AnalyzeButton();
    this.panel = new CompanionPanel();
  }

  mount(): void {
    if (this.hostElement) return;

    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.overflow = 'visible';
    host.style.zIndex = '2147483646';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);

    this.hostElement = host;
    this.shadowRoot = host.attachShadow({ mode: 'open' });

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = getStyles(this.theme);
    this.shadowRoot.appendChild(this.styleElement);

    this.button.create(this.shadowRoot);
    this.panel.create(this.shadowRoot);

    // Floating reopen button (visible when panel is closed)
    const reopen = document.createElement('button');
    reopen.className = 'ycc-reopen-button ycc-hidden';
    reopen.type = 'button';
    reopen.textContent = '✨';
    reopen.title = 'Open AI Analysis';
    reopen.addEventListener('click', () => {
      this.panel.open();
      reopen.classList.add('ycc-hidden');
    });
    this.shadowRoot.appendChild(reopen);
    this.reopenBtn = reopen;

    // When the panel is closed, show the reopen button
    this.panel.onClose(() => {
      this.reopenBtn?.classList.remove('ycc-hidden');
    });
  }

  unmount(): void {
    this.button.destroy();
    this.panel.destroy();
    this.reopenBtn?.remove();
    this.reopenBtn = null;
    this.hostElement?.remove();
    this.hostElement = null;
    this.shadowRoot = null;
    this.styleElement = null;
  }

  getButton(): AnalyzeButton {
    return this.button;
  }

  getPanel(): CompanionPanel {
    return this.panel;
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    if (this.styleElement) {
      this.styleElement.textContent = getStyles(theme);
    }
  }

  setPanelPosition(pos: PanelPosition): void {
    this.panel.setPosition(pos);
    // Update reopen button position class
    if (this.reopenBtn) {
      this.reopenBtn.className = `ycc-reopen-button ycc-reopen--${pos}`;
      if (!this.panel.isOpen()) {
        // keep visible
      } else {
        this.reopenBtn.classList.add('ycc-hidden');
      }
    }
  }

  /** Position the analyze button relative to a Yomitan popup rect. */
  positionButton(popupRect: DOMRect, mouseY?: number): void {
    this.button.position(popupRect, mouseY);
  }

  /** Hide the reopen button (e.g. when panel opens via analyze). */
  hideReopenButton(): void {
    this.reopenBtn?.classList.add('ycc-hidden');
  }

  getHostElement(): HTMLElement | null {
    return this.hostElement;
  }
}
