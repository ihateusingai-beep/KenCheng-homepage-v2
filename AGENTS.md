# kencheng-homepage-v2

Ken Cheng 教學工具導航站 v2 — **Astro 7 + Tailwind v4** rewrite。Pure static output，GitHub Pages 托管。

> **v2 status**: scaffold pass（2026-06-27）。Feature 開發 staged — 見 `~/workspace/vs code/homepage/kencheng-homepage/v2-roadmap.md`。

## 快速開始

```bash
npm install              # 一次性
npm run dev              # localhost:4321 開發模式（hot reload）
npm run build            # 產出 dist/ static HTML
npm run preview          # preview built dist/
npx astro check          # TS strict + content collection schema validate
```

無需資料庫、無需後端、無需 env 變數。

## 頁面 / 結構

| 路徑 | 說明 |
|------|------|
| `/` | 主頁 — featured + 全部 site grid（cyber dark theme） |
| `/rss.xml` | **待 A4 build** — footer link 暫時 404 |
| `/sitemap-index.xml` | **待 A4 build** — footer link 暫時 404 |
| `/404` | Astro default 404（待 V6 polish 自訂） |

**Stack 目標 vs actual**：
- Astro 7.0.3 ✅
- Tailwind v4.3.1 (via `@tailwindcss/vite` plugin) ✅
- Content Collections v6+ loader API（`glob` from `astro/loaders`）✅
- TypeScript strict mode ✅
- Astro check: **0 errors / 0 warnings / 16 hints**（Zod v3→v4 deprecation hints）

## Content collection schema

`src/content.config.ts` 定義 `sites` collection（loader: glob `.md` 喺 `src/content/sites/`）：

```ts
{
  title: string,              // 1-100 chars
  url: string,                // URL format
  category: '教學'|'AI'|'開發'|'設計'|'學習'|'其他',
  tags: string[],             // default []
  featured: boolean,          // default false
  order: number,              // 0-1000, lower = shown first, default 100
  date_added: string,         // ISO 8601 datetime
  health: 'alive'|'redirect'|'dead'|'slow'|'unverified',  // default 'unverified'
  last_checked?: string,      // ISO 8601, optional (A1 nightly writes this)
  notes?: string              // max 500 chars
}
```

每個 site 一個 `.md` file，frontmatter match schema。Astro build time 自動 Zod validate，frontmatter 寫錯會 fail build。

## Roadmap / 進度

完整 roadmap 喺 **上層目錄**：`~/workspace/vs code/homepage/kencheng-homepage/v2-roadmap.md`（同 v1 spec 同級）。

**Confirm 過嘅 6 features**（優先序）：
1. **F1** — Fuzzy + tag + regex search（⌘K palette）
2. **F2** — Site health badge + A1 nightly check 嘅 health 資料源
3. **F3** — Quick add bookmark（localStorage，無 auth）
4. **F5** — Folders / ⭐ bookmark grouping
5. **A1** — Dead link nightly GitHub Action
6. **A6** — CI smoke gate（5 invariants + Lighthouse ≥90）

**Pull-in features**（因 full SEO + self-only 自動帶入）：
- **A2** — OG image auto-gen
- **A4** — sitemap + RSS + canonical + OG meta

**Cut**：F4 / F6 / F7 / U1-U8（除 U4）/ V1-V7 individual（落入 V6 polish bundle）/ A3 / A5 / A7 / A8 / PWA

## 建構產物 baseline（2026-06-27）

| File | Size |
|------|------|
| `dist/index.html` | 7,477 B (7.3 KB) |
| `dist/_astro/index.*.css` | 10,685 B (10.4 KB) |
| `dist/favicon.svg` | 200 B |
| **Total `dist/`** | **~24 KB** |
| **JS bundle** | **0 B** |

遠低於 100KB budget。Tailwind purge 正常（utility 全部 used，無 dead CSS）。

## Gotchas（scaffold 階段發現）

- **Astro 7 breaking change**：content config 必須喺 `src/content.config.ts`（top-level）而唔係 `src/content/config.ts`，每個 collection 必須 explicit `loader: glob(...)`。v6 嘅 `type: 'content'` shorthand 已廢除。
- **Astro 7 需要 Node >=22.12.0**：CI workflow 用 `node-version: 22`（GitHub Actions 已棄用 Node 20）。本地開發可以用 22/24，唔好用 20。
- **Zod v3→v4 deprecation hints**：`z.string().url()` / `z.string().min(1).max(100)` 等仲 work 但有 hint。建議 migrate 落 `z.url()` / `z.string().min(1).max(100)` 寫法。
- **`/rss.xml` 同 `/sitemap-index.xml`** 而家 404。A4（sitemap + RSS）實作後補返。
- **GitHub Pages base path**：而家係 `/KenCheng-homepage-v2`，假設 v2 喺新 repo `KenCheng-homepage-v2`。若改放 v1 repo subdirectory `/v2/`，要改 `astro.config.mjs` 嘅 `base` field。
- **Workflow 首次 push 失敗 → fix Node 22 → 重 push → 通咗**：見 commit log。

## 部署（未 push）

- **本地 Mac only**，冇 push 到 GitHub
- `.github/workflows/deploy.yml` 已寫好（用 `actions/deploy-pages@v4` + `withastro/action@v3`）
- 要 push 嘅時候先 `git init` + 創 GitHub repo + 啟用 Pages，workflow 自動跑

## 安全 / 私隱

- 純 static，無 backend、無 API key、無 secrets
- 所有 OG / canonical / RSS path 由 Astro build time 生成，無 runtime injection
- Frontmatter URL 由 Zod `z.string().url()` validate，唔合法直接 fail build
- Quick-add (F3) 會 reject `javascript:` / `data:` URL（XSS 防）

## 待 user push 嘅決定

- **v2 嘅 GitHub repo**：用新 `KenCheng-homepage-v2` 定 subdirectory 放 v1 repo？
- **v1 退役時間**：v2 feature-complete 後 v1 點處理（archive branch / redirect / 直接 410）？
- **OG image default**：v2 launch 時 site 本身嘅 OG image（而家 favicon 個 K 字）想換咩？