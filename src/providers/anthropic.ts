import type { ILLMProvider, LLMRequest, LLMResponse } from './types';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const STREAM_INACTIVITY_TIMEOUT_MS = 60_000;

/** Well-known Anthropic models available for direct API access. */
export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tier: 'premium' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tier: 'standard' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', tier: 'standard' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', tier: 'fast' },
] as const;

/**
 * Provider for the Anthropic Messages API (api.anthropic.com).
 *
 * Translates the shared OpenAI-format LLMRequest into Anthropic's own
 * request/response shape so the rest of the extension stays agnostic.
 */
export class AnthropicProvider implements ILLMProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-6') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async sendRequest(request: LLMRequest): Promise<LLMResponse> {
    const body = this.buildRequestBody(request, false);

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        text: '',
        provider: this.name,
        success: false,
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!res.ok) return this.buildErrorResponse(res);

    try {
      const json = await res.json();
      const text = this.extractContent(json);
      return { text, provider: this.name, success: true };
    } catch {
      return {
        text: '',
        provider: this.name,
        success: false,
        error: 'Failed to parse response JSON',
      };
    }
  }

  async streamRequest(
    request: LLMRequest,
    onChunk: (text: string) => void,
  ): Promise<LLMResponse> {
    const body = this.buildRequestBody(request, true);

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        text: '',
        provider: this.name,
        success: false,
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!res.ok) return this.buildErrorResponse(res);

    return this.readAnthropicStream(res, onChunk);
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    const result = await this.sendRequest({
      messages: [{ role: 'user', content: 'Say OK.' }],
      maxTokens: 16,
    });
    return result.success ? { valid: true } : { valid: false, error: result.error };
  }

  // ── Request building ──────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  private buildRequestBody(
    request: LLMRequest,
    stream: boolean,
  ): Record<string, unknown> {
    // Anthropic uses a top-level `system` field instead of a system message.
    const systemMessages: string[] = [];
    const messages: Array<{ role: string; content: string }> = [];

    for (const msg of request.messages) {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((p): p is { type: 'text'; text: string } => 'text' in p)
                .map((p) => p.text)
                .join('\n')
            : '';
      if (!content) continue;

      if (msg.role === 'system') {
        systemMessages.push(content);
      } else {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content,
        });
      }
    }

    const body: Record<string, unknown> = {
      model: request.model ?? this.model,
      max_tokens: request.maxTokens ?? 2048,
      messages,
      stream,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.join('\n\n');
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    return body;
  }

  // ── Response parsing ──────────────────────────────────────────────

  private extractContent(json: any): string {
    if (Array.isArray(json.content)) {
      return json.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
    }
    return '';
  }

  /**
   * Read an Anthropic SSE stream.
   *
   * Anthropic uses typed events:
   *   event: content_block_delta
   *   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
   *
   *   event: message_delta
   *   data: {"type":"message_delta","delta":{"stop_reason":"end_turn",...}}
   *
   *   event: message_stop
   *   event: error
   */
  private async readAnthropicStream(
    res: Response,
    onChunk: (text: string) => void,
  ): Promise<LLMResponse> {
    const body = res.body;
    if (!body) {
      return {
        text: '',
        provider: this.name,
        success: false,
        error: 'Response body is null — streaming not supported',
      };
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let currentEvent = '';
    let stopReason: string | null = null;
    let streamError: string | null = null;

    try {
      while (true) {
        const { done, value } = await readWithTimeout(
          reader,
          STREAM_INACTIVITY_TIMEOUT_MS,
        );
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7);
            continue;
          }

          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (currentEvent === 'error' || data.type === 'error') {
              streamError =
                data.error?.message ?? data.message ?? JSON.stringify(data);
              continue;
            }

            if (
              data.type === 'content_block_delta' &&
              data.delta?.type === 'text_delta'
            ) {
              const text = data.delta.text;
              if (text) {
                fullText += text;
                onChunk(text);
              }
            }

            if (data.type === 'message_delta' && data.delta?.stop_reason) {
              stopReason = data.delta.stop_reason;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      if (fullText) {
        return { text: fullText, provider: this.name, success: true };
      }
      return {
        text: '',
        provider: this.name,
        success: false,
        error: `Stream error: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      reader.releaseLock();
    }

    if (streamError) {
      return {
        text: fullText,
        provider: this.name,
        success: false,
        error: `API error: ${streamError}`,
      };
    }

    if (!fullText) {
      if (stopReason === 'max_tokens') {
        return {
          text: '',
          provider: this.name,
          success: false,
          error:
            'The prompt exceeded the model\'s capacity. Switch to "Brief" detail level or a larger model.',
        };
      }
      const hint = stopReason ? ` (stop_reason: ${stopReason})` : '';
      return {
        text: '',
        provider: this.name,
        success: false,
        error: `Model returned an empty response${hint}. Try a different model.`,
      };
    }

    return { text: fullText, provider: this.name, success: true };
  }

  private async buildErrorResponse(res: Response): Promise<LLMResponse> {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error?.message ?? JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }

    let error: string;
    switch (res.status) {
      case 401:
        error = `Authentication failed: ${detail}. Check your Anthropic API key.`;
        break;
      case 429:
        error = `Rate limit exceeded: ${detail}. Please wait and try again.`;
        break;
      case 404:
        error = `Model not found: ${detail}. Check the model name.`;
        break;
      default:
        error = `API error ${res.status}: ${detail}`;
    }

    return { text: '', provider: this.name, success: false, error };
  }
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Stream timed out — no data received')),
        timeoutMs,
      ),
    ),
  ]);
}
