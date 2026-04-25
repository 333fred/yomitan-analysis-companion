import { getConfig } from '../shared/storage';
import { createProvider } from '../providers/provider-factory';
import { buildAnalysisMessages } from '../prompts/grammar-analysis';
import {
  tokenize,
  formatTokensForPrompt,
} from '../tokenizer/kuromoji-tokenizer';
import { GitHubModelsProvider } from '../providers/github-models';
import { OpenAICompatibleProvider } from '../providers/openai-compatible';
import { AzureAiFoundryProvider } from '../providers/azure-ai-foundry';
import { FALLBACK_GITHUB_MODELS } from '../shared/config';
import type {
  ExtensionConfig,
  FetchModelsRequest,
  FetchModelsResult,
} from '../shared/messages';

const PORT_NAME = 'yomitan-companion-analysis';

// Port-based streaming connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  port.onMessage.addListener(
    async (msg: { type: string; payload?: unknown }) => {
      if (msg.type === 'ANALYZE_REQUEST') {
        const payload = msg.payload as {
          word: string;
          sentence: string;
          wordOffset: number;
          modelOverride?: { providerType: string; model: string };
        };
        await handleAnalysisRequest(port, payload);
      }
    },
  );
});

// One-shot message requests (config, validation)
chrome.runtime.onMessage.addListener(
  (
    msg: { type: string; payload?: Record<string, unknown> },
    _sender,
    sendResponse,
  ) => {
    if (msg.type === 'VALIDATE_PROVIDER') {
      handleValidateProvider().then(sendResponse);
      return true; // keep channel open for async response
    }
    if (msg.type === 'GET_CONFIG') {
      handleGetConfig().then(sendResponse);
      return true;
    }
    if (msg.type === 'FETCH_MODELS') {
      handleFetchModels(
        msg.payload as FetchModelsRequest['payload'] | undefined,
      ).then(sendResponse);
      return true;
    }
    return false;
  },
);

/**
 * Stream an AI grammar analysis back to the content script over a
 * long-lived port. Handles mid-stream disconnects gracefully.
 */
async function handleAnalysisRequest(
  port: chrome.runtime.Port,
  payload: {
    word: string;
    sentence: string;
    wordOffset: number;
    modelOverride?: { providerType: string; model: string };
  },
): Promise<void> {
  let disconnected = false;
  const onDisconnect = () => {
    disconnected = true;
  };
  port.onDisconnect.addListener(onDisconnect);

  try {
    const config = await getConfig();

    // Apply model override if provided
    if (payload.modelOverride) {
      const { providerType, model } = payload.modelOverride;
      config.provider.type = providerType as typeof config.provider.type;
      switch (providerType) {
        case 'github-models':
          if (config.provider.githubModels)
            config.provider.githubModels.model = model;
          break;
        case 'anthropic':
          if (config.provider.anthropic)
            config.provider.anthropic.model = model;
          break;
        case 'openai-compatible':
          if (config.provider.openaiCompatible)
            config.provider.openaiCompatible.model = model;
          break;
        case 'azure-ai-foundry':
          if (config.provider.azureAiFoundry)
            config.provider.azureAiFoundry.model = model;
          break;
      }
    }

    const provider = createProvider(config.provider);

    // Tokenize the sentence for morphological grounding
    let tokenTable: string | undefined;
    try {
      const tokens = await tokenize(payload.sentence);
      tokenTable = formatTokensForPrompt(tokens);
    } catch (err) {
      console.warn(
        '[YomitanCompanion:SW] Tokenization failed, proceeding without:',
        err,
      );
    }

    const messages = buildAnalysisMessages(
      payload.word,
      payload.sentence,
      config.analysis.detailLevel,
      tokenTable,
    );

    const result = await provider.streamRequest({ messages }, (chunk) => {
      if (!disconnected) {
        port.postMessage({ type: 'ANALYZE_CHUNK', chunk, done: false });
      }
    });

    if (disconnected) return;

    if (result.success) {
      port.postMessage({ type: 'ANALYZE_COMPLETE', done: true });
    } else {
      port.postMessage({
        type: 'ANALYZE_ERROR',
        error: result.error ?? 'Unknown provider error',
        retryable: isRetryableError(result.error ?? ''),
      });
    }
  } catch (error) {
    if (disconnected) return;
    const message = error instanceof Error ? error.message : String(error);
    port.postMessage({
      type: 'ANALYZE_ERROR',
      error: message,
      retryable: isRetryableError(message),
    });
  }
}

/** Validate that the current provider config can reach the API. */
async function handleValidateProvider(): Promise<{
  valid: boolean;
  error?: string;
  providerName: string;
}> {
  try {
    const config = await getConfig();
    const provider = createProvider(config.provider);
    const result = await provider.validate();
    return { ...result, providerName: provider.name };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      providerName: 'unknown',
    };
  }
}

/** Return the full extension config for the caller. */
async function handleGetConfig(): Promise<ExtensionConfig> {
  return getConfig();
}

/** Fetch available models for the requested provider. */
async function handleFetchModels(
  request?: FetchModelsRequest['payload'],
): Promise<FetchModelsResult['payload']> {
  const config = await getConfig();
  const providerType =
    request?.providerType ??
    (request?.endpoint
      ? 'azure-ai-foundry'
      : request?.baseUrl
        ? 'openai-compatible'
        : request?.token
          ? 'github-models'
          : config.provider.type);

  if (providerType === 'azure-ai-foundry') {
    const endpoint =
      request?.endpoint?.trim() ||
      config.provider.azureAiFoundry?.endpoint?.trim();
    const apiKey =
      request?.apiKey ?? config.provider.azureAiFoundry?.apiKey ?? '';
    const fallbackModels = buildSavedModelFallback(
      request?.model ?? config.provider.azureAiFoundry?.model,
      endpoint,
    );

    if (!endpoint) {
      return {
        models: fallbackModels,
        error: 'No Azure AI Foundry endpoint configured',
      };
    }

    try {
      const models = await AzureAiFoundryProvider.fetchAvailableModels(
        endpoint,
        apiKey,
      );
      return { models: models.length > 0 ? models : fallbackModels };
    } catch (error) {
      return {
        models: fallbackModels,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (providerType === 'openai-compatible') {
    const baseUrl =
      request?.baseUrl?.trim() ||
      config.provider.openaiCompatible?.baseUrl?.trim();
    const apiKey =
      request?.apiKey ?? config.provider.openaiCompatible?.apiKey ?? '';
    const fallbackModels = buildSavedModelFallback(
      request?.model ?? config.provider.openaiCompatible?.model,
      baseUrl,
    );

    if (!baseUrl) {
      return {
        models: fallbackModels,
        error: 'No OpenAI-compatible base URL configured',
      };
    }

    try {
      const models = await OpenAICompatibleProvider.fetchAvailableModels(
        baseUrl,
        apiKey,
      );
      return { models: models.length > 0 ? models : fallbackModels };
    } catch (error) {
      return {
        models: fallbackModels,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    const token = request?.token || config.provider.githubModels?.token;
    if (!token) {
      return {
        models: [...FALLBACK_GITHUB_MODELS],
        error: 'No GitHub token configured',
      };
    }
    const models = await GitHubModelsProvider.fetchAvailableModels(token);
    return { models };
  } catch (error) {
    return {
      models: [...FALLBACK_GITHUB_MODELS],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildSavedModelFallback(
  model: string | undefined,
  baseUrl?: string,
): FetchModelsResult['payload']['models'] {
  const modelId = model?.trim();
  if (!modelId) {
    return [];
  }

  let publisher: string | undefined;
  if (baseUrl) {
    try {
      publisher = new URL(baseUrl).hostname;
    } catch {
      publisher = undefined;
    }
  }

  return [
    {
      id: modelId,
      name: modelId,
      publisher,
    },
  ];
}

/** Determine if an error is transient and worth retrying. */
function isRetryableError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504')
  );
}
