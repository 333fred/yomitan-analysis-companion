const LIGHT_VARS = `
  --ycc-bg: #ffffff;
  --ycc-bg-secondary: #f7f7f8;
  --ycc-bg-hover: #eeeef0;
  --ycc-text: #1a1a1a;
  --ycc-text-secondary: #5c5c6b;
  --ycc-border: #e0e0e4;
  --ycc-accent: #4a6cf7;
  --ycc-accent-hover: #3b5de7;
  --ycc-accent-text: #ffffff;
  --ycc-shadow: rgba(0, 0, 0, 0.08);
  --ycc-shadow-strong: rgba(0, 0, 0, 0.15);
  --ycc-error-bg: #fef2f2;
  --ycc-error-text: #b91c1c;
  --ycc-error-border: #fecaca;
  --ycc-code-bg: #f0f0f3;
  --ycc-table-stripe: #f9f9fb;
  --ycc-shimmer-from: #f0f0f3;
  --ycc-shimmer-to: #e4e4e8;
  --ycc-summary-hover: #f0f0f3;
`;

const DARK_VARS = `
  --ycc-bg: #1a1a2e;
  --ycc-bg-secondary: #22223a;
  --ycc-bg-hover: #2a2a44;
  --ycc-text: #e2e2e8;
  --ycc-text-secondary: #9e9eb0;
  --ycc-border: #33334a;
  --ycc-accent: #6b8aff;
  --ycc-accent-hover: #8da4ff;
  --ycc-accent-text: #ffffff;
  --ycc-shadow: rgba(0, 0, 0, 0.3);
  --ycc-shadow-strong: rgba(0, 0, 0, 0.5);
  --ycc-error-bg: #2d1b1b;
  --ycc-error-text: #f87171;
  --ycc-error-border: #7f1d1d;
  --ycc-code-bg: #2a2a44;
  --ycc-table-stripe: #22223a;
  --ycc-shimmer-from: #22223a;
  --ycc-shimmer-to: #2e2e4a;
  --ycc-summary-hover: #2a2a44;
`;

export function getStyles(theme: 'light' | 'dark'): string {
  const vars = theme === 'light' ? LIGHT_VARS : DARK_VARS;

  return `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ycc-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  ${vars}
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ── Analyze Button (floats near Yomitan popup) ── */
.ycc-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid var(--ycc-border);
  border-radius: 8px;
  background: var(--ycc-bg);
  color: var(--ycc-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 3px var(--ycc-shadow);
  transition: background 0.15s, box-shadow 0.15s, border-color 0.15s;
  user-select: none;
  position: fixed;
  z-index: 2147483646;
  pointer-events: auto;
}

.ycc-button:hover:not(:disabled) {
  background: var(--ycc-bg-hover);
  box-shadow: 0 2px 6px var(--ycc-shadow-strong);
  border-color: var(--ycc-accent);
}

.ycc-button:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: 0 1px 2px var(--ycc-shadow);
}

.ycc-button:disabled {
  opacity: 0.7;
  cursor: default;
}

.ycc-button-icon {
  font-size: 14px;
  line-height: 1;
}

@keyframes ycc-spin {
  to { transform: rotate(360deg); }
}

.ycc-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--ycc-border);
  border-top-color: var(--ycc-accent);
  border-radius: 50%;
  animation: ycc-spin 0.6s linear infinite;
}

/* ── Docked Side Panel ── */
.ycc-side-panel {
  position: fixed;
  background: var(--ycc-bg);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  transition: transform 0.25s ease;
  z-index: 2147483646;
}

.ycc-side-panel--right {
  top: 0;
  right: 0;
  width: 380px;
  height: 100vh;
  height: 100dvh;
  transform: translateX(100%);
  border-left: 1px solid var(--ycc-border);
  box-shadow: -2px 0 12px var(--ycc-shadow-strong);
}

.ycc-side-panel--bottom {
  bottom: 0;
  left: 0;
  width: 100vw;
  height: 300px;
  transform: translateY(100%);
  border-top: 1px solid var(--ycc-border);
  box-shadow: 0 -2px 12px var(--ycc-shadow-strong);
}

.ycc-side-panel.ycc-open {
  transform: translate(0, 0);
}

/* ── Resize Handle ── */
.ycc-resize-handle {
  position: absolute;
  z-index: 1;
  flex-shrink: 0;
}

.ycc-resize-handle--right {
  top: 0;
  left: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
}

.ycc-resize-handle--bottom {
  top: -3px;
  left: 0;
  width: 100%;
  height: 6px;
  cursor: row-resize;
}

.ycc-resize-handle:hover,
.ycc-resize-handle:active {
  background: var(--ycc-accent);
  opacity: 0.3;
}

.ycc-side-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ycc-border);
  background: var(--ycc-bg-secondary);
  flex-shrink: 0;
}

.ycc-side-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ycc-text);
}

.ycc-side-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ycc-text-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.ycc-side-panel-close:hover {
  background: var(--ycc-bg-hover);
  color: var(--ycc-text);
}

.ycc-side-panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 16px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ycc-text);
  scrollbar-width: thin;
  scrollbar-color: var(--ycc-border) transparent;
}

.ycc-side-panel-content::-webkit-scrollbar { width: 6px; }
.ycc-side-panel-content::-webkit-scrollbar-track { background: transparent; }
.ycc-side-panel-content::-webkit-scrollbar-thumb { background: var(--ycc-border); border-radius: 3px; }

/* ── Reopen Button (visible when panel is closed) ── */
.ycc-reopen-button {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: 1px solid var(--ycc-border);
  border-radius: 50%;
  background: var(--ycc-bg);
  color: var(--ycc-text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.35;
  transition: opacity 0.2s, box-shadow 0.2s, transform 0.2s;
  pointer-events: auto;
  z-index: 2147483646;
  box-shadow: 0 1px 6px var(--ycc-shadow);
}

.ycc-reopen-button:hover {
  opacity: 1;
  box-shadow: 0 2px 10px var(--ycc-shadow-strong);
  transform: scale(1.1);
}

/* ── Loading shimmer ── */
@keyframes ycc-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.ycc-panel-loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.ycc-shimmer-line {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--ycc-shimmer-from) 25%, var(--ycc-shimmer-to) 50%, var(--ycc-shimmer-from) 75%);
  background-size: 200% 100%;
  animation: ycc-shimmer 1.5s ease-in-out infinite;
}

.ycc-shimmer-line:nth-child(1) { width: 85%; }
.ycc-shimmer-line:nth-child(2) { width: 70%; }
.ycc-shimmer-line:nth-child(3) { width: 90%; }
.ycc-shimmer-line:nth-child(4) { width: 60%; }
.ycc-shimmer-line:nth-child(5) { width: 78%; }

/* ── Sections ── */
.ycc-section { border-bottom: 1px solid var(--ycc-border); padding-bottom: 6px; margin-bottom: 8px; }
.ycc-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

.ycc-section summary {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 4px; font-size: 14px; font-weight: 600;
  color: var(--ycc-text); cursor: pointer; border-radius: 6px;
  list-style: none; transition: background 0.12s;
}
.ycc-section summary::-webkit-details-marker { display: none; }
.ycc-section summary::before { content: '▶'; font-size: 9px; color: var(--ycc-text-secondary); transition: transform 0.15s ease; flex-shrink: 0; }
.ycc-section[open] > summary::before { transform: rotate(90deg); }
.ycc-section summary:hover { background: var(--ycc-summary-hover); }

.ycc-section-content { padding: 4px 4px 4px 18px; }
.ycc-section-content p { margin: 4px 0; color: var(--ycc-text); }
.ycc-section-content p + p { margin-top: 6px; }

/* ── Table ── */
.ycc-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0; }
.ycc-table th, .ycc-table td { text-align: left; padding: 5px 10px; border-bottom: 1px solid var(--ycc-border); }
.ycc-table th { font-weight: 600; font-size: 12px; color: var(--ycc-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; background: var(--ycc-bg-secondary); }
.ycc-table tr:nth-child(even) td { background: var(--ycc-table-stripe); }
.ycc-table tr:last-child td { border-bottom: none; }

/* ── Lists ── */
.ycc-section-content ol, .ycc-section-content ul { padding-left: 20px; margin: 4px 0; }
.ycc-section-content li { margin: 3px 0; color: var(--ycc-text); }
.ycc-section-content li + li { margin-top: 4px; }

/* ── Inline ── */
.ycc-section-content strong { font-weight: 600; color: var(--ycc-text); }
.ycc-section-content code { font-family: 'Consolas', 'SF Mono', 'Monaco', monospace; font-size: 0.9em; padding: 1px 5px; border-radius: 4px; background: var(--ycc-code-bg); color: var(--ycc-accent); }

/* ── Error ── */
.ycc-error { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 8px; background: var(--ycc-error-bg); border: 1px solid var(--ycc-error-border); color: var(--ycc-error-text); font-size: 13px; }
.ycc-error-message { display: flex; align-items: flex-start; gap: 8px; }
.ycc-error-icon { flex-shrink: 0; font-size: 16px; line-height: 1.3; }
.ycc-error-retry { align-self: flex-end; padding: 4px 12px; border: 1px solid var(--ycc-error-border); border-radius: 6px; background: transparent; color: var(--ycc-error-text); font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.12s; pointer-events: auto; }
.ycc-error-retry:hover { background: var(--ycc-error-border); color: var(--ycc-accent-text); }

/* ── Streaming cursor ── */
@keyframes ycc-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.ycc-streaming-cursor::after { content: '▎'; display: inline-block; color: var(--ycc-accent); animation: ycc-blink 0.8s step-end infinite; margin-left: 1px; }

/* ── Sentence Display ── */
.ycc-sentence-display {
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 8px;
  background: var(--ycc-bg-secondary);
  border: 1px solid var(--ycc-border);
  font-size: 15px;
  line-height: 1.7;
  color: var(--ycc-text);
  word-break: break-word;
}

.ycc-sentence-word {
  background: color-mix(in srgb, var(--ycc-accent) 18%, transparent);
  color: var(--ycc-accent);
  padding: 1px 2px;
  border-radius: 3px;
  font-weight: 600;
}

/* ── Panel Footer / Model Switcher ── */
.ycc-side-panel-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--ycc-border);
  background: var(--ycc-bg-secondary);
  flex-shrink: 0;
}

.ycc-model-select {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--ycc-border);
  border-radius: 6px;
  background: var(--ycc-bg);
  color: var(--ycc-text);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.ycc-model-select:focus {
  border-color: var(--ycc-accent);
}

.ycc-make-default-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid var(--ycc-border);
  border-radius: 6px;
  background: transparent;
  color: var(--ycc-text-secondary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s, border-color 0.12s, opacity 0.12s;
  pointer-events: auto;
}

.ycc-make-default-btn:hover:not(:disabled) {
  background: var(--ycc-bg-hover);
  color: var(--ycc-text);
  border-color: var(--ycc-accent);
}

.ycc-make-default-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── Utility ── */
.ycc-hidden { display: none !important; }
`;
}
