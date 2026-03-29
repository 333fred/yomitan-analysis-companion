import { YomitanObserver, type YomitanPopupEvent } from './yomitan-observer';
import { SentenceExtractor, type SentenceData } from './sentence-extractor';
import { requestAnalysis } from './messaging';
import { PanelHost } from './ui/panel-host';

const LOG_PREFIX = '[YomitanCompanion]';

// ── State ───────────────────────────────────────────────────────────────

const observer = new YomitanObserver();
const extractor = new SentenceExtractor();
const panelHost = new PanelHost();

let mounted = false;
let cancelStream: (() => void) | null = null;
let isAnalyzing = false;
let lastSentenceData: SentenceData | null = null;

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

  ensureMounted();

  // Detect and apply theme
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  panelHost.setTheme(isDark ? 'dark' : 'light');

  const button = panelHost.getButton();
  button.show();
  panelHost.positionRelativeTo(event.rect);
}

function onPopupHidden(): void {
  const button = panelHost.getButton();
  const panel = panelHost.getPanel();

  button.hide();
  panel.hide();
  cancelCurrentAnalysis();
}

function onPopupRepositioned(event: YomitanPopupEvent): void {
  if (!event.rect) return;
  panelHost.positionRelativeTo(event.rect);
}

function ensureMounted(): void {
  if (mounted) return;

  panelHost.mount();
  panelHost.getButton().onClick(onAnalyzeClick);
  mounted = true;
}

function cancelCurrentAnalysis(): void {
  if (cancelStream) {
    cancelStream();
    cancelStream = null;
  }
  isAnalyzing = false;
}

// ── Analysis flow ───────────────────────────────────────────────────────

function onAnalyzeClick(): void {
  if (isAnalyzing) return;

  const data: SentenceData | null = extractor.extractSentence();
  if (!data) {
    console.warn(LOG_PREFIX, 'Could not extract sentence from page');
    const panel = panelHost.getPanel();
    panel.showError('Could not extract sentence. Try selecting text first.', false);
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
  panel.showLoading();
  panel.show();

  const popupRect = observer.getCurrentPopupRect();
  if (popupRect) {
    panelHost.positionRelativeTo(popupRect);
  }

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
  console.debug(LOG_PREFIX, 'Content script initialized');
}

function destroy(): void {
  cancelCurrentAnalysis();
  observer.stop();
  extractor.stopTracking();

  if (mounted) {
    panelHost.unmount();
    mounted = false;
  }

  console.debug(LOG_PREFIX, 'Content script destroyed');
}

// Ensure we clean up if the content script is unloaded (e.g. extension update)
if (typeof globalThis !== 'undefined') {
  const prevDestroy = (globalThis as Record<string, unknown>).__yomitanCompanionDestroy;
  if (typeof prevDestroy === 'function') prevDestroy();
  (globalThis as Record<string, unknown>).__yomitanCompanionDestroy = destroy;
}

init();
