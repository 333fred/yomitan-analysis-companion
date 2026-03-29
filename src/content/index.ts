import { YomitanObserver, type YomitanPopupEvent } from './yomitan-observer';
import { SentenceExtractor, type SentenceData } from './sentence-extractor';
import { requestAnalysis } from './messaging';
import { PanelHost } from './ui/panel-host';
import { getConfig } from '../shared/storage';

const LOG = '[YomitanCompanion]';

// ── State ───────────────────────────────────────────────────────────────

const observer = new YomitanObserver();
const extractor = new SentenceExtractor();
const panelHost = new PanelHost();

let mounted = false;
let cancelStream: (() => void) | null = null;
let isAnalyzing = false;
let lastSentenceData: SentenceData | null = null;
let preCapturedSentence: SentenceData | null = null;

/** Grace-period timer that keeps the button visible after Yomitan hides. */
let hideGraceTimer: number | null = null;
const HIDE_GRACE_MS = 3000;

// ── Orchestration ───────────────────────────────────────────────────────

function handlePopupEvent(event: YomitanPopupEvent): void {
  switch (event.type) {
    case 'shown':
      onPopupShown(event);
      break;
    case 'hidden':
      onPopupHidden();
      break;
    case 'repositioned':
      onPopupRepositioned(event);
      break;
  }
}

function onPopupShown(event: YomitanPopupEvent): void {
  if (!event.rect) return;

  cancelHideGrace();
  ensureMounted();

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  panelHost.setTheme(isDark ? 'dark' : 'light');

  // Pre-capture sentence while text is accessible (before user clicks our
  // button, which dismisses Yomitan and deselects the text).
  preCapturedSentence = extractor.extractSentence();

  panelHost.getButton().show();
  panelHost.positionButton(event.rect);
}

function onPopupHidden(): void {
  // Keep button visible briefly so user can reach it after Yomitan dismisses
  cancelHideGrace();
  hideGraceTimer = window.setTimeout(() => {
    panelHost.getButton().hide();
    hideGraceTimer = null;
  }, HIDE_GRACE_MS);
}

function onPopupRepositioned(event: YomitanPopupEvent): void {
  if (!event.rect) return;
  panelHost.positionButton(event.rect);
}

function ensureMounted(): void {
  if (mounted) return;

  panelHost.mount();
  panelHost.getButton().onClick(onAnalyzeClick);

  // Load panel position from config
  getConfig().then((config) => {
    panelHost.setPanelPosition(config.appearance.panelPosition);
  });

  mounted = true;
}

function cancelHideGrace(): void {
  if (hideGraceTimer !== null) {
    clearTimeout(hideGraceTimer);
    hideGraceTimer = null;
  }
}

function cancelCurrentAnalysis(): void {
  if (cancelStream) {
    cancelStream();
    cancelStream = null;
  }
  if (isAnalyzing) {
    panelHost.getButton().setLoading(false);
    isAnalyzing = false;
  }
}

// ── Analysis flow ───────────────────────────────────────────────────────

function onAnalyzeClick(): void {
  if (isAnalyzing) return;

  cancelHideGrace();

  const data = extractor.extractSentence() ?? preCapturedSentence;
  if (!data) {
    console.warn(LOG, 'Could not extract sentence from page');
    const panel = panelHost.getPanel();
    panel.clearContent();
    panel.showError('Could not extract sentence. Try selecting text first.', false);
    panel.open();
    panelHost.hideReopenButton();
    return;
  }

  lastSentenceData = data;
  startAnalysis(data);
}

function startAnalysis(data: SentenceData): void {
  cancelCurrentAnalysis();
  isAnalyzing = true;

  const button = panelHost.getButton();
  const panel = panelHost.getPanel();

  button.setLoading(true);
  panel.clearContent();
  panel.showLoading();
  panel.open();
  panelHost.hideReopenButton();

  cancelStream = requestAnalysis(data, {
    onChunk(chunk: string) {
      panel.appendStreamingChunk(chunk);
    },
    onComplete() {
      panel.finishStreaming();
      button.setLoading(false);
      isAnalyzing = false;
      cancelStream = null;
    },
    onError(error: string, retryable: boolean) {
      panel.showError(error, retryable, retryable ? () => {
        if (lastSentenceData) {
          startAnalysis(lastSentenceData);
        }
      } : undefined);
      button.setLoading(false);
      isAnalyzing = false;
      cancelStream = null;
    },
  });
}

// ── Bootstrap ───────────────────────────────────────────────────────────

function init(): void {
  extractor.startTracking();
  observer.addListener(handlePopupEvent);
  observer.start();
  console.debug(LOG, 'Content script initialized');
}

function destroy(): void {
  cancelCurrentAnalysis();
  cancelHideGrace();
  observer.stop();
  extractor.stopTracking();

  if (mounted) {
    panelHost.unmount();
    mounted = false;
  }

  console.debug(LOG, 'Content script destroyed');
}

if (typeof globalThis !== 'undefined') {
  const prevDestroy = (globalThis as Record<string, unknown>).__yomitanCompanionDestroy;
  if (typeof prevDestroy === 'function') prevDestroy();
  (globalThis as Record<string, unknown>).__yomitanCompanionDestroy = destroy;
}

init();
