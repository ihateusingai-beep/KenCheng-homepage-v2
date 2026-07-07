// RSS feed — F4 (sitemap + RSS auto-gen).
// Outputs at build time to /KenCheng-homepage-v2/rss.xml
// Uses @astrojs/rss (already in package.json).
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const sites = await getCollection('sites');

  // Sort by date_added desc — newest first
  const sorted = sites
    .filter((s) => s.data.date_added)
    .sort((a, b) => {
      const da = new Date(a.data.date_added).getTime();
      const db = new Date(b.data.date_added).getTime();
      return db - da;
    });

  return rss({
    title: 'Ken Cheng — 教學工具導航站',
    description:
      'Ken Cheng 嘅教學工具、AI 應用、開發工具 curated 目錄。每個工具都係實測好用先收錄。',
    site: context.site ?? 'https://ihateusingai-beep.github.io/KenCheng-homepage-v2',
    customData: `<language>zh-Hant</language>`,
    items: sorted.map((site) => ({
      title: site.data.title,
      pubDate: new Date(site.data.date_added),
      description: site.body ?? '',
      link: site.data.url,
      categories: [site.data.category, ...site.data.tags],
    })),
    // No trailing slash on feed itself
    trailingSlash: false,
  });
}
