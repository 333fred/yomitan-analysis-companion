import type { ExtensionConfig } from './messages';

export const EXTENSION_NAME = 'Yomitan Copilot Companion';
export const EXTENSION_PREFIX = 'ycc';

export const GITHUB_MODELS_ENDPOINT =
  'https://models.github.ai/inference/chat/completions';

/** Fallback list used when the catalog API is unreachable (e.g. no token yet). */
export const FALLBACK_GITHUB_MODELS = [
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', publisher: 'openai' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', publisher: 'openai' },
  { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', publisher: 'openai' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', publisher: 'openai' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', publisher: 'openai' },
] as const;

export const YOMITAN_SELECTORS = {
  iframe: 'iframe.yomitan-popup',
  popupOuter: '[id^="yomitan-popup"]',
  popupInner: '.yomitan-popup-inner',
  floatContainer: '.yomitan-float',
} as const;

export const SENTENCE_TERMINATORS = [
  '。',
  '！',
  '？',
  '!',
  '?',
  '…',
  '\n',
] as const;

export const MAX_SENTENCE_LENGTH = 500;
export const ANALYSIS_TIMEOUT_MS = 30_000;

export const DEFAULT_CONFIG: ExtensionConfig = {
  provider: {
    type: 'github-models',
    githubModels: {
      token: '',
      model: 'openai/gpt-4.1',
    },
  },
  analysis: {
    explanationLanguage: 'english',
    detailLevel: 'full',
  },
  appearance: {
    theme: 'auto',
  },
};
