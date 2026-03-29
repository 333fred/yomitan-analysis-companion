import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface LLMRequest {
  messages: ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  text: string;
  provider: string;
  success: boolean;
  error?: string;
}

export interface ILLMProvider {
  readonly name: string;
  sendRequest(request: LLMRequest): Promise<LLMResponse>;
  streamRequest(
    request: LLMRequest,
    onChunk: (text: string) => void,
  ): Promise<LLMResponse>;
  validate(): Promise<{ valid: boolean; error?: string }>;
}
