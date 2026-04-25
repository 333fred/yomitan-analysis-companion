import type { ChatCompletion } from 'openai/resources/chat/completions';
import type { AvailableModel } from '../shared/messages';
import type { ILLMProvider, LLMRequest, LLMResponse } from './types';
import { parseCompletionResponse, readSSEStream } from './sse-stream';

/**
 * Provider for models deployed in Microsoft Azure AI Foundry.
 *
 * Azure AI Foundry uses the Azure AI Inference REST API, which is
 * OpenAI-compatible but differs in two key ways:
 *   1. Authentication uses an `api-key` header instead of `Authorization: Bearer`.
 *   2. The chat/completions path is `<endpoint>/models/chat/completions`
 *      (no `/v1` prefix).
 *
 * Endpoint examples:
 *   - Hub-based project:  https://<resource>.services.ai.azure.com
 *   - Serverless:         https://<deployment>.<region>.models.ai.azure.com
 */
export class AzureAiFoundryProvider implements ILLMProvider {
  readonly name = 'azure-ai-foundry';
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(endpoint: string, apiKey: string, model: string) {
    this.endpoint = AzureAiFoundryProvider.normalizeEndpoint(endpoint);
    this.apiKey = apiKey;
    this.model = model;
  }

  private get chatEndpoint(): string {
    return `${this.endpoint}/models/chat/completions`;
  }

  async sendRequest(request: LLMRequest): Promise<LLMResponse> {
    let body: Record<string, unknown>;
    try {
      body = this.buildRequestBody(request, false);
    } catch (err) {
      return {
        text: '',
        provider: this.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    let res: Response;
    try {
      res = await fetch(this.chatEndpoint, {
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
    let body: Record<string, unknown>;
    try {
      body = this.buildRequestBody(request, true);
    } catch (err) {
      return {
        text: '',
        provider: this.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    let res: Response;
    try {
      res = await fetch(this.chatEndpoint, {
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
    let model = this.model.trim();
    if (!model) {
      try {
        model =
          (
            await AzureAiFoundryProvider.fetchAvailableModels(
              this.endpoint,
              this.apiKey,
            )
          )[0]?.id ?? '';
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    if (!model) {
      return {
        valid: false,
        error: 'No models were returned from the /models endpoint.',
      };
    }

    const result = await this.sendRequest({
      messages: [{ role: 'user', content: 'Say OK.' }],
      maxTokens: 16,
      model,
    });

    if (result.success) {
      return { valid: true };
    }
    return { valid: false, error: result.error };
  }

  private buildHeaders(): Record<string, string> {
    return AzureAiFoundryProvider.buildHeaders(this.apiKey);
  }

  private static buildHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['api-key'] = apiKey;
    }
    return headers;
  }

  private buildRequestBody(
    request: LLMRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const model = request.model?.trim() || this.model.trim();
    if (!model) {
      throw new Error(
        'No model selected. Choose one from the model dropdown first.',
      );
    }

    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 2048,
      stream,
    };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    return body;
  }

  static async fetchAvailableModels(
    endpoint: string,
    apiKey: string,
  ): Promise<AvailableModel[]> {
    const normalized = this.normalizeEndpoint(endpoint);
    const modelsEndpoint = `${normalized}/models`;

    const res = await fetch(modelsEndpoint, {
      headers: this.buildHeaders(apiKey),
    });

    if (!res.ok) {
      const detail = await this.readErrorDetail(res);
      switch (res.status) {
        case 401:
          throw new Error(
            `Authentication failed: ${detail}. Check your API key.`,
          );
        case 404:
          throw new Error(
            `Models endpoint not found: ${detail}. Check your endpoint URL.`,
          );
        default:
          throw new Error(`Failed to fetch models (${res.status}): ${detail}`);
      }
    }

    const payload = (await res.json()) as unknown;
    const rawModels = this.extractModelList(payload);
    if (!rawModels) {
      throw new Error('Unexpected /models response format.');
    }

    const hostname = this.getHostname(modelsEndpoint);
    const models = new Map<string, AvailableModel>();

    for (const item of rawModels) {
      const model = this.toAvailableModel(item, hostname);
      if (model) {
        models.set(model.id, model);
      }
    }

    return Array.from(models.values()).sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }

  private static normalizeEndpoint(endpoint: string): string {
    return endpoint.replace(/\/+$/, '');
  }

  private static extractModelList(payload: unknown): unknown[] | null {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data;
    }
    if (Array.isArray(record.models)) {
      return record.models;
    }
    return null;
  }

  private static toAvailableModel(
    item: unknown,
    hostname?: string,
  ): AvailableModel | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : typeof record.name === 'string' && record.name.trim()
          ? record.name.trim()
          : '';
    if (!id) {
      return null;
    }

    const name =
      typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : id;
    const ownedBy =
      typeof record.owned_by === 'string' && record.owned_by.trim()
        ? record.owned_by.trim()
        : undefined;
    const publisher =
      ownedBy && ownedBy.toLowerCase() !== 'system'
        ? ownedBy
        : typeof record.publisher === 'string' && record.publisher.trim()
          ? record.publisher.trim()
          : hostname;

    return {
      id,
      name,
      publisher,
      summary:
        typeof record.description === 'string' ? record.description : undefined,
    };
  }

  private static getHostname(url: string): string | undefined {
    try {
      return new URL(url).hostname;
    } catch {
      return undefined;
    }
  }

  private static async readErrorDetail(res: Response): Promise<string> {
    try {
      const errorBody = await res.json();
      if (typeof errorBody.error === 'string') {
        return errorBody.error;
      }
      if (errorBody.error?.message) {
        return errorBody.error.message;
      }
      if (errorBody.message) {
        return errorBody.message;
      }
      return JSON.stringify(errorBody);
    } catch {
      return res.statusText;
    }
  }

  private async buildErrorResponse(res: Response): Promise<LLMResponse> {
    const detail = await AzureAiFoundryProvider.readErrorDetail(res);

    let error: string;
    switch (res.status) {
      case 401:
        error = `Authentication failed: ${detail}. Check your API key.`;
        break;
      case 429:
        error = `Rate limit exceeded: ${detail}. Please wait and try again.`;
        break;
      case 404:
        error = `Endpoint or model not found: ${detail}. Check your endpoint URL and model name.`;
        break;
      default:
        error = `API error ${res.status}: ${detail}`;
    }

    return { text: '', provider: this.name, success: false, error };
  }
}
