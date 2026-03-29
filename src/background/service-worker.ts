import { getConfig } from '../shared/storage';
import { createProvider } from '../providers/provider-factory';
import { buildAnalysisMessages } from '../prompts/grammar-analysis';
import type { ExtensionConfig } from '../shared/messages';

const PORT_NAME = 'yomitan-companion-analysis';

// Port-based streaming connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  port.onMessage.addListener(async (msg: { type: string; payload?: unknown }) => {
    if (msg.type === 'ANALYZE_REQUEST') {
      const payload = msg.payload as {
        word: string;
        sentence: string;
        wordOffset: number;
      };
      await handleAnalysisRequest(port, payload);
    }
  });
});

// One-shot message requests (config, validation)
chrome.runtime.onMessage.addListener(
  (msg: { type: string }, _sender, sendResponse) => {
    if (msg.type === 'VALIDATE_PROVIDER') {
      handleValidateProvider().then(sendResponse);
      return true; // keep channel open for async response
    }
    if (msg.type === 'GET_CONFIG') {
      handleGetConfig().then(sendResponse);
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
  payload: { word: string; sentence: string; wordOffset: number },
): Promise<void> {
  let disconnected = false;
  const onDisconnect = () => {
    disconnected = true;
  };
  port.onDisconnect.addListener(onDisconnect);

  try {
    const config = await getConfig();
    const provider = createProvider(config.provider);
    const messages = buildAnalysisMessages(payload.word, payload.sentence);

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
