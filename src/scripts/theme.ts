/**
 * theme.ts — Dark/light toggle + reduce-motion, persisted to localStorage.
 * Reads system preference on first visit, then respects user override.
 */

const STORAGE_KEY_THEME = 'kc-theme-v1';
const STORAGE_KEY_MOTION = 'kc-reduce-motion-v1';

// ── Theme ──────────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light' | 'system';

function getPreferredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('light', !prefersDark);
  } else {
    root.classList.toggle('light', theme === 'light');
  }
  // Update toggle button active state
  document.querySelectorAll<HTMLElement>('[data-theme-btn]').forEach((btn) => {
    btn.classList.toggle('kc-active', btn.dataset.themeBtn === theme);
  });
}

function cycleTheme() {
  const prev = getPreferredTheme();
  const next: Theme = prev === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(STORAGE_KEY_THEME, next); } catch { /* ignore */ }
  applyTheme(next);
}

// ── Reduce Motion ───────────────────────────────────────────────────────────
function getReduceMotion(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MOTION);
    if (stored !== null) return stored === 'true';
  } catch { /* ignore */ }
  // Default: respect system preference
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyReduceMotion(reduce: boolean) {
  document.documentElement.classList.toggle('reduce-motion', reduce);
  document.querySelectorAll<HTMLElement>('[data-motion-btn]').forEach((btn) => {
    btn.classList.toggle('kc-active', reduce);
    btn.setAttribute('aria-pressed', reduce.toString());
    btn.setAttribute('aria-label', reduce ? '停用動畫效果' : '啟用動畫效果');
    btn.textContent = reduce ? '⏸' : '▶';
  });
}

// ── Init ───────────────────────────────────────────────────────────────────
function initTheme() {
  applyTheme(getPreferredTheme());

  // System preference listener
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getPreferredTheme() === 'system') applyTheme('system');
  });

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;

    if (target.dataset.action === 'toggle-theme') {
      cycleTheme();
    } else if (target.dataset.action === 'toggle-motion') {
      const current = getReduceMotion();
      try { localStorage.setItem(STORAGE_KEY_MOTION, String(!current)); } catch { /* ignore */ }
      applyReduceMotion(!current);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// ── Separate init for reduce motion (can run immediately) ────────────────────
function initMotion() {
  applyReduceMotion(getReduceMotion());
}
initMotion();
