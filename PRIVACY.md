# Privacy Policy — Yomitan Copilot Companion

**Last updated:** March 30, 2026

## Overview

Yomitan Copilot Companion is a browser extension that provides AI-powered grammar analysis for Japanese text alongside the Yomitan dictionary extension. This policy explains what data the extension accesses, how it is used, and where it is sent.

## Data the Extension Accesses

### Sentence text from web pages

When you click the **Explain** button, the extension reads the Japanese sentence surrounding the word you looked up. This text is used solely to generate a grammar explanation and is never stored, logged, or retained after the analysis completes.

### API credentials

You provide API keys or tokens (e.g., a GitHub Personal Access Token or Anthropic API key) in the extension's settings page. These credentials are stored locally in your browser using `chrome.storage.sync` and are only transmitted directly to the AI provider you have configured — never to any other server.

### Extension settings

Your preferences (selected model, panel position, explanation language, detail level) are stored locally in `chrome.storage.sync`.

## Where Data Is Sent

The extension sends data to **only** the AI provider you have configured:

| Provider | Endpoint | What is sent |
|----------|----------|--------------|
| GitHub Models | `https://models.github.ai` | Sentence text, your token |
| Anthropic (Claude) | `https://api.anthropic.com` | Sentence text, your API key |
| Custom (OpenAI-compatible) | Your configured endpoint | Sentence text, your API key |

Additionally, the extension fetches Japanese language dictionary files from `https://cdn.jsdelivr.net` for morphological analysis. No user data is included in these requests.

## Data the Extension Does NOT Collect

- **No analytics or telemetry.** The extension does not track usage, page visits, or any behavioral data.
- **No data is sent to the extension developer.** There is no "phone home" or reporting mechanism of any kind.
- **No advertising.** The extension contains no ads and shares no data with advertisers.
- **No data is sold or shared with third parties.** Your data goes only to the AI provider you choose.

## Data Storage

All data is stored locally in your browser:

- **API credentials** — stored in `chrome.storage.sync` (synced across your Chrome devices if Chrome Sync is enabled). You can clear these at any time from the extension's settings page.
- **Dictionary cache** — kuromoji morphological dictionary files are cached in the browser's Cache API for performance. No personal data is included.
- **No server-side storage.** The extension has no backend server and stores nothing remotely.

## Permissions Explained

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` | Read Japanese text from the current page for analysis |
| `storage` | Save your settings and API credentials locally |
| Host permissions (AI providers) | Send analysis requests to your configured AI provider |
| Host permission (jsdelivr CDN) | Fetch Japanese morphological dictionary files |
| Optional host permissions | Required if you use a custom OpenAI-compatible endpoint |

## Your Controls

- You can **view, change, or delete** your API credentials and settings at any time from the extension's options page.
- You can **uninstall** the extension at any time, which removes all locally stored data.
- The extension only processes text when you **explicitly click** the Explain button — it never sends page content automatically.

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this file with an updated date. Significant changes will be noted in the extension's release notes.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/nicka/yomitan-copilot-companion).
