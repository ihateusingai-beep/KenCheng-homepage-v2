/**
 * F1 — ⌘K command palette + fuzzy search.
 *
 * Hand-rolled fuzzy matching (zero external deps), keyboard nav, tag filter,
 * ARIA combobox pattern, debounced search (80ms), respects prefers-reduced-motion.
 *
 * Data source: `<script id="kc-sites-data" type="application/json">` injected
 * by index.astro at build time with the full sites list (slimmed to search fields).
 */

// ----- Types -----

interface Site {
  title: string;
  url: string;
  category: string;
  tags: string[];
  featured: boolean;
  hostname: string;
}

interface IndexEntry {
  site: Site;
  haystack: string;
}

interface ScoredResult extends IndexEntry {
  score: number;
}

const MAX_RESULTS = 10;
const DEBOUNCE_MS = 80;

// ----- Data loading -----

function loadSites(): Site[] {
  const el = document.getElementById('kc-sites-data');
  if (!el?.textContent) return [];
  try {
    return JSON.parse(el.textContent) as Site[];
  } catch {
    console.warn('[kc-palette] failed to parse sites data');
    return [];
  }
}

function buildIndex(sites: Site[]): IndexEntry[] {
  return sites.map((site) => ({
    site,
    haystack: `${site.title} ${site.category} ${site.tags.join(' ')} ${site.hostname}`.toLowerCase(),
  }));
}

function allTags(sites: Site[]): string[] {
  return [...new Set(sites.flatMap((s) => s.tags))].sort();
}

// ----- Fuzzy scoring -----
// Returns null if query not fully matched; otherwise a score (higher = better)
// + the index in the original haystack where each query char matched, for highlighting.

interface FuzzyResult {
  score: number;
  matches: number[];
}

function fuzzyScore(query: string, haystack: string, site: Site): FuzzyResult | null {
  if (!query) return { score: 1, matches: [] };

  const lower = query.toLowerCase();
  let qIdx = 0;
  let hIdx = 0;
  const matches: number[] = [];
  let consecutive = 0;
  let consecBonus = 0;

  while (qIdx < lower.length && hIdx < haystack.length) {
    if (lower[qIdx] === haystack[hIdx]) {
      matches.push(hIdx);
      consecutive += 1;
      if (consecutive > 1) consecBonus += consecutive * 2;
      qIdx += 1;
    } else {
      consecutive = 0;
    }
    hIdx += 1;
  }

  if (qIdx < lower.length) return null;

  let fieldWeight = 1;
  if (site.tags.some((t) => t.toLowerCase().includes(lower))) fieldWeight *= 2;
  if (site.category.toLowerCase().includes(lower)) fieldWeight *= 1.5;

  const firstMatch = matches[0] ?? 0;
  const baseScore = firstMatch === 0 ? 100 : Math.max(1, 50 - firstMatch);
  const score = (baseScore + consecBonus) * fieldWeight;

  return { score, matches };
}

// ----- Tag filtering -----

function filterByTags(sites: Site[], selectedTags: Set<string>): Site[] {
  if (selectedTags.size === 0) return sites;
  return sites.filter((s) => s.tags.some((t) => selectedTags.has(t)));
}

// ----- HTML escaping -----

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

// ----- Command Palette -----

class CommandPalette {
  private isOpen = false;
  private sites: Site[] = [];
  private index: IndexEntry[] = [];
  private tags: string[] = [];
  private selectedTags = new Set<string>();
  private currentResults: ScoredResult[] = [];
  private selectedIdx = 0;
  private debounceTimer: number | null = null;
  private lastTriggerEl: HTMLElement | null = null;

  private root!: HTMLElement;
  private input!: HTMLInputElement;
  private tagsEl!: HTMLElement;
  private resultsEl!: HTMLElement;

  constructor() {
    this.sites = loadSites();
    this.index = buildIndex(this.sites);
    this.tags = allTags(this.sites);

    const root = document.getElementById('kc-palette');
    const input = document.getElementById('kc-palette-input') as HTMLInputElement | null;
    const tagsEl = document.getElementById('kc-palette-tags');
    const resultsEl = document.getElementById('kc-palette-results');
    if (!root || !input || !tagsEl || !resultsEl) {
      console.warn('[kc-palette] required DOM elements missing');
      return;
    }
    this.root = root;
    this.input = input;
    this.tagsEl = tagsEl;
    this.resultsEl = resultsEl;

    this.renderTags();
    this.bindEvents();
    this.renderEmpty('輸入關鍵字開始搜尋…');
  }

  private bindEvents(): void {
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const isSlash = e.key === '/' && !this.isInEditable(e.target);

      if (isCmdK) {
        e.preventDefault();
        this.toggle();
      } else if (isSlash) {
        e.preventDefault();
        this.open();
      } else if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });

    // Backdrop click to close
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.hasAttribute('data-kc-palette-close')) {
        this.close();
      }
    });

    // Input change → debounce → search
    this.input.addEventListener('input', () => {
      if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.runSearch(), DEBOUNCE_MS);
    });

    // Arrow keys + Enter
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.openSelected();
      }
    });
  }

  private isInEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
  }

  private toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  private open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastTriggerEl = (document.activeElement as HTMLElement | null) ?? null;
    document.body.classList.add('kc-palette-open');
    this.root.setAttribute('aria-hidden', 'false');
    this.input.value = '';
    this.selectedTags.clear();
    this.renderTags();
    this.runSearch();
    setTimeout(() => this.input.focus(), 50);
  }

  private close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.body.classList.remove('kc-palette-open');
    this.root.setAttribute('aria-hidden', 'true');
    this.input.blur();
    this.lastTriggerEl?.focus();
  }

  private renderTags(): void {
    const html = this.tags
      .map((tag) => {
        const isSelected = this.selectedTags.has(tag);
        const cls = isSelected ? 'kc-tag kc-tag-selected' : 'kc-tag';
        return `<button type="button" class="${cls}" data-tag="${escapeHtml(tag)}" aria-pressed="${isSelected}">${escapeHtml(tag)}</button>`;
      })
      .join('');
    this.tagsEl.innerHTML = html;

    this.tagsEl.querySelectorAll<HTMLButtonElement>('.kc-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (!tag) return;
        if (this.selectedTags.has(tag)) {
          this.selectedTags.delete(tag);
        } else {
          this.selectedTags.add(tag);
        }
        this.renderTags();
        this.runSearch();
      });
    });
  }

  private runSearch(): void {
    const query = this.input.value.trim();
    const filtered = filterByTags(this.sites, this.selectedTags);

    if (!query && this.selectedTags.size === 0) {
      // Show all (sorted by featured first, then title)
      this.currentResults = filtered
        .map<ScoredResult>((site) => ({ site, haystack: '', score: site.featured ? 100 : 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS);
    } else if (!query) {
      // Tag-only filter
      this.currentResults = filtered.slice(0, MAX_RESULTS).map<ScoredResult>((site) => ({
        site,
        haystack: '',
        score: 0,
      }));
    } else {
      // Fuzzy search (apply tag filter on top)
      const scored: ScoredResult[] = [];
      for (const entry of this.index) {
        if (this.selectedTags.size > 0 && !entry.site.tags.some((t) => this.selectedTags.has(t))) {
          continue;
        }
        const result = fuzzyScore(query, entry.haystack, entry.site);
        if (result) {
          scored.push({ ...entry, score: result.score });
        }
      }
      this.currentResults = scored.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
    }

    this.selectedIdx = 0;
    this.renderResults(query);
  }

  private renderResults(query: string): void {
    if (this.currentResults.length === 0) {
      const clearBtn =
        this.selectedTags.size > 0
          ? '<button type="button" class="kc-clear-btn" id="kc-clear-tags">清除 tag filter</button>'
          : '';
      this.resultsEl.innerHTML = `
        <li class="kc-palette-empty">
          搵唔到「<strong>${escapeHtml(query)}</strong>」嘅結果
          ${clearBtn}
        </li>`;
      const clearEl = document.getElementById('kc-clear-tags');
      if (clearEl) {
        clearEl.addEventListener('click', () => {
          this.selectedTags.clear();
          this.renderTags();
          this.runSearch();
        });
      }
      this.input.setAttribute('aria-activedescendant', '');
      return;
    }

    this.resultsEl.innerHTML = this.currentResults
      .map((r, i) => this.renderResultItem(r, i, query))
      .join('');

    const selected = this.resultsEl.querySelector(`[data-idx="${this.selectedIdx}"]`) as HTMLElement | null;
    if (selected) {
      this.input.setAttribute('aria-activedescendant', selected.id);
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  private renderResultItem(r: ScoredResult, idx: number, query: string): string {
    const isSelected = idx === this.selectedIdx;
    const cls = isSelected ? 'kc-result kc-result-selected' : 'kc-result';
    const highlighted = this.highlightTitle(r.site.title, query);

    return `<li
      id="kc-result-${idx}"
      data-idx="${idx}"
      data-url="${escapeHtml(r.site.url)}"
      class="${cls}"
      role="option"
      aria-selected="${isSelected}"
    >
      <div class="kc-result-main">
        <span class="kc-result-title">${highlighted}</span>
        <span class="kc-result-host">${escapeHtml(r.site.hostname)}</span>
      </div>
      <div class="kc-result-meta">
        <span class="kc-result-cat">${escapeHtml(r.site.category)}</span>
        ${r.site.featured ? '<span class="kc-result-star" aria-label="featured">★</span>' : ''}
      </div>
    </li>`;
  }

  private highlightTitle(title: string, query: string): string {
    if (!query) return escapeHtml(title);
    const idx = title.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(title);
    return (
      escapeHtml(title.slice(0, idx)) +
      '<mark class="kc-mark">' +
      escapeHtml(title.slice(idx, idx + query.length)) +
      '</mark>' +
      escapeHtml(title.slice(idx + query.length))
    );
  }

  private renderEmpty(msg: string): void {
    this.resultsEl.innerHTML = `<li class="kc-palette-empty">${escapeHtml(msg)}</li>`;
  }

  private moveSelection(delta: number): void {
    if (this.currentResults.length === 0) return;
    this.selectedIdx = (this.selectedIdx + delta + this.currentResults.length) % this.currentResults.length;
    this.renderResults(this.input.value);
  }

  private openSelected(): void {
    const sel = this.currentResults[this.selectedIdx];
    if (!sel) return;
    window.open(sel.site.url, '_blank', 'noopener,noreferrer');
    this.close();
  }
}

// ----- Bootstrap -----

function bootstrap(): void {
  // Only initialize on pages with the palette markup
  if (!document.getElementById('kc-palette')) return;
  new CommandPalette();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}