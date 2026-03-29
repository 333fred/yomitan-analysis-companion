// TODO: Import these from '@/shared/messages' once that module exists.
// The message types must stay in sync with the background service worker.

/** Messages sent from content script → background */
interface AnalyzeRequest {
  type: 'ANALYZE_REQUEST';
  payload: { word: string; sentence: string; wordOffset: number };
}

interface ValidateProviderRequest {
  type: 'VALIDATE_PROVIDER';
}

interface GetConfigRequest {
  type: 'GET_CONFIG';
}

type OutboundMessage = AnalyzeRequest | ValidateProviderRequest | GetConfigRequest;

/** Messages received over a streaming port from background → content */
interface AnalyzeChunkMessage {
  type: 'ANALYZE_CHUNK';
  chunk: string;
  done: false;
}

interface AnalyzeCompleteMessage {
  type: 'ANALYZE_COMPLETE';
  done: true;
}

interface AnalyzeErrorMessage {
  type: 'ANALYZE_ERROR';
  error: string;
  retryable: boolean;
}

type StreamMessage = AnalyzeChunkMessage | AnalyzeCompleteMessage | AnalyzeErrorMessage;

// TODO: Import from '@/shared/config' once that module exists.
interface ExtensionConfig {
  provider: string;
  model: string;
  apiKey: string;
  customEndpoint?: string;
  promptTemplate: string;
  maxTokens: number;
  temperature: number;
}

interface ValidateProviderResponse {
  valid: boolean;
  error?: string;
  providerName: string;
}

// ── Public API ──────────────────────────────────────────────────────────

const PORT_NAME = 'yomitan-companion-analysis';

/**
 * Request a streaming analysis from the background service worker.
 *
 * Opens a long-lived port (`chrome.runtime.connect`) so the background
 * can stream chunks back incrementally. Returns a cleanup function that
 * disconnects the port early if needed (e.g. popup closed).
 */
export function requestAnalysis(
  data: { word: string; sentence: string; wordOffset: number },
  callbacks: {
    onChunk: (chunk: string) => void;
    onComplete: () => void;
    onError: (error: string, retryable: boolean) => void;
  },
): () => void {
  const port = chrome.runtime.connect({ name: PORT_NAME });

  const handleMessage = (msg: StreamMessage) => {
    switch (msg.type) {
      case 'ANALYZE_CHUNK':
        callbacks.onChunk(msg.chunk);
        break;
      case 'ANALYZE_COMPLETE':
        callbacks.onComplete();
        cleanup();
        break;
      case 'ANALYZE_ERROR':
        callbacks.onError(msg.error, msg.retryable);
        cleanup();
        break;
    }
  };

  const handleDisconnect = () => {
    // If we haven't already received a completion message, treat the
    // disconnect as an error so the UI can reset (e.g. button spinner).
    if (!cleaned) {
      const lastError = chrome.runtime.lastError;
      callbacks.onError(
        lastError?.message ?? 'Connection to background lost',
        true,
      );
    }
    cleanup();
  };

  port.onMessage.addListener(handleMessage);
  port.onDisconnect.addListener(handleDisconnect);

  // Send the analysis request over the port
  const request: AnalyzeRequest = {
    type: 'ANALYZE_REQUEST',
    payload: data,
  };
  port.postMessage(request);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    port.onMessage.removeListener(handleMessage);
    port.onDisconnect.removeListener(handleDisconnect);
    try {
      port.disconnect();
    } catch {
      // Port may already be disconnected
    }
  };

  return cleanup;
}

/**
 * One-shot message helpers using `chrome.runtime.sendMessage`.
 */

export async function validateProvider(): Promise<ValidateProviderResponse> {
  const message: ValidateProviderRequest = { type: 'VALIDATE_PROVIDER' };
  return sendMessage<ValidateProviderResponse>(message);
}

export async function getConfig(): Promise<ExtensionConfig> {
  const message: GetConfigRequest = { type: 'GET_CONFIG' };
  return sendMessage<ExtensionConfig>(message);
}

// ── Internal ────────────────────────────────────────────────────────────

function sendMessage<T>(message: OutboundMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
