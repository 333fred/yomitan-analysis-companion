import type {
  ExtensionConfig,
  ProviderConfig,
} from './messages';
import { DEFAULT_CONFIG } from './config';

const STORAGE_KEY = 'ycc-config';

function deepMerge<T extends object>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== undefined &&
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }

  return result;
}

export async function getConfig(): Promise<ExtensionConfig> {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  const stored = data[STORAGE_KEY] as Partial<ExtensionConfig> | undefined;

  if (!stored) {
    return structuredClone(DEFAULT_CONFIG);
  }

  return deepMerge(
    structuredClone(DEFAULT_CONFIG),
    stored,
  );
}

export async function setConfig(
  config: Partial<ExtensionConfig>,
): Promise<void> {
  const current = await getConfig();
  const merged = deepMerge(current, config);
  await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
}

export async function getProviderConfig(): Promise<ProviderConfig> {
  const config = await getConfig();
  return config.provider;
}

export async function clearAll(): Promise<void> {
  await chrome.storage.sync.remove(STORAGE_KEY);
}
