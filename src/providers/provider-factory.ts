import type { ProviderConfig } from '../shared/messages';
import type { ILLMProvider } from './types';
import { getConfig } from '../shared/storage';
import { GitHubModelsProvider } from './github-models';
import { OpenAICompatibleProvider } from './openai-compatible';
import { AnthropicProvider } from './anthropic';

export function createProvider(config: ProviderConfig): ILLMProvider {
  switch (config.type) {
    case 'github-models': {
      const gh = config.githubModels;
      if (!gh?.token) {
        throw new Error(
          'GitHub Models provider requires a token. Set it in the extension options.',
        );
      }
      return new GitHubModelsProvider(gh.token, gh.model ?? 'openai/gpt-4.1');
    }

    case 'openai-compatible': {
      const oa = config.openaiCompatible;
      if (!oa?.baseUrl) {
        throw new Error(
          'OpenAI-compatible provider requires a base URL. Set it in the extension options.',
        );
      }
      return new OpenAICompatibleProvider(
        oa.baseUrl,
        oa.apiKey ?? '',
        oa.model ?? 'gpt-4',
      );
    }

    case 'anthropic': {
      const ac = config.anthropic;
      if (!ac?.apiKey) {
        throw new Error(
          'Anthropic provider requires an API key. Set it in the extension options.',
        );
      }
      return new AnthropicProvider(ac.apiKey, ac.model ?? 'claude-sonnet-4-6');
    }

    default:
      throw new Error(
        `Unknown provider type: ${(config as ProviderConfig).type}`,
      );
  }
}

export async function createProviderFromStorage(): Promise<ILLMProvider> {
  const extensionConfig = await getConfig();
  return createProvider(extensionConfig.provider);
}
