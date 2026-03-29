import type { ChatCompletion } from 'openai/resources/chat/completions';
import { GITHUB_MODELS_ENDPOINT } from '../shared/config';
import type { ILLMProvider, LLMRequest, LLMResponse } from './types';
import { parseCompletionResponse, readSSEStream } from './sse-stream';

export interface GitHubModel {
  id: string;
  name: string;
  publisher: string;
  capabilities: string[];
  rateLimitTier: string;
}

export class GitHubModelsProvider implements ILLMProvider {
  readonly name = 'github-models';
  private readonly token: string;
  private readonly model: string;

  constructor(token: string, model: string = 'openai/gpt-4.1') {
    this.token = token;
    this.model = model;
  }

  async sendRequest(request: LLMRequest): Promise<LLMResponse> {
    const body = this.buildRequestBody(request, false);

    let res: Response;
    try {
      res = await fetch(GITHUB_MODELS_ENDPOINT, {
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
      const json: ChatCompletion = await res.json();
      return parseCompletionResponse(json, this.name);
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
      res = await fetch(GITHUB_MODELS_ENDPOINT, {
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

    return readSSEStream(res, this.name, onChunk);
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
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  private buildRequestBody(
    request: LLMRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model ?? this.model,
      messages: request.messages,
      max_completion_tokens: request.maxTokens ?? 2048,
      stream,
    };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    return body;
  }

  static async fetchAvailableModels(token: string): Promise<GitHubModel[]> {
    const res = await fetch('https://models.github.ai/catalog/models', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const models = await res.json();
    return models
      .filter(
        (m: any) =>
          m.supported_input_modalities?.includes('text') &&
          m.supported_output_modalities?.includes('text'),
      )
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        publisher: m.publisher,
        capabilities: m.capabilities ?? [],
        rateLimitTier: m.rate_limit_tier ?? 'unknown',
      }));
  }

  private async buildErrorResponse(res: Response): Promise<LLMResponse> {
    let detail = '';
    try {
      const errorBody = await res.json();
      detail = errorBody.error?.message ?? JSON.stringify(errorBody);
    } catch {
      detail = res.statusText;
    }

    let error: string;
    switch (res.status) {
      case 401:
        error = `Authentication failed: ${detail}. Check your GitHub token.`;
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
