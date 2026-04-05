# Yomitan Copilot Companion

AI-powered grammar analysis companion for [Yomitan](https://github.com/yomidevs/yomitan). Get full sentence breakdowns, grammar explanations, and contextual understanding alongside Yomitan's dictionary lookups.

## What It Does

When you look up a Japanese word with Yomitan, this companion extension adds an **"✨ Explain"** button near the popup.

![Explain button appearing above the hovered word](screenshots/Explain%20Button.png)

Click it to get a streaming analysis in a **docked side panel**:

- **Full sentence translation** — natural English translation of the surrounding sentence
- **Focus word analysis** — detailed explanation of the specific word you looked up (dictionary form, conjugation, part of speech)
- **Grammar points** — conjugation rules, particle usage, and sentence patterns explained
- **Key takeaways** — the most important grammar concepts to remember
- **Word-by-word breakdown** — every word/morpheme with reading, meaning, and grammatical role

![Sidebar showing a full grammar analysis](screenshots/Explain%20Sidebar.png)

Responses stream in progressively — you see useful output within ~1 second. The side panel persists independently of Yomitan's popup, so you can scroll through the analysis at your own pace.

## How It Works

```
You hover over Japanese text → Yomitan shows its dictionary popup
                              → Companion adds "✨ Explain" button above it
You click Explain             → Extension extracts the surrounding sentence
                              → Service worker tokenizes with kuromoji (IPADic)
                              → Pre-analyzed morphology sent to AI provider
                              → Streams back a structured grammar analysis
                              → Renders it in a docked side panel
```

### Technical Architecture

Yomitan renders its popup inside a **closed Shadow DOM + iframe**, so we can't inject into it directly. Instead, our content script:

1. **Detects** Yomitan's popup via `document.elementFromPoint` probing — per the Shadow DOM spec, `elementFromPoint` returns the shadow host for elements inside closed shadows
2. **Pre-captures** the sentence from the page DOM while text is still accessible (before the user clicks our button, which would dismiss Yomitan)
3. **Positions** a floating Explain button above the selected text, using `window.getSelection()` bounding rect for precise positioning
4. **Streams** the AI analysis from the service worker over a message port into a docked side panel

Our UI is rendered inside a Shadow DOM to isolate styles from the host page.

## Setup

### Prerequisites

- Chrome or Edge browser
- [Yomitan extension](https://chromewebstore.google.com/detail/yomitan/likgccmbimhjbgkjambclfkhldnlhbnn) installed
- An API key for at least one supported AI provider

### Installation (Development)

```bash
git clone https://github.com/333fred/yomitan-analysis-companion.git
cd yomitan-analysis-companion
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `dist` folder from this project

### Configure AI Provider

1. Click the extension icon → **Options** (or right-click → Extension options)
2. Configure one or more providers in the collapsible sections:

![Settings page with provider configuration](screenshots/Settings%20Page.png)

#### GitHub Models (Recommended)

Uses GitHub's official AI Models API — works with GPT-4.1, GPT-5 Mini, and many more.

1. Create a [fine-grained Personal Access Token](https://github.com/settings/tokens?type=beta) with the **`models:read`** permission
2. Paste the token in the GitHub Models section
3. Models are fetched dynamically from the catalog (with descriptions and context window info)

#### Anthropic (Claude)

Direct access to Claude models via Anthropic's Messages API.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)
2. Paste the key in the Anthropic section
3. Available models: Opus 4.6, Sonnet 4.6/4.5, Haiku 4.5

#### Custom OpenAI-Compatible Endpoint

Works with any API that follows the OpenAI chat completions format:

- **OpenAI directly**: base URL `https://api.openai.com/v1`, your OpenAI API key
- **Ollama (local)**: base URL `http://localhost:11434/v1`, no API key needed
- **Any compatible provider**: LM Studio, Together AI, Groq, etc.
- Models are discovered automatically from the endpoint's `/models` API once you enter the base URL and key.

### Selecting a Model

All configured providers' models appear in a single unified dropdown, grouped by provider. The info panel below shows the model's description, context window size, and capability tags to help you choose. Select any model — the extension uses the correct provider automatically.

## Usage

1. Browse any page with Japanese text
2. Hover over a word to trigger Yomitan's popup (as usual)
3. Click the **"✨ Explain"** button that appears above the text
4. Read the streaming grammar analysis in the docked side panel
5. Switch models in the panel footer dropdown — analysis re-runs immediately
6. Drag the panel edge to resize; close with **×**, reopen with the floating **✨** button

### Settings

- **Detail level**: "Full" (5 sections) or "Brief" (3 sections — better for smaller models)
- **Panel position**: Right side or bottom of the screen
- **Theme**: Auto (matches page), light, or dark
- **Explanation language**: English or Japanese

## Project Structure

```
src/
├── background/
│   └── service-worker.ts        # AI provider orchestration, streaming
├── content/
│   ├── index.ts                 # Content script entry point & orchestration
│   ├── yomitan-observer.ts      # elementFromPoint probing for popup detection
│   ├── sentence-extractor.ts    # Hybrid sentence extraction from DOM
│   ├── messaging.ts             # Port-based messaging with background
│   └── ui/
│       ├── panel-host.ts        # Shadow DOM host, button + panel management
│       ├── analyze-button.ts    # Floating trigger button near text selection
│       ├── companion-panel.ts   # Resizable docked side panel (right or bottom)
│       ├── section-renderer.ts  # Streaming markdown → structured sections
│       └── styles.ts            # Scoped CSS (dark/light themes, panel, button)
├── tokenizer/
│   └── kuromoji-tokenizer.ts    # Morphological analysis (IPADic via @patdx/kuromoji)
├── providers/
│   ├── types.ts                 # ILLMProvider interface
│   ├── provider-factory.ts      # Creates provider from config
│   ├── sse-stream.ts            # Shared SSE parser for OpenAI-format streams
│   ├── github-models.ts         # GitHub Models API adapter (+ catalog fetch)
│   ├── anthropic.ts             # Anthropic Messages API adapter
│   └── openai-compatible.ts     # Generic OpenAI-compatible adapter
├── prompts/
│   └── grammar-analysis.ts      # System/user prompt templates (full + brief)
├── options/
│   ├── options.html             # Settings page
│   ├── options.css              # Settings styles
│   └── options.ts               # Settings logic (unified model dropdown)
├── shared/
│   ├── messages.ts              # Message type definitions, config interfaces
│   ├── storage.ts               # chrome.storage wrapper
│   └── config.ts                # Constants, defaults, fallback models
└── manifest.json                # Extension manifest (MV3)
```

## Development

```bash
npm run build    # Production build → dist/
```

After building, the `dist` folder contains the complete extension. Reload the extension in `chrome://extensions` to pick up changes.

### Regenerating Icons

The extension icons are generated from a Python script. Requires [Pillow](https://pypi.org/project/Pillow/) and a Japanese font (Yu Gothic, Meiryo, or MS Gothic — standard on Windows).

```bash
pip install Pillow
python generate-icons.py
```

This outputs `icon-16.png`, `icon-48.png`, and `icon-128.png` into `public/icons/`.

## Adding a New AI Provider

The provider system uses a simple adapter pattern:

1. Create `src/providers/your-provider.ts` implementing `ILLMProvider`
2. Add the provider type to `ProviderConfig` in `src/shared/messages.ts`
3. Register it in `src/providers/provider-factory.ts`
4. Add credential UI in `src/options/options.html` (collapsible `<details>` section)
5. Wire up the model entries in `src/options/options.ts` (add to `rebuildModelDropdown`)

See `src/providers/anthropic.ts` for a complete reference (different API format), or `src/providers/github-models.ts` for an OpenAI-compatible one.

## Firefox Support

The codebase is structured to make Firefox support straightforward:

- Browser API calls can be abstracted (`chrome.*` → `browser.*`)
- Manifest V3 differences are documented
- No Chrome-specific APIs are used without fallbacks

Firefox support is planned for a future release.

## License

MIT
