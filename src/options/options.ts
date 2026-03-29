import { getConfig, setConfig } from '../shared/storage';
import type {
  ExtensionConfig,
  ProviderConfig,
  AnalysisConfig,
  AppearanceConfig,
} from '../shared/messages';

// ── DOM references ──────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const providerRadios = document.querySelectorAll<HTMLInputElement>(
  'input[name="provider"]',
);
const githubSettings = $<HTMLDivElement>('github-models-settings');
const openaiSettings = $<HTMLDivElement>('openai-settings');

const githubToken = $<HTMLInputElement>('github-token');
const githubModel = $<HTMLSelectElement>('github-model');

const openaiUrl = $<HTMLInputElement>('openai-url');
const openaiKey = $<HTMLInputElement>('openai-key');
const openaiModel = $<HTMLInputElement>('openai-model');

const explanationLanguage = $<HTMLSelectElement>('explanation-language');
const detailLevel = $<HTMLSelectElement>('detail-level');
const theme = $<HTMLSelectElement>('theme');

const validateBtn = $<HTMLButtonElement>('validate-btn');
const validateStatus = $<HTMLSpanElement>('validate-status');

const saveBtn = $<HTMLButtonElement>('save-btn');
const saveStatus = $<HTMLSpanElement>('save-status');

// ── Helpers ─────────────────────────────────────────────────────────

function getSelectedProvider(): ProviderConfig['type'] {
  for (const radio of providerRadios) {
    if (radio.checked) return radio.value as ProviderConfig['type'];
  }
  return 'github-models';
}

function showProviderPanel(type: ProviderConfig['type']): void {
  githubSettings.hidden = type !== 'github-models';
  openaiSettings.hidden = type !== 'openai-compatible';
}

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

// ── Populate form from stored config ────────────────────────────────

async function loadSettings(): Promise<void> {
  const config = await getConfig();

  // Provider type
  for (const radio of providerRadios) {
    radio.checked = radio.value === config.provider.type;
  }
  showProviderPanel(config.provider.type);

  // GitHub Models
  githubToken.value = config.provider.githubModels?.token ?? '';
  githubModel.value = config.provider.githubModels?.model ?? 'openai/gpt-4.1';

  // OpenAI-compatible
  openaiUrl.value = config.provider.openaiCompatible?.baseUrl ?? '';
  openaiKey.value = config.provider.openaiCompatible?.apiKey ?? '';
  openaiModel.value = config.provider.openaiCompatible?.model ?? '';

  // Analysis
  explanationLanguage.value = config.analysis.explanationLanguage;
  detailLevel.value = config.analysis.detailLevel;

  // Appearance
  theme.value = config.appearance.theme;
}

// ── Gather form values into a config object ─────────────────────────

function gatherConfig(): ExtensionConfig {
  const providerType = getSelectedProvider();

  const provider: ProviderConfig = {
    type: providerType,
    githubModels: {
      token: githubToken.value.trim(),
      model: githubModel.value,
    },
    openaiCompatible: {
      baseUrl: openaiUrl.value.trim(),
      apiKey: openaiKey.value.trim(),
      model: openaiModel.value.trim(),
    },
  };

  const analysis: AnalysisConfig = {
    explanationLanguage: explanationLanguage.value as AnalysisConfig['explanationLanguage'],
    detailLevel: detailLevel.value as AnalysisConfig['detailLevel'],
  };

  const appearance: AppearanceConfig = {
    theme: theme.value as AppearanceConfig['theme'],
  };

  return { provider, analysis, appearance };
}

// ── Event handlers ──────────────────────────────────────────────────

for (const radio of providerRadios) {
  radio.addEventListener('change', () => {
    showProviderPanel(getSelectedProvider());
  });
}

validateBtn.addEventListener('click', async () => {
  // Save current values first so the background reads the latest config
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
