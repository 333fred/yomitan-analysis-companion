import type { ExtensionConfig } from './messages';

export const EXTENSION_NAME = 'Yomitan Copilot Companion';
export const EXTENSION_PREFIX = 'ycc';

export const GITHUB_MODELS_ENDPOINT =
  'https://models.github.ai/inference/chat/completions';

export const SUPPORTED_GITHUB_MODELS = [
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
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
