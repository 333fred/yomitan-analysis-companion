export class SectionRenderer {
  private container: HTMLElement | null = null;
  private buffer: string = '';
  private currentSection: HTMLDetailsElement | null = null;
  private currentSectionContent: HTMLDivElement | null = null;
  private currentList: HTMLOListElement | HTMLUListElement | null = null;
  private currentListType: 'ol' | 'ul' | null = null;
  private tableState: TableParseState | null = null;
  private isStreaming: boolean = false;

  attach(container: HTMLElement): void {
    this.container = container;
    this.reset();
  }

  appendChunk(chunk: string): void {
    this.isStreaming = true;
    this.buffer += chunk;
    this.processBuffer();
  }

  finalize(): void {
    // Flush any remaining partial line in the buffer
    if (this.buffer.length > 0) {
      this.flushLine(this.buffer);
      this.buffer = '';
    }
    this.closeList();
    this.closeTable();
    this.removeStreamingCursor();
    this.isStreaming = false;
  }

  private reset(): void {
    this.buffer = '';
    this.currentSection = null;
    this.currentSectionContent = null;
    this.currentList = null;
    this.currentListType = null;
    this.tableState = null;
    this.isStreaming = false;
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      this.flushLine(line);
    }

    this.updateStreamingCursor();
  }

  private flushLine(line: string): void {
    const trimmed = line.trimEnd();

    // Heading → new section
    if (trimmed.startsWith('## ')) {
      this.closeList();
      this.closeTable();
      const title = trimmed.slice(3).trim();
      this.createSection(title);
      return;
    }

    // Ensure we have a target to render into
    const target = this.currentSectionContent ?? this.getOrCreateDefaultTarget();

    // Table row (contains | but is not a separator line like |---|---|)
    if (this.isTableRow(trimmed)) {
      this.closeList();
      this.handleTableRow(trimmed, target);
      return;
    }

    // If we were in a table and this line is not a table row, close the table
    if (this.tableState) {
      this.closeTable();
    }

    // Blank line → close current list
    if (trimmed === '') {
      this.closeList();
      return;
    }

    // Ordered list item: 1. text / 1) text
    const olMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/);
    if (olMatch) {
      if (this.currentListType !== 'ol') {
        this.closeList();
        this.currentList = document.createElement('ol');
        this.currentListType = 'ol';
        target.appendChild(this.currentList);
      }
      const li = document.createElement('li');
      li.innerHTML = this.renderInlineMarkdown(olMatch[2]);
      this.currentList!.appendChild(li);
      return;
    }

    // Unordered list item: - text / * text
    const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (this.currentListType !== 'ul') {
        this.closeList();
        this.currentList = document.createElement('ul');
        this.currentListType = 'ul';
        target.appendChild(this.currentList);
      }
      const li = document.createElement('li');
      li.innerHTML = this.renderInlineMarkdown(ulMatch[1]);
      this.currentList!.appendChild(li);
      return;
    }

    // Plain text → paragraph
    this.closeList();
    const p = document.createElement('p');
    p.innerHTML = this.renderInlineMarkdown(trimmed);
    target.appendChild(p);
  }

  createSection(title: string): HTMLDetailsElement {
    this.closeList();
    this.closeTable();

    const details = document.createElement('details');
    details.className = 'ycc-section';
    details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);

    const content = document.createElement('div');
    content.className = 'ycc-section-content';
    details.appendChild(content);

    if (this.container) {
      this.container.appendChild(details);
    }

    this.currentSection = details;
    this.currentSectionContent = content;
    return details;
  }

  private getOrCreateDefaultTarget(): HTMLElement {
    if (!this.container) {
      throw new Error('SectionRenderer: no container attached');
    }
    // If no section exists yet, render directly into the container
    if (!this.currentSectionContent) {
      const wrapper = document.createElement('div');
      wrapper.className = 'ycc-section-content';
      this.container.appendChild(wrapper);
      this.currentSectionContent = wrapper;
    }
    return this.currentSectionContent;
  }

  // ── Table handling ──

  private isTableRow(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return false;
    // Must start or end with | to be a real markdown table row
    return trimmed.startsWith('|') || trimmed.endsWith('|');
  }

  private isTableSeparator(line: string): boolean {
    return /^\|?[\s:]*-{2,}[\s:|-]*\|?$/.test(line.trim());
  }

  private handleTableRow(line: string, target: HTMLElement): void {
    if (this.isTableSeparator(line)) {
      // Separator line between header and body — just skip it
      if (this.tableState) {
        this.tableState.headerComplete = true;
      }
      return;
    }

    const cells = this.parseTableCells(line);

    if (!this.tableState) {
      // First row → header
      this.tableState = { table: document.createElement('table'), headerComplete: false };
      this.tableState.table.className = 'ycc-table';

      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      for (const cell of cells) {
        const th = document.createElement('th');
        th.innerHTML = this.renderInlineMarkdown(cell);
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      this.tableState.table.appendChild(thead);
      target.appendChild(this.tableState.table);
    } else {
      // Body row
      let tbody = this.tableState.table.querySelector('tbody');
      if (!tbody) {
        tbody = document.createElement('tbody');
        this.tableState.table.appendChild(tbody);
      }
      const tr = document.createElement('tr');
      for (const cell of cells) {
        const td = document.createElement('td');
        td.innerHTML = this.renderInlineMarkdown(cell);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  private parseTableCells(line: string): string[] {
    let inner = line.trim();
    // Strip leading/trailing pipes
    if (inner.startsWith('|')) inner = inner.slice(1);
    if (inner.endsWith('|')) inner = inner.slice(0, -1);
    return inner.split('|').map((c) => c.trim());
  }

  private closeTable(): void {
    this.tableState = null;
  }

  // ── List handling ──

  private closeList(): void {
    this.currentList = null;
    this.currentListType = null;
  }

  // ── Inline markdown ──

  renderInlineMarkdown(text: string): string {
    let html = this.escapeHtml(text);

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Inline code: `text`
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Streaming cursor ──

  private updateStreamingCursor(): void {
    if (!this.isStreaming || !this.container) return;

    this.removeStreamingCursor();

    // Find the last text-bearing element and add the cursor class
    const target = this.currentSectionContent ?? this.container;
    const lastEl = target.lastElementChild as HTMLElement | null;
    if (lastEl) {
      lastEl.classList.add('ycc-streaming-cursor');
    }
  }

  private removeStreamingCursor(): void {
    if (!this.container) return;
    const cursors = this.container.querySelectorAll('.ycc-streaming-cursor');
    cursors.forEach((el) => el.classList.remove('ycc-streaming-cursor'));
  }
}

interface TableParseState {
  table: HTMLTableElement;
  headerComplete: boolean;
}
