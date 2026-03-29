# Yomitan Copilot Companion — Copilot Instructions

## Project Overview

This is a Chrome/Edge browser extension (Manifest V3) that serves as an AI-powered companion for the Yomitan Japanese dictionary extension. It adds grammar analysis, sentence breakdowns, and contextual explanations alongside Yomitan's word lookups.

## Architecture

### Extension Components

- **Content Script** (`src/content/`): Injected into all web pages. Detects Yomitan's popup, extracts sentence text from the DOM, and renders the companion UI panel.
- **Service Worker** (`src/background/`): Handles AI API calls. Receives analysis requests from content scripts, streams responses back over message ports.
- **Options Page** (`src/options/`): Settings UI for configuring AI provider, API keys, and preferences.
- **Providers** (`src/providers/`): Adapter pattern for AI providers (GitHub Models, OpenAI-compatible). Each adapter implements the `ILLMProvider` interface.
- **Shared** (`src/shared/`): Type definitions, message contracts, storage wrapper, and constants used across all components.

### Key Design Decisions

1. **Yomitan's popup uses a closed Shadow DOM + iframe** — we cannot inject into it. We detect the popup container via MutationObserver and position our own UI below it.
2. **Our UI also uses Shadow DOM** (open mode) to isolate styles from the host page.
3. **Streaming over ports**: Content script opens a `chrome.runtime.connect()` port for analysis requests. The background streams chunks back over this port. This avoids the single-response limitation of `chrome.runtime.sendMessage`.
4. **API calls happen in the service worker**, not the content script, to avoid CORS issues.
5. **No UI framework** in the content script — vanilla TypeScript DOM manipulation to keep the injected bundle size small (< 50KB target).

### Data Flow

```
Page → Content Script (MutationObserver detects Yomitan popup)
     → Sentence Extractor reads text from page DOM
     → Port message to Service Worker with {word, sentence}
     → Service Worker calls AI provider (streaming)
     → Chunks streamed back over port
     → Section Renderer progressively builds UI
```

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

### Error Handling

- AI provider errors should always be caught and displayed to the user in the companion panel (not thrown silently).
- Network errors should indicate whether retry is possible.
- Content script errors should never break the host page — wrap top-level entry points in try/catch.

### Japanese Text

- When displaying Japanese text alongside explanations, use furigana notation: `漢字(かんじ)`.
- The system prompt instructs the AI to use this notation.
- Our section renderer preserves this notation in rendering.

## File Dependencies

```
shared/config.ts      ← no deps (constants only)
shared/messages.ts    ← imports from config.ts
shared/storage.ts     ← imports from messages.ts, config.ts
providers/types.ts    ← no deps
providers/github-models.ts    ← imports from types.ts
providers/openai-compatible.ts ← imports from types.ts
providers/provider-factory.ts  ← imports from all providers, storage.ts, messages.ts
prompts/grammar-analysis.ts    ← imports from providers/types.ts
background/service-worker.ts   ← imports from providers, prompts, shared
content/yomitan-observer.ts    ← imports from shared/config.ts
content/sentence-extractor.ts  ← imports from shared/config.ts
content/messaging.ts           ← imports from shared/messages.ts
content/ui/*                   ← imports from shared
content/index.ts               ← imports from all content modules
options/options.ts             ← imports from shared/storage.ts, messages.ts
```

## Testing Notes

- The extension must be loaded unpacked in Chrome/Edge to test.
- To test content script changes: reload the extension in `chrome://extensions`, then refresh the target page.
- To test service worker changes: the extension auto-reloads when dev server rebuilds.
- Test with pages containing Japanese text (e.g., Wikipedia JP, NHK News).

## Provider API Reference

### GitHub Models

- Endpoint: `https://models.github.ai/inference/chat/completions`
- Auth: `Authorization: Bearer <github_pat>` (PAT needs `models:read` scope)
- Format: OpenAI-compatible chat completions
- Streaming: SSE via `stream: true`

### OpenAI-Compatible

- Any endpoint following `/chat/completions` format
- Streaming: SSE with `data: {...}` lines, terminated by `data: [DONE]`
