// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://ihateusingai-beep.github.io/KenCheng-homepage-v2',
  base: '/KenCheng-homepage-v2',
  output: 'static',
  trailingSlash: 'always',
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap({
      // Site URL + base path — sitemap-index.xml at /sitemap-index.xml
      // Individual sitemaps: /sitemap-0.xml (sites), etc.
      filter: (page) => page.includes('/KenCheng-homepage-v2/'),
    }),
  ],
});