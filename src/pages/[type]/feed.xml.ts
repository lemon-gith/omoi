import type { APIRoute, GetStaticPaths } from 'astro';
import { getSite } from '../../lib/content.ts';
import { atom } from '../../lib/feed.ts';
import { TYPES, TYPE_IDS, type TypeId } from '../../lib/eid.ts';
import { SITE } from '../../../site.config.ts';

export const getStaticPaths = (() => TYPE_IDS.map((type) => ({ params: { type } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const type = params.type as TypeId;
  const versions = (await getSite()).versions.filter((v) => v.type === type);
  return atom(versions, { title: `${SITE.title}: ${TYPES[type].plural}`, path: `/${type}/feed.xml` });
};
