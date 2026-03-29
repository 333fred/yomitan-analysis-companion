import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { LLMResponse } from './types';

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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          return { text: fullText, provider: providerName, success: true };
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed: ChatCompletionChunk = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
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
      // Partial success — return what we got
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

  return { text: fullText, provider: providerName, success: true };
}
