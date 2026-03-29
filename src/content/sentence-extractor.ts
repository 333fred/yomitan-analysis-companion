export interface SentenceData {
  word: string;
  sentence: string;
  /** Character offset of `word` within `sentence` */
  wordOffset: number;
}

// Japanese and general sentence terminators
const SENTENCE_TERMINATORS = /[。！？!?\n…]/;
const MAX_SENTENCE_LENGTH = 500;

// Tags whose text content should never be treated as page prose
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH',
]);

/**
 * Extracts the word under the cursor and expands it to full-sentence context.
 *
 * Uses a hybrid strategy:
 * 1. If the user has an active text selection, use that as the word and expand.
 * 2. Otherwise fall back to `caretRangeFromPoint` / `caretPositionFromPoint`
 *    using the last recorded mouse position.
 */
export class SentenceExtractor {
  private lastMousePosition = { x: 0, y: 0 };
  private onMouseMove: ((e: MouseEvent) => void) | null = null;

  startTracking(): void {
    if (this.onMouseMove) return;
    this.onMouseMove = (e: MouseEvent) => {
      this.lastMousePosition = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', this.onMouseMove, { passive: true });
  }

  stopTracking(): void {
    if (this.onMouseMove) {
      document.removeEventListener('mousemove', this.onMouseMove);
      this.onMouseMove = null;
    }
  }

  extractSentence(): SentenceData | null {
    // Strategy 1: active text selection
    const selectionResult = this.fromSelection();
    if (selectionResult) return selectionResult;

    // Strategy 2: caret under last mouse position
    return this.fromCursorPosition();
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private fromSelection(): SentenceData | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

    const word = selection.toString().trim();
    if (!word) return null;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    if (!this.isVisibleTextNode(container)) return null;

    const text = this.getBlockText(container);
    if (!text) return null;

    const offsetInBlock = this.getOffsetInBlock(container, range.startOffset);
    return this.buildSentenceData(word, text, offsetInBlock);
  }

  private fromCursorPosition(): SentenceData | null {
    const { x, y } = this.lastMousePosition;
    if (x === 0 && y === 0) return null;

    const caret = this.getCaretAtPoint(x, y);
    if (!caret) return null;

    const { node, offset } = caret;
    if (!this.isVisibleTextNode(node)) return null;

    const nodeText = node.textContent ?? '';
    const word = this.extractWordAt(nodeText, offset);
    if (!word) return null;

    const blockText = this.getBlockText(node);
    if (!blockText) return null;

    const offsetInBlock = this.getOffsetInBlock(node, offset);
    return this.buildSentenceData(word, blockText, offsetInBlock);
  }

  /**
   * Cross-browser caret-from-point. Chrome exposes `caretRangeFromPoint`,
   * Firefox exposes `caretPositionFromPoint`.
   */
  private getCaretAtPoint(x: number, y: number): { node: Node; offset: number } | null {
    if ('caretRangeFromPoint' in document) {
      const range = document.caretRangeFromPoint(x, y);
      if (!range) return null;
      return { node: range.startContainer, offset: range.startOffset };
    }

    // Firefox
    if ('caretPositionFromPoint' in document) {
      const pos = (document as unknown as { caretPositionFromPoint(x: number, y: number): { offsetNode: Node; offset: number } | null })
        .caretPositionFromPoint(x, y);
      if (!pos) return null;
      return { node: pos.offsetNode, offset: pos.offset };
    }

    return null;
  }

  /** Extract the word surrounding `offset` in `text`. */
  private extractWordAt(text: string, offset: number): string {
    if (offset < 0 || offset > text.length) return '';

    // For CJK text a single character is often a "word"
    if (this.isCJK(text.charAt(offset) || text.charAt(offset - 1))) {
      // Return the character at (or just before) the caret
      const idx = offset < text.length ? offset : offset - 1;
      return idx >= 0 ? text.charAt(idx) : '';
    }

    // For alphabetic text, expand to word boundaries
    let start = offset;
    let end = offset;
    while (start > 0 && this.isWordChar(text.charAt(start - 1))) start--;
    while (end < text.length && this.isWordChar(text.charAt(end))) end++;
    return text.slice(start, end);
  }

  /**
   * Gather the full text of the nearest block-level ancestor.
   * This gives us a natural paragraph to search for sentence boundaries.
   */
  private getBlockText(node: Node): string | null {
    const block = this.findBlockAncestor(node);
    if (!block) return null;
    return this.collectText(block);
  }

  /**
   * Compute the character offset of `node`:`localOffset` within its
   * block-level ancestor's collected text.
   */
  private getOffsetInBlock(node: Node, localOffset: number): number {
    const block = this.findBlockAncestor(node);
    if (!block) return 0;

    let accumulated = 0;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        this.shouldIncludeTextNode(n)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });

    while (walker.nextNode()) {
      if (walker.currentNode === node) {
        return accumulated + localOffset;
      }
      accumulated += (walker.currentNode.textContent ?? '').length;
    }
    return accumulated;
  }

  /** Walk up the DOM to the nearest block-level element. */
  private findBlockAncestor(node: Node): HTMLElement | null {
    let current: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (current && current instanceof HTMLElement) {
      if (this.isBlockElement(current)) return current;
      current = current.parentElement;
    }
    // Fall back to body
    return document.body;
  }

  private isBlockElement(el: HTMLElement): boolean {
    const display = window.getComputedStyle(el).display;
    return (
      display === 'block' ||
      display === 'flex' ||
      display === 'grid' ||
      display === 'table' ||
      display === 'list-item' ||
      el.tagName === 'P' ||
      el.tagName === 'DIV' ||
      el.tagName === 'ARTICLE' ||
      el.tagName === 'SECTION' ||
      el.tagName === 'LI' ||
      el.tagName === 'TD' ||
      el.tagName === 'BLOCKQUOTE'
    );
  }

  /** Collect visible text from a subtree, skipping script/style etc. */
  private collectText(root: Node): string {
    let result = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        this.shouldIncludeTextNode(n)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    while (walker.nextNode()) {
      result += walker.currentNode.textContent ?? '';
    }
    return result;
  }

  private shouldIncludeTextNode(node: Node): boolean {
    let parent = node.parentElement;
    while (parent) {
      if (SKIP_TAGS.has(parent.tagName)) return false;
      parent = parent.parentElement;
    }
    return true;
  }

  private isVisibleTextNode(node: Node): boolean {
    if (node.nodeType !== Node.TEXT_NODE) return false;
    return this.shouldIncludeTextNode(node);
  }

  /** Build the final SentenceData by expanding around `offset` in `text`. */
  private buildSentenceData(
    word: string,
    text: string,
    offsetInText: number,
  ): SentenceData | null {
    if (!word || !text) return null;

    // Clamp offset
    const offset = Math.max(0, Math.min(offsetInText, text.length - 1));

    // Scan backward for sentence start
    let sentenceStart = offset;
    let scanned = 0;
    while (sentenceStart > 0 && scanned < MAX_SENTENCE_LENGTH) {
      sentenceStart--;
      scanned++;
      if (SENTENCE_TERMINATORS.test(text.charAt(sentenceStart))) {
        sentenceStart++; // don't include the terminator of the *previous* sentence
        break;
      }
    }

    // Scan forward for sentence end
    let sentenceEnd = offset;
    scanned = 0;
    while (sentenceEnd < text.length && scanned < MAX_SENTENCE_LENGTH) {
      if (SENTENCE_TERMINATORS.test(text.charAt(sentenceEnd))) {
        sentenceEnd++; // include the terminator
        break;
      }
      sentenceEnd++;
      scanned++;
    }

    const sentence = text.slice(sentenceStart, sentenceEnd).trim();
    if (!sentence) return null;

    // Locate the word within the extracted sentence
    const wordOffset = sentence.indexOf(word);

    return {
      word,
      sentence,
      wordOffset: wordOffset >= 0 ? wordOffset : 0,
    };
  }

  private isCJK(ch: string): boolean {
    if (!ch) return false;
    const code = ch.codePointAt(0)!;
    // CJK Unified Ideographs, Hiragana, Katakana, Hangul
    return (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0xac00 && code <= 0xd7af)    // Hangul
    );
  }

  private isWordChar(ch: string): boolean {
    return /[\w\u00C0-\u024F'-]/.test(ch);
  }
}
