/**
 * F3 — Bookmark quick-add storage layer.
 *
 * All bookmarks stored in localStorage under KEY.
 * Each entry: { id, url, title?, category, tags, addedAt }
 *
 * XSS protection: reject javascript: / data: URLs at write time.
 */

const KEY = 'kc-v2-bookmarks';

export interface Bookmark {
  id: string;
  url: string;
  /** User-provided title; falls back to hostname for display. */
  title?: string;
  category: string;
  tags: string[];
  addedAt: number; // Date.now()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    // Reject javascript: / data: / vbscript: etc.
    const scheme = u.protocol.toLowerCase();
    return (
      (scheme === 'http:' || scheme === 'https:') &&
      !['javascript', 'data', 'vbscript', 'blob', 'file'].includes(u.protocol.replace(/:$/, ''))
    );
  } catch {
    return false;
  }
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ── Storage ─────────────────────────────────────────────────────────────────

export function readAll(): Bookmark[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Bookmark[];
  } catch {
    return [];
  }
}

export function saveAll(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bookmarks));
  } catch {
    // localStorage full — silently drop (extremely rare)
  }
}

/**
 * Add a new bookmark. Returns the created bookmark, or null if URL is invalid / duplicate.
 */
export function add(rawUrl: string, opts: { title?: string; category?: string; tags?: string[] } = {}): Bookmark | null {
  if (!isValidUrl(rawUrl)) return null;

  const url = rawUrl.trim();
  const existing = readAll();

  // Dedupe by URL
  if (existing.some((b) => b.url === url)) return null;

  const bookmark: Bookmark = {
    id: makeId(),
    url,
    title: opts.title?.trim() || undefined,
    category: opts.category ?? '其他',
    tags: opts.tags ?? [],
    addedAt: Date.now(),
  };

  existing.unshift(bookmark); // newest first
  saveAll(existing);
  return bookmark;
}

/** Remove bookmark by id. Returns true if found and removed. */
export function remove(id: string): boolean {
  const existing = readAll();
  const idx = existing.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  existing.splice(idx, 1);
  saveAll(existing);
  return true;
}

/** Update title / category / tags for a given id. */
export function update(id: string, patch: Partial<Pick<Bookmark, 'title' | 'category' | 'tags'>>): boolean {
  const existing = readAll();
  const target = existing.find((b) => b.id === id);
  if (!target) return false;
  Object.assign(target, patch);
  saveAll(existing);
  return true;
}

/** Export all bookmarks as a JSON string for download. */
export function exportJson(): string {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    bookmarks: readAll(),
  };
  return JSON.stringify(data, null, 2);
}

/** Import from a JSON string (as from export). Merges, skips duplicates by URL. */
export function importJson(json: string): { added: number; skipped: number } {
  let parsed: { bookmarks?: Bookmark[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    return { added: 0, skipped: 0 };
  }

  const incoming = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
  const existing = readAll();
  const existingUrls = new Set(existing.map((b) => b.url));

  let added = 0;
  for (const b of incoming) {
    if (!isValidUrl(b.url) || existingUrls.has(b.url)) continue;
    existing.unshift({
      id: makeId(),
      url: b.url,
      title: b.title,
      category: b.category ?? '其他',
      tags: b.tags ?? [],
      addedAt: b.addedAt ?? Date.now(),
    });
    existingUrls.add(b.url);
    added++;
  }

  saveAll(existing);
  return { added, skipped: incoming.length - added };
}

/** Convenience — display name for a bookmark (title or hostname). */
export function displayName(b: Bookmark): string {
  return b.title || hostnameOf(b.url);
}
