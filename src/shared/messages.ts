export const MESSAGE_TYPES = {
  ANALYZE_REQUEST: 'analyze-request',
  ANALYZE_CHUNK: 'analyze-chunk',
  ANALYZE_COMPLETE: 'analyze-complete',
  ANALYZE_ERROR: 'analyze-error',
  VALIDATE_PROVIDER: 'validate-provider',
  VALIDATE_RESULT: 'validate-result',
  GET_CONFIG: 'get-config',
  CONFIG_RESULT: 'config-result',
  FETCH_MODELS: 'fetch-models',
  FETCH_MODELS_RESULT: 'fetch-models-result',
} as const;

export interface AnalyzeRequest {
  type: typeof MESSAGE_TYPES.ANALYZE_REQUEST;
  payload: {
    word: string;
    sentence: string;
    wordOffset: number;
    pageUrl: string;
    pageTitle: string;
    modelOverride?: {
      providerType: ProviderConfig['type'];
      model: string;
    };
  };
}

export interface AnalyzeChunk {
  type: typeof MESSAGE_TYPES.ANALYZE_CHUNK;
  payload: {
    requestId: string;
    chunk: string;
    done: boolean;
  };
}

export interface AnalyzeComplete {
  type: typeof MESSAGE_TYPES.ANALYZE_COMPLETE;
  payload: {
    requestId: string;
    fullText: string;
  };
}

export interface AnalyzeError {
  type: typeof MESSAGE_TYPES.ANALYZE_ERROR;
  payload: {
    requestId: string;
    error: string;
    retryable: boolean;
  };
}

export interface ValidateProviderRequest {
  type: typeof MESSAGE_TYPES.VALIDATE_PROVIDER;
}

export interface ValidateProviderResult {
  type: typeof MESSAGE_TYPES.VALIDATE_RESULT;
  payload: {
    valid: boolean;
    error?: string;
    providerName: string;
  };
}

export interface GetConfigRequest {
  type: typeof MESSAGE_TYPES.GET_CONFIG;
}

export interface ConfigResult {
  type: typeof MESSAGE_TYPES.CONFIG_RESULT;
  payload: ExtensionConfig;
}

export interface FetchModelsRequest {
  type: typeof MESSAGE_TYPES.FETCH_MODELS;
  payload?: {
    token?: string;
  };
}

export interface FetchModelsResult {
  type: typeof MESSAGE_TYPES.FETCH_MODELS_RESULT;
  payload: {
    models: Array<{
      id: string;
      name: string;
      publisher: string;
      summary?: string;
      tags?: string[];
      maxInputTokens?: number;
      maxOutputTokens?: number;
    }>;
    error?: string;
  };
}

export interface ExtensionConfig {
  provider: ProviderConfig;
  analysis: AnalysisConfig;
  appearance: AppearanceConfig;
}

export interface ProviderConfig {
  type: 'github-models' | 'openai-compatible' | 'anthropic';
  githubModels?: {
    token: string;
    model: string;
  };
  openaiCompatible?: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  anthropic?: {
    apiKey: string;
    model: string;
  };
}

export interface AnalysisConfig {
  explanationLanguage: 'english' | 'japanese';
  detailLevel: 'brief' | 'full';
}

export interface AppearanceConfig {
  theme: 'auto' | 'light' | 'dark';
  panelPosition: 'right' | 'bottom';
}

export type MessageToBackground =
  | AnalyzeRequest
  | ValidateProviderRequest
  | GetConfigRequest
  | FetchModelsRequest;

export type MessageFromBackground =
  | AnalyzeChunk
  | AnalyzeComplete
  | AnalyzeError
  | ValidateProviderResult
  | ConfigResult
  | FetchModelsResult;
