import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { LLMResponse } from './types';

/** How long (ms) to wait for the next chunk before treating the stream as stalled. */
const STREAM_INACTIVITY_TIMEOUT_MS = 60_000;

export function parseCompletionResponse(
  json: ChatCompletion,
  providerName: string,
): LLMResponse {
  const text = json.choices?.[0]?.message?.content ?? '';
  return { text, provider: providerName, success: true };
}

export async function readSSEStream(
  res: Response,
  providerName: string,
  onChunk: (text: string) => void,
): Promise<LLMResponse> {
  const body = res.body;
  if (!body) {
    return {
      text: '',
      provider: providerName,
      success: false,
      error: 'Response body is null — streaming not supported',
    };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let finishReason: string | null = null;
  let streamError: string | null = null;

  try {
    while (true) {
      const { done, value } = await readWithTimeout(reader, STREAM_INACTIVITY_TIMEOUT_MS);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          return buildStreamResult(fullText, providerName, finishReason, streamError);
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);

            // Check for error objects in the stream (some APIs embed errors
            // in the SSE body after sending a 200 status).
            if (parsed.error) {
              streamError =
                typeof parsed.error === 'string'
                  ? parsed.error
                  : parsed.error.message ?? JSON.stringify(parsed.error);
              continue;
            }

            const chunk = parsed as ChatCompletionChunk;
            const choice = chunk.choices?.[0];
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
            }
            const content = choice?.delta?.content;
            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    }
  } catch (err) {
    if (fullText) {
      return { text: fullText, provider: providerName, success: true };
    }
    return {
      text: '',
      provider: providerName,
      success: false,
      error: `Stream error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    reader.releaseLock();
  }

  return buildStreamResult(fullText, providerName, finishReason, streamError);
}

/** Read with an inactivity timeout so a stalled stream doesn't hang forever. */
async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Stream timed out — no data received')), timeoutMs),
    ),
  ]);
}

function buildStreamResult(
  fullText: string,
  providerName: string,
  finishReason: string | null,
  streamError: string | null,
): LLMResponse {
  if (streamError) {
    return {
      text: fullText,
      provider: providerName,
      success: false,
      error: `API stream error: ${streamError}`,
    };
  }

  if (finishReason === 'content_filter') {
    return {
      text: fullText,
      provider: providerName,
      success: false,
      error: 'Response blocked by content filter. Try rephrasing or using a different model.',
    };
  }

  if (!fullText) {
    if (finishReason === 'length') {
      return {
        text: '',
        provider: providerName,
        success: false,
        error:
          'The prompt exceeded the model\'s context window — no room for output. ' +
          'Switch to "Brief" detail level in settings, or use a larger model.',
      };
    }
    const hint = finishReason ? ` (finish_reason: ${finishReason})` : '';
    return {
      text: '',
      provider: providerName,
      success: false,
      error: `Model returned an empty response${hint}. Try a different model.`,
    };
  }

  return { text: fullText, provider: providerName, success: true };
}
