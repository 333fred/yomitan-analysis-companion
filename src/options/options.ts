import { getConfig, setConfig } from '../shared/storage';
import { FALLBACK_GITHUB_MODELS } from '../shared/config';
import { ANTHROPIC_MODELS } from '../providers/anthropic';
import type {
  ExtensionConfig,
  ProviderConfig,
  AnalysisConfig,
  AppearanceConfig,
} from '../shared/messages';

// ── DOM references ──────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

// Provider credential fields
const githubToken = $<HTMLInputElement>('github-token');
const anthropicKey = $<HTMLInputElement>('anthropic-key');
const openaiUrl = $<HTMLInputElement>('openai-url');
const openaiKey = $<HTMLInputElement>('openai-key');

// Provider detail sections (for auto-open on load)
const githubDetails = $<HTMLDetailsElement>('github-models-details');
const anthropicDetails = $<HTMLDetailsElement>('anthropic-details');
const openaiDetails = $<HTMLDetailsElement>('openai-details');

// Unified model selector
const unifiedModel = $<HTMLSelectElement>('unified-model');
const refreshModelsBtn = $<HTMLButtonElement>('refresh-models-btn');

// Analysis
const explanationLanguage = $<HTMLSelectElement>('explanation-language');
const detailLevel = $<HTMLSelectElement>('detail-level');
const theme = $<HTMLSelectElement>('theme');
const panelPosition = $<HTMLSelectElement>('panel-position');

// Actions
const validateBtn = $<HTMLButtonElement>('validate-btn');
const validateStatus = $<HTMLSpanElement>('validate-status');
const saveBtn = $<HTMLButtonElement>('save-btn');
const saveStatus = $<HTMLSpanElement>('save-status');

// ── Types ───────────────────────────────────────────────────────────

/** Encoded model value: "providerType::modelId" */
const MODEL_SEP = '::';
type ModelEntry = {
  provider: ProviderConfig['type'];
  id: string;
  name: string;
  summary?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  tags?: string[];
};

function encodeModelValue(
  provider: ProviderConfig['type'],
  modelId: string,
): string {
  return `${provider}${MODEL_SEP}${modelId}`;
}

function decodeModelValue(
  value: string,
): { provider: ProviderConfig['type']; model: string } | null {
  const idx = value.indexOf(MODEL_SEP);
  if (idx < 0) return null;
  return {
    provider: value.slice(0, idx) as ProviderConfig['type'],
    model: value.slice(idx + MODEL_SEP.length),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function showStatus(
  el: HTMLSpanElement,
  text: string,
  kind: 'success' | 'error' | 'info',
  autoHideMs = 4000,
): void {
  el.textContent = text;
  el.className = `status-message ${kind}`;
  el.hidden = false;

  if (autoHideMs > 0) {
    setTimeout(() => {
      el.hidden = true;
    }, autoHideMs);
  }
}

// ── Unified model dropdown ──────────────────────────────────────────

/** Metadata lookup for the currently displayed models. */
let modelMetadata = new Map<string, ModelEntry>();
/** Keep the last custom-endpoint model even when another provider is active. */
let savedOpenAIModel = '';

function formatModelLabel(model: { name: string; publisher?: string }): string {
  return model.publisher ? `${model.name} (${model.publisher})` : model.name;
}

async function fetchProviderModels(
  payload: {
    providerType: 'github-models' | 'openai-compatible';
    token?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  },
  fallback: ModelEntry[] = [],
): Promise<ModelEntry[]> {
  try {
    const result = await new Promise<{
      models: Array<{
        id: string;
        name: string;
        publisher?: string;
        summary?: string;
        tags?: string[];
        maxInputTokens?: number;
        maxOutputTokens?: number;
      }>;
      error?: string;
    }>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_MODELS', payload },
        (response) => {
          if (chrome.runtime.lastError)
            reject(new Error(chrome.runtime.lastError.message));
          else resolve(response);
        },
      );
    });

    const models = result.models.map((m) => ({
      provider: payload.providerType,
      id: m.id,
      name: m.name,
      summary: m.summary,
      maxInputTokens: m.maxInputTokens,
      maxOutputTokens: m.maxOutputTokens,
      tags: m.tags,
      ...(m.publisher ? { publisher: m.publisher } : {}),
    }));

    return models.length > 0 ? models : fallback;
  } catch {
    return fallback;
  }
}

async function fetchGithubModels(): Promise<ModelEntry[]> {
  const token = githubToken.value.trim();
  if (!token) return [];

  const fallback = [...FALLBACK_GITHUB_MODELS].map((m) => ({
    provider: 'github-models' as const,
    id: m.id,
    name: m.name,
    publisher: m.publisher,
  }));

  return fetchProviderModels(
    { providerType: 'github-models', token },
    fallback,
  );
}

function getAnthropicModels(): ModelEntry[] {
  if (!anthropicKey.value.trim()) return [];
  return ANTHROPIC_MODELS.map((m) => ({
    provider: 'anthropic' as const,
    id: m.id,
    name: m.name,
    summary: m.summary,
    maxInputTokens: m.maxInputTokens,
    maxOutputTokens: m.maxOutputTokens,
  }));
}

async function getCustomModels(): Promise<ModelEntry[]> {
  const url = openaiUrl.value.trim();
  if (!url) return [];

  const fallback = savedOpenAIModel
    ? [
        {
          provider: 'openai-compatible' as const,
          id: savedOpenAIModel,
          name: savedOpenAIModel,
        },
      ]
    : [];

  return fetchProviderModels(
    {
      providerType: 'openai-compatible',
      baseUrl: url,
      apiKey: openaiKey.value.trim(),
      model: savedOpenAIModel,
    },
    fallback,
  );
}

async function rebuildModelDropdown(preserveSelection?: string): Promise<void> {
  const previous = preserveSelection ?? unifiedModel.value;

  unifiedModel.disabled = true;
  refreshModelsBtn.disabled = true;
  unifiedModel.innerHTML = '<option value="">Loading models…</option>';

  // Fetch all provider models in parallel
  const [githubModels, anthropicModels, customModels] = await Promise.all([
    githubToken.value.trim() ? fetchGithubModels() : Promise.resolve([]),
    Promise.resolve(getAnthropicModels()),
    getCustomModels(),
  ]);

  unifiedModel.innerHTML = '';

  const groups: Array<{ label: string; models: ModelEntry[] }> = [];
  if (githubModels.length > 0)
    groups.push({ label: 'GitHub Models', models: githubModels });
  if (anthropicModels.length > 0)
    groups.push({ label: 'Anthropic (Claude)', models: anthropicModels });
  if (customModels.length > 0)
    groups.push({ label: 'Custom Endpoint', models: customModels });

  if (groups.length === 0) {
    modelMetadata.clear();
    unifiedModel.innerHTML =
      '<option value="">Configure a provider above…</option>';
    unifiedModel.disabled = false;
    refreshModelsBtn.disabled = false;
    updateModelInfo();
    return;
  }

  // Build metadata map and dropdown
  modelMetadata = new Map();
  for (const group of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const m of group.models) {
      const val = encodeModelValue(m.provider, m.id);
      modelMetadata.set(val, m);
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = formatModelLabel(m);
      optgroup.appendChild(opt);
    }
    unifiedModel.appendChild(optgroup);
  }

  // Restore previous selection if it still exists
  if (previous) {
    const exists = Array.from(unifiedModel.options).some(
      (o) => o.value === previous,
    );
    if (exists) unifiedModel.value = previous;
  }

  unifiedModel.disabled = false;
  refreshModelsBtn.disabled = false;
  updateModelInfo();
}

/** Format a token count as a readable string (e.g., 1048576 → "1M"). */
function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

/** Update the model-info panel below the dropdown with the selected model's details. */
function updateModelInfo(): void {
  const infoEl = document.getElementById('model-info');
  if (!infoEl) return;

  const entry = modelMetadata.get(unifiedModel.value);
  if (!entry || (!entry.summary && !entry.maxInputTokens)) {
    infoEl.hidden = true;
    return;
  }

  const parts: string[] = [];
  if (entry.summary) {
    parts.push(
      `<span class="model-info-summary">${escapeHtml(entry.summary)}</span>`,
    );
  }

  const stats: string[] = [];
  if (entry.maxInputTokens)
    stats.push(`Context: ${formatTokens(entry.maxInputTokens)}`);
  if (entry.maxOutputTokens)
    stats.push(`Max output: ${formatTokens(entry.maxOutputTokens)}`);
  if (entry.tags && entry.tags.length > 0) {
    stats.push(
      entry.tags
        .map((t) => `<span class="model-tag">${escapeHtml(t)}</span>`)
        .join(' '),
    );
  }
  if (stats.length > 0) {
    parts.push(`<span class="model-info-stats">${stats.join(' · ')}</span>`);
  }

  infoEl.innerHTML = parts.join('');
  infoEl.hidden = false;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Populate form from stored config ────────────────────────────────

async function loadSettings(): Promise<void> {
  const config = await getConfig();

  // Credentials
  githubToken.value = config.provider.githubModels?.token ?? '';
  anthropicKey.value = config.provider.anthropic?.apiKey ?? '';
  openaiUrl.value = config.provider.openaiCompatible?.baseUrl ?? '';
  openaiKey.value = config.provider.openaiCompatible?.apiKey ?? '';
  savedOpenAIModel = config.provider.openaiCompatible?.model ?? '';

  // Open details sections that have credentials
  if (githubToken.value) githubDetails.open = true;
  if (anthropicKey.value) anthropicDetails.open = true;
  if (openaiUrl.value) openaiDetails.open = true;

  // Determine the currently-selected model value
  const activeType = config.provider.type;
  let activeModel = '';
  if (activeType === 'github-models') {
    activeModel = config.provider.githubModels?.model ?? 'openai/gpt-4.1';
  } else if (activeType === 'anthropic') {
    activeModel = config.provider.anthropic?.model ?? 'claude-sonnet-4-6';
  } else if (activeType === 'openai-compatible') {
    activeModel = config.provider.openaiCompatible?.model ?? '';
  }
  const selectedValue = encodeModelValue(activeType, activeModel);

  await rebuildModelDropdown(selectedValue);

  // Analysis
  explanationLanguage.value = config.analysis.explanationLanguage;
  detailLevel.value = config.analysis.detailLevel;

  // Appearance
  theme.value = config.appearance.theme;
  if (panelPosition) panelPosition.value = config.appearance.panelPosition;
}

// ── Gather form values into a config object ─────────────────────────

function gatherConfig(): ExtensionConfig {
  const decoded = decodeModelValue(unifiedModel.value);
  const providerType: ProviderConfig['type'] =
    decoded?.provider ?? 'github-models';
  const modelId = decoded?.model ?? '';

  const provider: ProviderConfig = {
    type: providerType,
    githubModels: {
      token: githubToken.value.trim(),
      model: providerType === 'github-models' ? modelId : '',
    },
    openaiCompatible: {
      baseUrl: openaiUrl.value.trim(),
      apiKey: openaiKey.value.trim(),
      model: providerType === 'openai-compatible' ? modelId : savedOpenAIModel,
    },
    anthropic: {
      apiKey: anthropicKey.value.trim(),
      model: providerType === 'anthropic' ? modelId : '',
    },
  };

  const analysis: AnalysisConfig = {
    explanationLanguage:
      explanationLanguage.value as AnalysisConfig['explanationLanguage'],
    detailLevel: detailLevel.value as AnalysisConfig['detailLevel'],
  };

  const appearance: AppearanceConfig = {
    theme: theme.value as AppearanceConfig['theme'],
    panelPosition: (panelPosition?.value ??
      'right') as AppearanceConfig['panelPosition'],
  };

  return { provider, analysis, appearance };
}

// ── Event handlers ──────────────────────────────────────────────────

// Rebuild model dropdown when credentials change (debounced)
let credentialDebounce: ReturnType<typeof setTimeout> | undefined;
function onCredentialChange(): void {
  clearTimeout(credentialDebounce);
  credentialDebounce = setTimeout(() => {
    rebuildModelDropdown();
  }, 600);
}

githubToken.addEventListener('input', onCredentialChange);
anthropicKey.addEventListener('input', onCredentialChange);
openaiUrl.addEventListener('input', onCredentialChange);
openaiKey.addEventListener('input', onCredentialChange);

refreshModelsBtn.addEventListener('click', () => {
  rebuildModelDropdown();
});

unifiedModel.addEventListener('change', () => {
  const decoded = decodeModelValue(unifiedModel.value);
  if (decoded?.provider === 'openai-compatible') {
    savedOpenAIModel = decoded.model;
  }
  updateModelInfo();
});

validateBtn.addEventListener('click', async () => {
  const config = gatherConfig();
  try {
    await setConfig(config);
  } catch {
    showStatus(validateStatus, 'Failed to save before validating.', 'error');
    return;
  }

  validateBtn.disabled = true;
  showStatus(validateStatus, 'Testing…', 'info', 0);

  try {
    const result = await new Promise<{
      valid: boolean;
      error?: string;
      providerName: string;
    }>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'VALIDATE_PROVIDER' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (result.valid) {
      showStatus(
        validateStatus,
        `✓ Connected to ${result.providerName} successfully!`,
        'success',
      );
    } else {
      showStatus(
        validateStatus,
        `✗ ${result.error ?? 'Connection failed'}`,
        'error',
        0,
      );
    }
  } catch (error) {
    showStatus(
      validateStatus,
      `✗ ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error',
      0,
    );
  } finally {
    validateBtn.disabled = false;
  }
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;

  try {
    const config = gatherConfig();
    await setConfig(config);
    showStatus(saveStatus, '✓ Settings saved', 'success');
  } catch (error) {
    showStatus(
      saveStatus,
      `✗ ${error instanceof Error ? error.message : 'Failed to save'}`,
      'error',
    );
  } finally {
    saveBtn.disabled = false;
  }
});

// ── Init ────────────────────────────────────────────────────────────

loadSettings().catch((err) => {
  console.error('[YCC Options] Failed to load settings:', err);
});
