/** Serves the non-markdown files stored next to entries: /assets/{type}/{uid}/{file}. */
import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute, GetStaticPaths } from 'astro';
import { scanCatalog } from '../../lib/catalog.ts';

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', pdf: 'application/pdf', mp4: 'video/mp4',
  webm: 'video/webm', json: 'application/json', csv: 'text/csv', txt: 'text/plain', bib: 'application/x-bibtex',
};

export const getStaticPaths = (() =>
  scanCatalog().flatMap((e) =>
    e.assets.map((rel) => ({
      params: { path: `${e.type}/${e.uid}/${rel}` },
      props: { file: path.join(e.dir, rel) },
    })),
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const ext = path.extname(props.file).slice(1).toLowerCase();
  return new Response(fs.readFileSync(props.file), {
    headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream' },
  });
};
