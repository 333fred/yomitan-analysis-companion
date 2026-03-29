# Yomitan Copilot Companion

AI-powered grammar analysis companion for [Yomitan](https://github.com/yomidevs/yomitan). Get full sentence breakdowns, grammar explanations, and contextual understanding alongside Yomitan's dictionary lookups.

## What It Does

When you look up a Japanese word with Yomitan, this companion extension adds an **"✨ Analyze"** button below the popup. Click it to get:

- **Full sentence translation** — natural English translation of the surrounding sentence
- **Word-by-word breakdown** — every word/morpheme with reading, meaning, and grammatical role
- **Grammar points** — conjugation rules, particle usage, and sentence patterns explained
- **Focus word analysis** — detailed explanation of the specific word you looked up
- **Key takeaways** — the most important grammar concepts to remember

Responses stream in progressively — you see useful output within ~1 second.

## How It Works

```
You hover over Japanese text → Yomitan shows its dictionary popup
                              → Companion adds "✨ Analyze" button below it
You click Analyze             → Extension extracts the surrounding sentence
                              → Sends it to your configured AI provider
                              → Streams back a structured grammar analysis
                              → Renders it in a panel below Yomitan's popup
```

### Technical Architecture

Yomitan renders its popup inside a **closed Shadow DOM + iframe**, so we can't inject into it directly. Instead, our content script:

1. **Detects** Yomitan's popup container via `MutationObserver`
2. **Positions** our UI below it using the container's bounding rect
3. **Extracts** the sentence independently from the page DOM (hybrid Selection API + cursor-based extraction)
4. **Streams** the AI analysis from the service worker over a message port

Our UI is also rendered inside a Shadow DOM to isolate our styles from the host page.

## Setup

### Prerequisites

- Chrome or Edge browser
- [Yomitan extension](https://chromewebstore.google.com/detail/yomitan/likgccmbimhjbgkjambclfkhldnlhbnn) installed
- A GitHub account (for the default GitHub Models AI provider)

### Installation (Development)

```bash
git clone https://github.com/your-username/yomitan-copilot-companion.git
cd yomitan-copilot-companion
npm install
npm run dev
```

Then load the extension:

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `dist` folder from this project

### Configure AI Provider

1. Click the extension icon → **Options** (or right-click → Extension options)
2. Choose your AI provider:

#### GitHub Models (Recommended)

Uses GitHub's official AI Models API — works with GPT-4.1, GPT-4o, and more.

1. Create a [fine-grained Personal Access Token](https://github.com/settings/tokens?type=beta) with the **`models:read`** permission
2. Paste the token in the settings page
3. Choose a model (GPT-4.1 recommended for quality)

#### Custom OpenAI-Compatible Endpoint

Works with any API that follows the OpenAI chat completions format:

- **OpenAI directly**: base URL `https://api.openai.com/v1`, your OpenAI API key
- **Ollama (local)**: base URL `http://localhost:11434/v1`, no API key needed
- **Any compatible provider**: LM Studio, Together AI, Groq, etc.

## Usage

1. Browse any page with Japanese text
2. Hover over a word to trigger Yomitan's popup (as usual)
3. Click the **"✨ Analyze"** button that appears below the popup
4. Read the streaming grammar analysis in the companion panel

The panel closes automatically when Yomitan's popup closes.

## Project Structure

```
src/
├── background/
│   └── service-worker.ts        # AI provider orchestration, streaming
├── content/
│   ├── index.ts                 # Content script entry point
│   ├── yomitan-observer.ts      # MutationObserver for Yomitan detection
│   ├── sentence-extractor.ts    # Hybrid sentence extraction from DOM
│   ├── messaging.ts             # Port-based messaging with background
│   └── ui/
│       ├── panel-host.ts        # Shadow DOM host for all UI
│       ├── analyze-button.ts    # The trigger button
│       ├── companion-panel.ts   # Main analysis panel
│       ├── section-renderer.ts  # Streaming markdown → structured sections
│       └── styles.ts            # Scoped CSS (dark/light themes)
├── providers/
│   ├── types.ts                 # ILLMProvider interface
│   ├── provider-factory.ts      # Creates provider from config
│   ├── github-models.ts         # GitHub Models API adapter
│   └── openai-compatible.ts     # Generic OpenAI-compatible adapter
├── prompts/
│   └── grammar-analysis.ts      # System/user prompt templates
├── options/
│   ├── options.html             # Settings page
│   ├── options.css              # Settings styles
│   └── options.ts               # Settings logic
├── shared/
│   ├── messages.ts              # Message type definitions
│   ├── storage.ts               # chrome.storage wrapper
│   └── config.ts                # Constants, defaults
└── manifest.json                # Extension manifest (MV3)
```

## Development

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build → dist/
npm run lint     # Run ESLint
npm run format   # Run Prettier
```

After running `npm run dev`, the `dist` folder updates automatically. Chrome will reload the extension on most changes (content script changes may require a manual reload).

## Adding a New AI Provider

The provider system uses a simple adapter pattern:

1. Create `src/providers/your-provider.ts` implementing `ILLMProvider`
2. Add the provider type to `ProviderConfig` in `src/shared/messages.ts`
3. Register it in `src/providers/provider-factory.ts`
4. Add UI for configuration in `src/options/`

See `src/providers/github-models.ts` for a reference implementation.

## Firefox Support

The codebase is structured to make Firefox support straightforward:

- Browser API calls can be abstracted (`chrome.*` → `browser.*`)
- Manifest V3 differences are documented
- No Chrome-specific APIs are used without fallbacks

Firefox support is planned for a future release.

## License

MIT
