/**
 * F1 — ⌘K command palette + fuzzy search.
 * F3 — Bookmark quick-add (2026-07-08).
 *
 * Hand-rolled fuzzy matching (zero external deps), keyboard nav, tag filter,
 * ARIA combobox pattern, debounced search (80ms), respects prefers-reduced-motion.
 * Bookmark mode: localStorage persistence, XSS-protected URL validation.
 *
 * Data source: `<script id="kc-sites-data" type="application/json">` injected
 * by index.astro at build time with the full sites list (slimmed to search fields).
 */

import {
  readAll as bmReadAll,
  add as bmAdd,
  remove as bmRemove,
  exportJson as bmExport,
  importJson as bmImport,
  displayName as bmDisplayName,
  type Bookmark,
} from './bookmark-store';

// ----- Types -----

interface Site {
  title: string;
  url: string;
  category: string;
  tags: string[];
  featured: boolean;
  hostname: string;
  health: 'alive' | 'redirect' | 'dead' | 'slow' | 'unverified';
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

// ----- Scoring -----
// Strategy: exact substring wins (high priority, no gap penalty).
// Only fall back to fuzzy chars-in-order for typos.
// Returns null = no match at all.

const SCORE_TITLE_PREFIX = 250;
const SCORE_TITLE_CONTAINS = 200;
const SCORE_TAG = 130;
const SCORE_CATEGORY = 110;
const SCORE_HOSTNAME = 90;
const SCORE_FUZZY_MIN = 15;

function exactSubstringScore(query: string, site: Site): number | null {
  if (!query) return 1;
  const lower = query.toLowerCase();

  // Title substring (highest priority)
  const titleLower = site.title.toLowerCase();
  const titleIdx = titleLower.indexOf(lower);
  if (titleIdx >= 0) {
    return titleIdx === 0 ? SCORE_TITLE_PREFIX : SCORE_TITLE_CONTAINS - titleIdx;
  }

  // Tag substring
  for (const tag of site.tags) {
    if (tag.toLowerCase().includes(lower)) {
      return SCORE_TAG;
    }
  }

  // Category substring
  if (site.category.toLowerCase().includes(lower)) {
    return SCORE_CATEGORY;
  }

  // Hostname substring
  if (site.hostname.toLowerCase().includes(lower)) {
    return SCORE_HOSTNAME;
  }

  return null;
}

// Fuzzy fallback — only used for typos (e.g. "gihub" → "github")
function fuzzyScore(query: string, haystack: string): number | null {
  if (!query) return 1;
  const lower = query.toLowerCase();
  let qIdx = 0;
  let hIdx = 0;
  let consecutive = 0;
  let consecBonus = 0;
  let lastMatchIdx = -1;
  let gapPenalty = 0;

  while (qIdx < lower.length && hIdx < haystack.length) {
    if (lower[qIdx] === haystack[hIdx]) {
      consecutive += 1;
      if (consecutive > 1) consecBonus += consecutive * 2;
      if (lastMatchIdx >= 0) {
        const gap = hIdx - lastMatchIdx - 1;
        if (gap > 0) gapPenalty += gap * 3;
      }
      lastMatchIdx = hIdx;
      qIdx += 1;
    } else {
      consecutive = 0;
    }
    hIdx += 1;
  }

  if (qIdx < lower.length) return null;

  const firstMatch = haystack.indexOf(lower[0] ?? '');
  const baseScore = firstMatch === 0 ? 70 : Math.max(1, 40 - firstMatch);
  const score = baseScore + consecBonus - gapPenalty;

  if (score < SCORE_FUZZY_MIN) return null;
  return score;
}

function scoreSite(query: string, site: Site, haystack: string): number | null {
  // 1. Exact substring (case-insensitive) — high priority
  const exact = exactSubstringScore(query, site);
  if (exact !== null) return exact;

  // 2. Fuzzy fallback (for typos)
  return fuzzyScore(query, haystack);
}

// ----- Tag filtering -----

function filterByTags(sites: Site[], selectedTags: Set<string>): Site[] {
  if (selectedTags.size === 0) return sites;
  return sites.filter((s) => s.tags.some((t) => selectedTags.has(t)));
}

// ----- Health badge -----

const HEALTH_META: Record<string, { label: string; cls: string; title: string }> = {
  alive:      { label: '●', cls: 'kc-health-alive',      title: '正常' },
  redirect:   { label: '→', cls: 'kc-health-redirect',   title: '跳轉' },
  dead:       { label: '✕', cls: 'kc-health-dead',       title: '失效' },
  slow:       { label: '◐', cls: 'kc-health-slow',      title: '緩慢' },
  unverified: { label: '?', cls: 'kc-health-unverified',  title: '未驗證' },
};

function healthBadgeHtml(health: string): string {
  const m = HEALTH_META[health] ?? HEALTH_META['unverified'];
  return `<span class="kc-health-dot ${m.cls}" title="${m.title}" aria-label="${m.title}">${m.label}</span>`;
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

  // F3 — tab state
  private currentTab: 'search' | 'bookmarks' = 'search';

  private root!: HTMLElement;
  private input!: HTMLInputElement;
  private tagsEl!: HTMLElement;
  private resultsEl!: HTMLElement;

  // F3 — bookmark DOM refs
  private tabSearch!: HTMLElement;
  private tabBookmarks!: HTMLElement;
  private panelSearch!: HTMLElement;
  private panelBookmarks!: HTMLElement;
  private bmUrlInput!: HTMLInputElement;
  private bmTitleInput!: HTMLInputElement;
  private bmCatSelect!: HTMLSelectElement;
  private bmForm!: HTMLFormElement;
  private bmAddMsg!: HTMLElement;
  private bmList!: HTMLElement;
  private bmCount!: HTMLElement;
  private bmExportBtn!: HTMLButtonElement;
  private bmImportBtn!: HTMLButtonElement;
  private bmImportFile!: HTMLInputElement;

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

    // F3 — resolve bookmark DOM refs
    this.tabSearch = document.getElementById('kc-tab-search')!;
    this.tabBookmarks = document.getElementById('kc-tab-bookmarks')!;
    this.panelSearch = document.getElementById('kc-palette-search')!;
    this.panelBookmarks = document.getElementById('kc-palette-bookmarks')!;
    this.bmUrlInput = document.getElementById('kc-bm-url') as HTMLInputElement;
    this.bmTitleInput = document.getElementById('kc-bm-title') as HTMLInputElement;
    this.bmCatSelect = document.getElementById('kc-bm-cat') as HTMLSelectElement;
    this.bmForm = document.getElementById('kc-bm-add-form') as HTMLFormElement;
    this.bmAddMsg = document.getElementById('kc-bm-add-msg') as HTMLElement;
    this.bmList = document.getElementById('kc-bm-list') as HTMLElement;
    this.bmCount = document.getElementById('kc-bm-count') as HTMLElement;
    this.bmExportBtn = document.getElementById('kc-bm-export') as HTMLButtonElement;
    this.bmImportBtn = document.getElementById('kc-bm-import') as HTMLButtonElement;
    this.bmImportFile = document.getElementById('kc-bm-import-file') as HTMLInputElement;

    this.renderTags();
    this.bindEvents();
    this.bindBookmarkEvents(); // F3
    this.renderEmpty('輸入關鍵字開始搜尋…');
    this.refreshBookmarkCount(); // F3
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

    // F3 — tab switching
    this.tabSearch.addEventListener('click', () => this.switchTab('search'));
    this.tabBookmarks.addEventListener('click', () => this.switchTab('bookmarks'));
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
    setTimeout(() => {
      if (this.currentTab === 'search') this.input.focus();
    }, 50);
  }

  // ── F3: Tab switching ─────────────────────────────────────────

  private switchTab(tab: 'search' | 'bookmarks'): void {
    this.currentTab = tab;
    if (tab === 'search') {
      this.tabSearch.classList.add('kc-palette-tab-active');
      this.tabBookmarks.classList.remove('kc-palette-tab-active');
      this.tabSearch.setAttribute('aria-selected', 'true');
      this.tabBookmarks.setAttribute('aria-selected', 'false');
      this.panelSearch.style.display = '';
      this.panelBookmarks.style.display = 'none';
      this.input.focus();
    } else {
      this.tabBookmarks.classList.add('kc-palette-tab-active');
      this.tabSearch.classList.remove('kc-palette-tab-active');
      this.tabBookmarks.setAttribute('aria-selected', 'true');
      this.tabSearch.setAttribute('aria-selected', 'false');
      this.panelBookmarks.style.display = '';
      this.panelSearch.style.display = 'none';
      this.refreshBookmarkList();
      this.refreshBookmarkCount();
    }
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
      // Search (exact substring + fuzzy fallback). Apply tag filter on top.
      const scored: ScoredResult[] = [];
      for (const entry of this.index) {
        if (this.selectedTags.size > 0 && !entry.site.tags.some((t) => this.selectedTags.has(t))) {
          continue;
        }
        const score = scoreSite(query, entry.site, entry.haystack);
        if (score !== null) {
          scored.push({ ...entry, score });
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
        ${healthBadgeHtml(r.site.health)}
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

  // ═══════════════════════════════════════════════════════════════════
  // F3 — Bookmark quick-add
  // ═══════════════════════════════════════════════════════════════════

  private bindBookmarkEvents(): void {
    // Form submit → add bookmark
    this.bmForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAddBookmark();
    });

    // Export
    this.bmExportBtn.addEventListener('click', () => {
      const json = bmExport();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kencheng-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showBmMsg('success', `✅ 匯出 ${bmReadAll().length} 個書籤`);
    });

    // Import
    this.bmImportBtn.addEventListener('click', () => {
      this.bmImportFile.value = '';
      this.bmImportFile.click();
    });
    this.bmImportFile.addEventListener('change', () => {
      const file = this.bmImportFile.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const result = bmImport(text);
        this.refreshBookmarkList();
        this.refreshBookmarkCount();
        if (result.added > 0) {
          this.showBmMsg('success', `✅ 匯入 ${result.added} 個新書籤${result.skipped > 0 ? `，跳過 ${result.skipped} 個重複` : ''}`);
        } else {
          this.showBmMsg('error', '⚠️ 冇發現新書籤或檔案格式錯誤');
        }
      };
      reader.readAsText(file);
    });

    // URL input: auto-populate title placeholder with hostname hint
    this.bmUrlInput.addEventListener('input', () => {
      try {
        const u = new URL(this.bmUrlInput.value);
        this.bmTitleInput.placeholder = `標題 (可留空，自動取 ${u.hostname.replace(/^www\./, '')})`;
      } catch {
        this.bmTitleInput.placeholder = '標題 (可留空，自動取網址名)';
      }
    });
  }

  private handleAddBookmark(): void {
    const url = this.bmUrlInput.value.trim();
    if (!url) {
      this.showBmMsg('error', '⚠️ 請填入網址');
      return;
    }
    const title = this.bmTitleInput.value.trim();
    const category = this.bmCatSelect.value;

    const result = bmAdd(url, { title, category });
    if (!result) {
      this.showBmMsg('error', '⚠️ 網址無效或已存在 (只接受 http/https)');
      return;
    }

    // Success — clear form + refresh list
    this.bmUrlInput.value = '';
    this.bmTitleInput.value = '';
    this.bmCatSelect.selectedIndex = 0;
    this.bmTitleInput.placeholder = '標題 (可留空，自動取網址名)';
    this.refreshBookmarkList();
    this.refreshBookmarkCount();
    this.showBmMsg('success', `✅ 已加入「${bmDisplayName(result)}」`);
  }

  private refreshBookmarkCount(): void {
    const count = bmReadAll().length;
    if (count > 0) {
      this.bmCount.textContent = String(count);
      this.bmCount.style.display = '';
    } else {
      this.bmCount.style.display = 'none';
    }
  }

  private refreshBookmarkList(): void {
    const bookmarks = bmReadAll();
    if (bookmarks.length === 0) {
      this.bmList.innerHTML = `
        <li class="kc-palette-empty">
          <span class="kc-bm-empty-icon" aria-hidden="true">★</span>
          暫時未有書籤
        </li>`;
      return;
    }

    this.bmList.innerHTML = bookmarks
      .map((b) => this.renderBookmarkItem(b))
      .join('');

    // Bind click: open bookmark
    this.bmList.querySelectorAll<HTMLElement>('.kc-bm-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.kc-bm-delete-btn')) return;
        const url = item.dataset.url;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        this.close();
      });

      // Bind delete
      const delBtn = item.querySelector<HTMLButtonElement>('.kc-bm-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = delBtn.dataset.id;
          if (id && bmRemove(id)) {
            this.refreshBookmarkList();
            this.refreshBookmarkCount();
          }
        });
      }
    });
  }

  private renderBookmarkItem(b: Bookmark): string {
    const name = escapeHtml(bmDisplayName(b));
    const host = (() => {
      try { return escapeHtml(new URL(b.url).hostname.replace(/^www\./, '')); }
      catch { return escapeHtml(b.url); }
    })();
    return `<li
      class="kc-bm-item"
      data-url="${escapeHtml(b.url)}"
      tabindex="0"
      role="option"
      aria-label="書籤: ${name}"
    >
      <div class="kc-bm-item-main">
        <span class="kc-bm-item-title">${name}</span>
        <span class="kc-bm-item-url">${host}</span>
      </div>
      <div class="kc-bm-item-meta">
        <span class="kc-bm-item-cat">${escapeHtml(b.category)}</span>
        <button
          class="kc-bm-delete-btn"
          data-id="${escapeHtml(b.id)}"
          aria-label="刪除書籤 ${name}"
          title="刪除"
          type="button"
        >✕</button>
      </div>
    </li>`;
  }

  private showBmMsg(type: 'success' | 'error', text: string): void {
    this.bmAddMsg.className = `kc-bm-add-msg kc-bm-msg-${type}`;
    this.bmAddMsg.textContent = text;
    this.bmAddMsg.style.display = 'block';
    setTimeout(() => {
      this.bmAddMsg.style.display = 'none';
    }, 3500);
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