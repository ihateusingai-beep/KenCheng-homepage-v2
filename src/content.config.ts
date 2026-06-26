// Content collection schema for sites — Zod validation
// Astro 7+: must live at src/content.config.ts (top-level, NOT src/content/config.ts)
// and each collection needs a `loader` (no more `type: 'content'` shorthand).
// See: https://docs.astro.build/en/guides/upgrade-to/v6/#removed-legacy-content-collections
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const sites = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sites' }),
  schema: z.object({
    title: z.string().min(1).max(100),
    url: z.string().url(),
    category: z.enum(['教學', 'AI', '開發', '設計', '學習', '其他']),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    // Lower order = shown first. Tie-break by date_added desc.
    order: z.number().int().min(0).max(1000).default(100),
    date_added: z.string().datetime(),
    // A1 nightly check writes this; default 'unverified' until first run.
    health: z.enum(['alive', 'redirect', 'dead', 'slow', 'unverified']).default('unverified'),
    last_checked: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
  }),
});

export const collections = { sites };