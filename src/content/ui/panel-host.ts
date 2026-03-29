import { getStyles } from './styles';
import { AnalyzeButton } from './analyze-button';
import { CompanionPanel } from './companion-panel';

const HOST_ID = 'yomitan-copilot-companion-host';

export class PanelHost {
  private hostElement: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private button: AnalyzeButton;
  private panel: CompanionPanel;
  private theme: 'light' | 'dark' = 'light';

  constructor() {
    this.button = new AnalyzeButton();
    this.panel = new CompanionPanel();
  }

  mount(): void {
    if (this.hostElement) return;

    // Remove any stale host from a previous content-script injection
    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    // Fixed positioning so viewport coords from getBoundingClientRect work directly
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

    // Inject styles
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = getStyles(this.theme);
    this.shadowRoot.appendChild(this.styleElement);

    this.button.create(this.shadowRoot);
    this.panel.create(this.shadowRoot);
  }

  unmount(): void {
    this.button.destroy();
    this.panel.destroy();
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

  positionRelativeTo(popupRect: DOMRect): void {
    // Position the button centered below the popup
    this.button.position(popupRect);

    // Position the panel below the button
    const btnEl = this.button.getElement();
    if (btnEl) {
      const btnRect = btnEl.getBoundingClientRect();
      this.panel.position(popupRect, btnRect);
    }
  }
}
