import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { remarkObsidian } from './src/lib/markdown/remark-obsidian.ts';
import { rehypeBlocks } from './src/lib/markdown/rehype-blocks.ts';
import { SITE } from './site.config.ts';

export default defineConfig({
  site: SITE.url,
  // Pages are directories (GitHub Pages adds the slash); file-like URLs such as
  // /assets/.../figure.svg and /feed.xml have none, so both must route in dev.
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkObsidian, remarkMath],
      // rehype-raw first, so inline HTML is real elements by the time blocks are numbered.
      rehypePlugins: [rehypeRaw, rehypeKatex, rehypeBlocks],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
