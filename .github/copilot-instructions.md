# Yomitan Copilot Companion — Copilot Instructions

## Project Overview

This is a Chrome/Edge browser extension (Manifest V3) that serves as an AI-powered companion for the Yomitan Japanese dictionary extension. It adds grammar analysis, sentence breakdowns, and contextual explanations alongside Yomitan's word lookups. Analysis results are displayed in a docked side panel (right or bottom of the viewport).

## Architecture

### Extension Components

- **Content Script** (`src/content/`): Injected into all web pages. Detects Yomitan's popup via `elementFromPoint` probing, extracts sentence text from the DOM, and renders the companion UI (floating Explain button + docked side panel). Built as a self-contained **IIFE** (no ES module imports) because Chrome content scripts don't support ES modules.
- **Service Worker** (`src/background/`): Handles AI API calls. Receives analysis requests from content scripts, tokenizes sentences with kuromoji, streams responses back over message ports. Also handles config retrieval, model catalog fetching, and provider validation.
- **Tokenizer** (`src/tokenizer/`): Morphological analysis using `@patdx/kuromoji` (IPADic dictionary). Provides deterministic word boundaries, readings, POS tags, and base forms. Dictionary files are fetched from CDN and cached via the Cache API.
- **Options Page** (`src/options/`): Settings UI for configuring AI providers (multiple simultaneously), model selection, and preferences. Uses a unified model dropdown aggregating models from all configured providers.
- **Providers** (`src/providers/`): Adapter pattern for AI providers. Each implements the `ILLMProvider` interface. Currently: GitHub Models (OpenAI-format), Anthropic (Messages API), and generic OpenAI-compatible.
- **Shared** (`src/shared/`): Type definitions, message contracts, storage wrapper, and constants used across all components.

### Key Design Decisions

1. **Yomitan's popup uses a closed Shadow DOM + iframe** — we cannot inject into it or observe its dimensions via the container (which is always 0×0 because the iframe uses `position: fixed` inside the shadow). We detect the popup using `document.elementFromPoint` probing: per the Shadow DOM spec, `elementFromPoint` returns the shadow host for elements inside closed shadows.
2. **Our UI uses Shadow DOM** (open mode) to isolate styles from the host page.
3. **Docked side panel** — analysis results display in a resizable fixed-position panel that slides in from the right (or bottom). The panel pushes page content by adding margin to `document.documentElement`. Drag the edge to resize. A semi-transparent reopen button appears when the panel is closed. The panel includes the original sentence (with word highlighted) at the top, streaming AI content in the middle, and a model switcher footer at the bottom.
4. **Pre-capture pattern** — sentence text is extracted eagerly when Yomitan's popup appears (before the user clicks our button). Clicking the Explain button or moving the mouse to it dismisses Yomitan and deselects text, so live extraction is used as primary with pre-captured data as fallback. Pre-captured data is also updated on `selectionchange` events.
5. **Streaming over ports**: Content script opens a `chrome.runtime.connect()` port for analysis requests. The background streams chunks back over this port.
6. **API calls happen in the service worker**, not the content script, to avoid CORS issues.
7. **No UI framework** in the content script — vanilla TypeScript DOM manipulation to keep the injected bundle small (~30KB).
8. **Two-pass Vite build**: The content script is built separately as IIFE (self-contained, no imports); background + options are built as ES modules with shared chunks.
9. **Multi-provider model selection**: Users configure credentials for multiple providers simultaneously. A single unified model dropdown aggregates models from all providers, grouped by provider. The selected model determines which provider is used. The model can also be switched from the sidebar panel footer, which immediately re-runs the analysis.
10. **Morphological pre-analysis**: Before sending to the AI, sentences are tokenized with kuromoji (IPADic dictionary) to provide deterministic word boundaries, readings, POS tags, and base forms. This data is injected into the prompt as authoritative, so the AI focuses on meaning and grammar explanation rather than guessing morphology.

### Data Flow

```
Page → Content Script (elementFromPoint probing detects Yomitan popup)
     → Pre-capture: Sentence Extractor reads text from page DOM eagerly
     → User clicks Explain button
     → Port message to Service Worker with {word, sentence, modelOverride?}
     → Service Worker tokenizes sentence with kuromoji (IPADic)
     → Builds prompt with pre-analyzed morphological data
     → Provider streams AI response (SSE for OpenAI/GitHub, Anthropic events for Claude)
     → Chunks streamed back over port
     → Section Renderer progressively builds HTML in docked side panel
```

### Popup Detection (elementFromPoint probing)

The `YomitanObserver` class uses a polling approach (every 200ms when a container is tracked):
- Tracks mouse position via `mousemove` listener
- Probes 16 points in a fan around the mouse cursor
- If any probe returns the Yomitan container, walks outward in 20px steps to find popup bounds (two-pass probing at midpoints for stability)
- Fast path: if popup is already visible and mouse hasn't moved >20px since last probe, just verify the center point. Re-probes when mouse moves significantly to detect popup repositioning.
- Hide timer only cancelled after popup size check passes (prevents stale container hits from keeping button visible)
- 500ms grace period before declaring popup hidden
- `isYomitanContainer` heuristic: checks `el.style.getPropertyValue('all') === 'initial'` && `el.style.getPropertyPriority('all') === 'important'`

### Button Positioning

The Explain button uses `window.getSelection().getRangeAt(0).getBoundingClientRect()` to get the exact bounding rect of Yomitan's text selection, then positions directly above it. The text top is latched on the initial `shown` event and updated on `selectionchange` events, preventing the button from chasing the cursor while still tracking when the user hovers a different word. Fallback cascade: above text → below popup → left → right.

## Build System

- **Vite 8** with custom plugins (not @crxjs/vite-plugin — it's broken on Vite 8/Rolldown)
- Two-pass build in `vite.config.ts`:
  1. Main build: background worker + options page as ES modules (can share chunks)
  2. Plugin `build-content-script-iife`: secondary Vite build for content script as IIFE
- Plugin `chrome-extension-assets`: copies manifest.json (with .ts→.js paths) and icons
- TypeScript 6.x: uses relative imports (no baseUrl/paths aliases)

## Coding Standards

### TypeScript

- Strict mode enabled. Do not use `any` unless absolutely necessary (and document why).
- Use `interface` for object shapes, `type` for unions/intersections.
- Export types from the file that defines them; import from there.
- Prefer `const` assertions and `as const` for literal types.

### Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- CSS classes: `ycc-` prefix (Yomitan Copilot Companion)
- DOM IDs: `ycc-` prefix

### Extension-Specific

- All content script DOM elements must be created inside our Shadow DOM host (`PanelHost`).
- Never use `document.getElementById` or `document.querySelector` for our own elements — always scope to our shadow root.
- Store secrets (API keys) in `chrome.storage.sync` only — never in localStorage, sessionStorage, or cookies.
- Handle service worker lifecycle: it can unload at any time. Don't store state in module-level variables in the service worker; read from storage when needed.
- `pointer-events: none` on the PanelHost container so it doesn't block page clicks. Button and panel must explicitly set `pointer-events: auto`.

### Error Handling

- AI provider errors should always be caught and displayed to the user in the companion panel (not thrown silently).
- Network errors should indicate whether retry is possible.
- Content script errors should never break the host page — wrap top-level entry points in try/catch.
- SSE stream errors: check for error objects embedded in stream body, finish_reason `length`/`content_filter`, and apply 60-second inactivity timeout.

### Japanese Text

- When displaying Japanese text alongside explanations, use furigana notation: `漢字(かんじ)`.
- The system prompt instructs the AI to use this notation.
- Our section renderer preserves this notation in rendering.

## File Dependencies

```
shared/config.ts              ← no deps (constants, defaults)
shared/messages.ts            ← type definitions for all messages and config
shared/storage.ts             ← imports from messages.ts, config.ts
providers/types.ts            ← ILLMProvider interface, LLMRequest, LLMResponse
providers/sse-stream.ts       ← shared SSE parser for OpenAI-format streams
providers/github-models.ts    ← imports from types.ts, sse-stream.ts (+ catalog fetch)
providers/openai-compatible.ts ← imports from types.ts, sse-stream.ts
providers/anthropic.ts        ← imports from types.ts (own SSE parser for Anthropic format)
providers/provider-factory.ts ← imports from all providers, storage.ts, messages.ts
tokenizer/kuromoji-tokenizer.ts ← @patdx/kuromoji (IPADic), POS mapping, Cache API
prompts/grammar-analysis.ts   ← system prompts (full + brief), accepts pre-analyzed token data
background/service-worker.ts  ← imports from providers, prompts, tokenizer, shared
content/yomitan-observer.ts   ← elementFromPoint probing, popup detection
content/sentence-extractor.ts ← text extraction from DOM
content/messaging.ts          ← port-based streaming to service worker, fetchModels
content/ui/panel-host.ts      ← Shadow DOM host, button + panel management
content/ui/companion-panel.ts ← resizable docked side panel, sentence display, model switcher
content/ui/analyze-button.ts  ← floating button positioned via selection rect
content/ui/section-renderer.ts ← markdown → structured HTML sections
content/ui/styles.ts          ← all CSS for content script UI
content/index.ts              ← orchestration (imports all content modules)
options/options.ts            ← imports from shared, providers/anthropic.ts (model list)
```

## Testing Notes

- The extension must be loaded unpacked in Chrome/Edge (`dist/` directory) to test.
- To test content script changes: rebuild (`npx vite build`), reload the extension in `chrome://extensions`, then refresh the target page.
- To test service worker changes: rebuild and reload extension (auto-reloads).
- Test with pages containing Japanese text (e.g., Wikipedia JP, NHK News).
- Test Connection button in settings validates the currently-selected model's provider.

## Provider API Reference

### GitHub Models

- Endpoint: `https://models.github.ai/inference/chat/completions`
- Catalog: `https://models.github.ai/catalog/models` (returns summary, tags, limits)
- Auth: `Authorization: Bearer <github_pat>` (PAT needs `models:read` scope)
- Format: OpenAI-compatible chat completions
- Streaming: SSE via `stream: true`
- Uses `max_completion_tokens` (not `max_tokens` — newer models reject the old name)
- Temperature: only sent when explicitly set (some models only accept default)
- Models filtered: min 4K input tokens, min 2K output tokens, no "nano" tier

### Anthropic (Claude)

- Endpoint: `https://api.anthropic.com/v1/messages`
- Auth: `x-api-key` header + `anthropic-version: 2023-06-01`
- Requires `anthropic-dangerous-direct-browser-access: true` header for browser contexts
- System message is a top-level `system` field (not in the messages array)
- Uses `max_tokens` (Anthropic's own field name)
- Streaming: SSE with typed events (`content_block_delta` for text, `message_delta` for stop_reason)
- Static model list: Opus 4.6, Sonnet 4.6/4.5, Haiku 4.5

### OpenAI-Compatible

- Any endpoint following `/chat/completions` format
- Streaming: SSE with `data: {...}` lines, terminated by `data: [DONE]`
- Uses `max_completion_tokens` for compatibility with newer models

## Documentation Maintenance

When making changes to the codebase, always check whether documentation needs updating:

### Files to review after changes

- **`README.md`** — Update if changes affect: features, usage instructions, setup steps, project structure, data flow, or the "How It Works" description. Keep screenshots current.
- **`.github/copilot-instructions.md`** (this file) — Update if changes affect: architecture, component responsibilities, design decisions, data flow, file dependencies, popup detection/positioning behavior, build system, coding standards, or provider API details.
- **`PRIVACY.md`** — Update if changes affect: what data is collected/sent, which external services are contacted, what permissions are used, or how credentials are stored.

### What to update

- **Architecture sections**: When adding/removing components, modules, or changing how they interact.
- **Data flow**: When the request/response pipeline changes (e.g., adding a processing step like tokenization).
- **File dependencies**: When adding new files or changing import relationships.
- **Design decisions**: When adding significant new patterns or changing existing ones.
- **Project structure tree**: When adding/renaming/removing source directories or files.
- **Provider API reference**: When changing how providers are called or adding new providers.
