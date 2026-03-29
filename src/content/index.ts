import { YomitanObserver, type YomitanPopupEvent } from './yomitan-observer';
import { SentenceExtractor, type SentenceData } from './sentence-extractor';
import { requestAnalysis, fetchModels } from './messaging';
import { PanelHost } from './ui/panel-host';
import type { ModelGroup } from './ui/companion-panel';
import { getConfig, setConfig } from '../shared/storage';
import type { ExtensionConfig, ProviderConfig } from '../shared/messages';

const LOG = '[YomitanCompanion]';

const MODEL_SEP = '::';

/** Static Anthropic model list (avoids importing the full provider module). */
const ANTHROPIC_MODEL_NAMES: Array<{ id: string; name: string }> = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
];

// ── State ───────────────────────────────────────────────────────────────

const observer = new YomitanObserver();
const extractor = new SentenceExtractor();
const panelHost = new PanelHost();

let mounted = false;
let cancelStream: (() => void) | null = null;
let isAnalyzing = false;
let lastSentenceData: SentenceData | null = null;
let preCapturedSentence: SentenceData | null = null;
let scrollHandler: (() => void) | null = null;
let pointerHandler: ((e: PointerEvent) => void) | null = null;

/** Grace-period timer that keeps the button visible after Yomitan hides. */
let hideGraceTimer: number | null = null;
const HIDE_GRACE_MS = 1500;

/** Current model override (null = use default from config). */
let activeModelOverride: { providerType: string; model: string } | null = null;
/** Encoded value of the user's default model (from config). */
let defaultModelEncoded = '';
/** Whether models have been loaded into the panel dropdown. */
let modelsLoaded = false;

// ── Model helpers ───────────────────────────────────────────────────────

function encodeModel(provider: string, modelId: string): string {
  return `${provider}${MODEL_SEP}${modelId}`;
}

function decodeModel(value: string): { providerType: string; model: string } | null {
  const idx = value.indexOf(MODEL_SEP);
  if (idx < 0) return null;
  return {
    providerType: value.slice(0, idx),
    model: value.slice(idx + MODEL_SEP.length),
  };
}

function getDefaultModelEncoded(config: ExtensionConfig): string {
  const { type } = config.provider;
  let model = '';
  switch (type) {
    case 'github-models': model = config.provider.githubModels?.model ?? ''; break;
    case 'anthropic': model = config.provider.anthropic?.model ?? ''; break;
    case 'openai-compatible': model = config.provider.openaiCompatible?.model ?? ''; break;
  }
  return encodeModel(type, model);
}

async function loadModelsIntoPanel(config: ExtensionConfig): Promise<void> {
  const groups: ModelGroup[] = [];

  // GitHub Models (async catalog fetch)
  const ghToken = config.provider.githubModels?.token;
  if (ghToken) {
    try {
      const result = await fetchModels(ghToken);
      if (result.models.length > 0) {
        groups.push({
          label: 'GitHub Models',
          options: result.models.map((m) => ({
            value: encodeModel('github-models', m.id),
            label: `${m.name} (${m.publisher})`,
          })),
        });
      }
    } catch {
      // Ignore fetch errors; the dropdown just won't have GitHub models
    }
  }

  // Anthropic
  if (config.provider.anthropic?.apiKey) {
    groups.push({
      label: 'Anthropic (Claude)',
      options: ANTHROPIC_MODEL_NAMES.map((m) => ({
        value: encodeModel('anthropic', m.id),
        label: m.name,
      })),
    });
  }

  // OpenAI-compatible
  const oai = config.provider.openaiCompatible;
  if (oai?.baseUrl && oai?.model) {
    groups.push({
      label: 'Custom Endpoint',
      options: [{ value: encodeModel('openai-compatible', oai.model), label: oai.model }],
    });
  }

  if (groups.length > 0) {
    defaultModelEncoded = getDefaultModelEncoded(config);
    const currentValue = activeModelOverride
      ? encodeModel(activeModelOverride.providerType, activeModelOverride.model)
      : defaultModelEncoded;
    panelHost.getPanel().setModels(groups, currentValue, defaultModelEncoded);
    modelsLoaded = true;
  }
}

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

/** Scroll means the user moved on — hide the button immediately. */
function onPageScroll(): void {
  if (hideGraceTimer !== null) {
    cancelHideGrace();
    panelHost.getButton().hide();
  }
}

/** Click outside our UI — hide the button immediately. */
function onPagePointerDown(e: PointerEvent): void {
  if (isAnalyzing) return;
  // Event target is retargeted to the shadow host for clicks on our UI
  if (e.target === panelHost.getHostElement()) return;
  cancelHideGrace();
  panelHost.getButton().hide();
}

function onPopupRepositioned(event: YomitanPopupEvent): void {
  if (!event.rect) return;
  panelHost.positionButton(event.rect);
  // Re-capture sentence since the user may be hovering over a different word
  preCapturedSentence = extractor.extractSentence();
}

function ensureMounted(): void {
  if (mounted) return;

  panelHost.mount();
  panelHost.getButton().onClick(onAnalyzeClick);

  const panel = panelHost.getPanel();

  // Model switcher callbacks
  panel.onModelChange((encodedValue) => {
    const decoded = decodeModel(encodedValue);
    if (!decoded) return;

    // Set override (or clear if switching back to default)
    if (encodedValue === defaultModelEncoded) {
      activeModelOverride = null;
    } else {
      activeModelOverride = decoded;
    }

    // Re-run analysis with the new model if we have sentence data
    if (lastSentenceData) {
      startAnalysis(lastSentenceData);
    }
  });

  panel.onMakeDefault(async (encodedValue) => {
    const decoded = decodeModel(encodedValue);
    if (!decoded) return;

    const providerType = decoded.providerType as ProviderConfig['type'];
    const config = await getConfig();
    config.provider.type = providerType;
    switch (providerType) {
      case 'github-models':
        if (config.provider.githubModels) config.provider.githubModels.model = decoded.model;
        break;
      case 'anthropic':
        if (config.provider.anthropic) config.provider.anthropic.model = decoded.model;
        break;
      case 'openai-compatible':
        if (config.provider.openaiCompatible) config.provider.openaiCompatible.model = decoded.model;
        break;
    }

    await setConfig({ provider: config.provider });
    defaultModelEncoded = encodedValue;
    activeModelOverride = null;
    panel.setDefaultModel(encodedValue);
  });

  // Load panel position and model catalog
  getConfig().then((config) => {
    panelHost.setPanelPosition(config.appearance.panelPosition);
    if (!modelsLoaded) {
      loadModelsIntoPanel(config);
    }
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
  // Reset model override on new word lookups so we start with the default
  activeModelOverride = null;
  startAnalysis(data);
}

function startAnalysis(data: SentenceData): void {
  cancelCurrentAnalysis();
  isAnalyzing = true;

  const button = panelHost.getButton();
  const panel = panelHost.getPanel();

  button.setLoading(true);
  panel.clearContent();
  panel.setSentence(data.word, data.sentence, data.wordOffset);
  panel.showLoading();
  panel.open();
  panelHost.hideReopenButton();

  cancelStream = requestAnalysis(
    data,
    {
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
    },
    activeModelOverride ?? undefined,
  );
}

// ── Bootstrap ───────────────────────────────────────────────────────────

function init(): void {
  extractor.startTracking();
  observer.addListener(handlePopupEvent);
  observer.start();

  scrollHandler = onPageScroll;
  document.addEventListener('scroll', scrollHandler, { passive: true, capture: true });

  pointerHandler = onPagePointerDown;
  document.addEventListener('pointerdown', pointerHandler, { capture: true });

  console.debug(LOG, 'Content script initialized');
}

function destroy(): void {
  cancelCurrentAnalysis();
  cancelHideGrace();
  observer.stop();
  extractor.stopTracking();

  if (scrollHandler) {
    document.removeEventListener('scroll', scrollHandler, { capture: true });
    scrollHandler = null;
  }

  if (pointerHandler) {
    document.removeEventListener('pointerdown', pointerHandler, { capture: true });
    pointerHandler = null;
  }

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
