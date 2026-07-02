/**
 * filter.ts — Client-side filter bar with URL state sync.
 * Reads ?cat=X from URL on load, updates cards visibility,
 * writes back to URL on chip click (no page reload).
 */

interface FilterState {
  category: string | null;
}

// ── Category config (must match Astro template constants) ───────────────────
const CATS = ['數學', '科學', '教學', 'AI', '開發', '設計', '學習', '其他'];
const CAT_ICONS: Record<string, string> = {
  '數學': '🔢', '科學': '🔬', '教學': '📚',
  'AI': '🤖', '開發': '⚙️', '設計': '🎨',
  '學習': '💡', '其他': '📌',
};

// ── State ──────────────────────────────────────────────────────────────────
let current: FilterState = { category: null };

// ── URL ↔ state ────────────────────────────────────────────────────────────
function readFromURL(): FilterState {
  try {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat');
    return { category: CATS.includes(cat ?? '') ? cat : null };
  } catch {
    return { category: null };
  }
}

function syncToURL(state: FilterState) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (state.category) {
      params.set('cat', state.category);
    } else {
      params.delete('cat');
    }
    const qs = params.toString();
    history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
  } catch {
    // ignore
  }
}

// ── Card filtering ─────────────────────────────────────────────────────────
function getCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-category]'));
}

function applyFilter(state: FilterState) {
  const cards = getCards();
  const emptyMsg = document.getElementById('filter-empty');
  const countEl = document.getElementById('filter-count');
  let visible = 0;

  cards.forEach((card) => {
    const cat = card.dataset.category ?? '';
    const show = !state.category || cat === state.category;
    card.classList.toggle('kc-hidden', !show);
    if (show) visible++;
  });

  if (countEl) countEl.textContent = `${visible} sites`;
  if (emptyMsg) emptyMsg.style.display = visible === 0 ? 'block' : 'none';
}

function updateChips(state: FilterState) {
  document.querySelectorAll<HTMLElement>('.kc-filter-chip').forEach((chip) => {
    const cat = chip.dataset.cat ?? '';
    const isActive = cat === state.category;
    chip.classList.toggle('kc-active', isActive);
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Reset button
  const resetWrap = document.getElementById('filter-reset-wrap');
  if (resetWrap) {
    resetWrap.innerHTML = '';
    if (state.category) {
      const btn = document.createElement('button');
      btn.className = 'kc-filter-chip';
      btn.dataset.action = 'reset';
      btn.innerHTML = '✕ 清除';
      btn.setAttribute('aria-label', '清除篩選');
      resetWrap.appendChild(btn);
    }
  }
}

function initChips(state: FilterState) {
  const catRow = document.getElementById('filter-cat-chips');
  if (!catRow) return;

  // Count per category from DOM
  const counts: Record<string, number> = {};
  getCards().forEach((c) => {
    const cat = c.dataset.category ?? '';
    counts[cat] = (counts[cat] ?? 0) + 1;
  });

  // "全部" chip
  const allBtn = document.createElement('button');
  allBtn.className = 'kc-filter-chip' + (!state.category ? ' kc-active' : '');
  allBtn.dataset.cat = '';
  allBtn.dataset.action = 'cat';
  allBtn.setAttribute('aria-pressed', (!state.category).toString());
  allBtn.innerHTML = `全部 <span class="chip-count">${Object.values(counts).reduce((a, b) => a + b, 0)}</span>`;
  catRow.appendChild(allBtn);

  // Per-category chips
  CATS.forEach((cat) => {
    const count = counts[cat] ?? 0;
    if (count === 0) return;
    const btn = document.createElement('button');
    btn.className = 'kc-filter-chip' + (state.category === cat ? ' kc-active' : '');
    btn.dataset.cat = cat;
    btn.dataset.action = 'cat';
    btn.setAttribute('aria-pressed', (state.category === cat).toString());
    btn.innerHTML = `${CAT_ICONS[cat] ?? ''} ${cat} <span class="chip-count">${count}</span>`;
    catRow.appendChild(btn);
  });

  // Reset slot
  const resetWrap = document.getElementById('filter-reset-wrap');
  if (resetWrap && state.category) {
    const btn = document.createElement('button');
    btn.className = 'kc-filter-chip';
    btn.dataset.action = 'reset';
    btn.innerHTML = '✕ 清除';
    btn.setAttribute('aria-label', '清除篩選');
    resetWrap.appendChild(btn);
  }
}

// ── Event delegation ───────────────────────────────────────────────────────
function handleFilterClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'cat') {
    const cat = target.dataset.cat ?? null;
    current = { category: cat === current.category ? null : cat };
    syncToURL(current);
    applyFilter(current);
    updateChips(current);
  } else if (action === 'reset') {
    current = { category: null };
    syncToURL(current);
    applyFilter(current);
    updateChips(current);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
function initFilter() {
  // Only run on pages that have the filter bar
  if (!document.getElementById('filter-cat-chips')) return;

  current = readFromURL();
  initChips(current);
  applyFilter(current);

  document.addEventListener('click', handleFilterClick);

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    current = readFromURL();
    applyFilter(current);
    updateChips(current);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFilter);
} else {
  initFilter();
}
