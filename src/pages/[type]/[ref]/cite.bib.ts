import type { APIRoute, GetStaticPaths } from 'astro';
import { getSite, type EntryVersion } from '../../../lib/content.ts';
import { bibtex } from '../../../lib/cite.ts';

export const getStaticPaths = (async () => {
  const site = await getSite();
  return site.versions.map((v) => ({ params: { type: v.type, ref: v.eid }, props: { v } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(bibtex(props.v as EntryVersion), {
    headers: { 'Content-Type': 'application/x-bibtex; charset=utf-8' },
  });
