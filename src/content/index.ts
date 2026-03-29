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

/** Sentence captured eagerly when the popup first appears, before the user
 *  has a chance to click our button (which dismisses Yomitan's popup and
 *  deselects the text). */
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
  cancelCurrentAnalysis();
  ensureMounted();

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  panelHost.setTheme(isDark ? 'dark' : 'light');

  // Hide stale analysis from a previous lookup
  panelHost.getPanel().hide();

  // Pre-capture sentence while the hovered text is still accessible.
  // Clicking our button will dismiss Yomitan and deselect the text,
  // so we must grab the data now.
  preCapturedSentence = extractor.extractSentence();

  panelHost.getButton().show();
  panelHost.positionRelativeTo(event.rect);
}

function onPopupHidden(): void {
  // While an analysis is running or results are displayed, keep UI visible
  if (isAnalyzing) return;

  // Keep the button visible briefly so the user can still reach it after
  // Yomitan auto-dismisses (mouse-leave or click-outside behaviour).
  cancelHideGrace();
  hideGraceTimer = window.setTimeout(() => {
    panelHost.getButton().hide();
    panelHost.getPanel().hide();
    preCapturedSentence = null;
    hideGraceTimer = null;
  }, HIDE_GRACE_MS);
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
  isAnalyzing = false;
}

// ── Analysis flow ───────────────────────────────────────────────────────

function onAnalyzeClick(): void {
  if (isAnalyzing) return;

  cancelHideGrace();

  // Try live extraction first (in case user manually selected text),
  // then fall back to the data we captured when the popup appeared.
  const data = extractor.extractSentence() ?? preCapturedSentence;
  if (!data) {
    console.warn(LOG_PREFIX, 'Could not extract sentence from page');
    panelHost.getPanel().showError(
      'Could not extract sentence. Try selecting text first.', false,
    );
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
