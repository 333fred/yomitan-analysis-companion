import type { ILLMProvider, LLMRequest, LLMResponse } from './types';

export class OpenAICompatibleProvider implements ILLMProvider {
  readonly name = 'openai-compatible';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    // Normalize: strip trailing slash, ensure we target /chat/completions
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
  }

  private get endpoint(): string {
    // If the base URL already ends with a specific path, use it directly.
    // Otherwise append the standard OpenAI chat completions path.
    if (this.baseUrl.endsWith('/chat/completions')) {
      return this.baseUrl;
    }
    const base = this.baseUrl.replace(/\/v1\/?$/, '');
    return `${base}/v1/chat/completions`;
  }

  async sendRequest(request: LLMRequest): Promise<LLMResponse> {
    const body = this.buildRequestBody(request, false);

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
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

    if (!res.ok) {
      return this.buildErrorResponse(res);
    }

    try {
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content ?? '';
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
      res = await fetch(this.endpoint, {
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

    if (!res.ok) {
      return this.buildErrorResponse(res);
    }

    return this.readSSEStream(res, onChunk);
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    const result = await this.sendRequest({
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 1,
    });

    if (result.success) {
      return { valid: true };
    }
    return { valid: false, error: result.error };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private buildRequestBody(
    request: LLMRequest,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: request.model ?? this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 2048,
      stream,
    };
  }

  private async buildErrorResponse(res: Response): Promise<LLMResponse> {
    let detail = '';
    try {
      const errorBody = await res.json();
      // Handle OpenAI format: { error: { message } }
      // Handle Ollama format: { error: "string" }
      // Handle generic: { message: "string" }
      if (typeof errorBody.error === 'string') {
        detail = errorBody.error;
      } else if (errorBody.error?.message) {
        detail = errorBody.error.message;
      } else if (errorBody.message) {
        detail = errorBody.message;
      } else {
        detail = JSON.stringify(errorBody);
      }
    } catch {
      detail = res.statusText;
    }

    let error: string;
    switch (res.status) {
      case 401:
        error = `Authentication failed: ${detail}. Check your API key.`;
        break;
      case 429:
        error = `Rate limit exceeded: ${detail}. Please wait and try again.`;
        break;
      case 404:
        error = `Endpoint or model not found: ${detail}. Check your base URL and model name.`;
        break;
      default:
        error = `API error ${res.status}: ${detail}`;
    }

    return { text: '', provider: this.name, success: false, error };
  }

  private async readSSEStream(
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed === 'data: [DONE]') {
            return { text: fullText, provider: this.name, success: true };
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
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

    return { text: fullText, provider: this.name, success: true };
  }
}
