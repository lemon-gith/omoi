/**
 * The indices that make the static site feel dynamic. Compiled at build time,
 * fetched by the browser on demand.
 *
 *   /index/entries.json   latest version of every entry, newest first
 *   /index/versions.json  { type: { uid: [versions, ascending] } }
 *   /index/tags.json      { tag: ["type/uid", ...] }
 *   /index/links.json     { "type/eid": ["type/uid" or "type/eid", ...] } outgoing links
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getSite, summarise, type Site } from '../../lib/content.ts';
import { formatEid } from '../../lib/eid.ts';

const INDICES: Record<string, (site: Site) => unknown> = {
  entries: (site) => site.latest.map(summarise),
  versions: (site) => {
    const out: Record<string, Record<string, string[]>> = {};
    for (const g of site.groups) (out[g.type] ??= {})[g.uid] = g.versions.map((v) => v.ver);
    return out;
  },
  tags: (site) =>
    Object.fromEntries([...site.tags].sort().map(([tag, vs]) => [tag, vs.map((v) => v.group.key)])),
  links: (site) =>
    Object.fromEntries(
      [...site.links]
        .filter(([, out]) => out.length > 0)
        .sort()
        .map(([key, out]) => [
          key,
          out.map((o) => (o.to ? `${o.key.split('/')[0]}/${formatEid(o.key.split('/')[1], o.to)}` : o.key)),
        ]),
    ),
};

export const getStaticPaths = (() =>
  Object.keys(INDICES).map((name) => ({ params: { name } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => Response.json(INDICES[params.name!](await getSite()));
