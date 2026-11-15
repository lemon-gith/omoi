import type { APIRoute } from 'astro';
import { getSite } from '../lib/content.ts';
import { atom } from '../lib/feed.ts';
import { SITE } from '../../site.config.ts';

export const GET: APIRoute = async () =>
  atom((await getSite()).versions, { title: SITE.title, path: '/feed.xml' });
