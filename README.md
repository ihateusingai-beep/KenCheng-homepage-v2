# Ken Cheng 教學工具導航站 v2

> **Official project** — replaces [kencheng-homepage](https://github.com/ihateusingai-beep/kencheng-homepage)（2026-06-28 soft-deprecated，5 秒後自動跳轉到 v2 URL）

**Live:** https://ihateusingai-beep.github.io/KenCheng-homepage-v2/

## Stack

Astro 7 + Tailwind v4 + TypeScript。Pure static output，deployed on GitHub Pages via `.github/workflows/deploy.yml`。

## Quick start

```bash
npm install              # one-time
npm run dev              # localhost:4321 (hot reload)
npm run build            # output dist/ static HTML
npx astro check          # TS strict + content collection schema validate
```

無需資料庫、無需後端、無需 env 變數。

## Pages

| 路徑 | 說明 |
|------|------|
| `/` | 主頁 — featured + 全部 site grid（cyber dark theme） |
| `/rss.xml` | Auto-generated RSS feed |
| `/sitemap-index.xml` | Auto-generated sitemap |
| `/404` | Astro default 404 |

## Features（V0-V6）

- ✅ **F0** Scaffold — Astro 7 + Tailwind v4 + content collections
- ✅ **F1** ⌘K command palette — fuzzy search + tag filter + keyboard nav (↑↓ Enter Esc)
- ✅ **V6 polish** — Card hover (lift + cyan glow + cat-hue) · Featured badge · KPI hero tiles · Cat hue system · Focus a11y · Mobile bottom sheet

**Confirmed for v2 launch**: F2 (site health badge + A1 nightly check) · F3 (quick-add bookmark) · F5 (folders / ⭐ grouping) · A1 (dead link nightly GH Action) · A6 (CI smoke gate)

## Content collection schema

`src/content.config.ts` 定義 `sites` collection（loader: glob `.md` 喺 `src/content/sites/`）。

每個 site 一個 `.md` file，frontmatter match schema。Astro build time 自動 Zod validate。

```ts
{
  title: string,              // 1-100 chars
  url: string,                // URL format
  category: '教學'|'AI'|'開發'|'設計'|'學習'|'其他',
  tags: string[],             // default []
  featured: boolean,          // default false
  order: number,              // 0-1000, lower = shown first
  date_added: string,         // ISO 8601
  health: 'alive'|'redirect'|'dead'|'slow'|'unverified',
  last_checked?: string,
  notes?: string              // max 500 chars
}
```

## 建構產物 baseline（2026-06-28, V6 polish）

| File | Size |
|------|------|
| `dist/index.html` | 9.5 KB |
| `dist/_astro/index.*.css` | 21.7 KB |
| `dist/favicon.svg` | 200 B |
| **Total `dist/`** | **~31 KB** |
| **JS bundle** | **~2 KB** (F1 palette client only) |

遠低於 100KB budget。

## 部署

- Push `main` → `.github/workflows/deploy.yml` 自動跑 → GitHub Pages live
- Astro `base: '/KenCheng-homepage-v2'` subpath

## 安全 / 私隱

- 純 static，無 backend、無 API key、無 secrets
- OG / canonical / RSS path 由 Astro build time 生成
- Frontmatter URL 由 Zod `z.string().url()` validate
- Quick-add (F3) 會 reject `javascript:` / `data:` URL（XSS 防）

---

Original v1 repo: https://github.com/ihateusingai-beep/kencheng-homepage (deprecated)