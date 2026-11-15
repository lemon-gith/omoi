/**
 * A filesystem view of content/: which entries and versions exist.
 * Node-only and independent of Astro, so the markdown plugins and the
 * scripts in scripts/ can use it.
 *
 *   content/{type}/{uid}/v{version}.md   a released, frozen version
 *   content/{type}/{uid}/draft.md        the working copy (dev preview only)
 *   content/{type}/{uid}/*               any other file is an asset
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  TYPE_IDS,
  compareVersions,
  isUid,
  parseVersion,
  type TypeId,
  type Version,
} from './eid.ts';

export const CONTENT_DIR = path.resolve(process.cwd(), 'content');

export interface CatalogEntry {
  type: TypeId;
  uid: string;
  dir: string;
  /** Ascending. */
  versions: Version[];
  hasDraft: boolean;
  /** Asset paths relative to the entry directory. */
  assets: string[];
}

function walk(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.name.startsWith('.')) continue;
    if (d.isDirectory()) out.push(...walk(path.join(dir, d.name), rel));
    else out.push(rel);
  }
  return out;
}

export function scanCatalog(contentDir = CONTENT_DIR): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const type of TYPE_IDS) {
    const typeDir = path.join(contentDir, type);
    if (!fs.existsSync(typeDir)) continue;
    for (const d of fs.readdirSync(typeDir, { withFileTypes: true })) {
      if (!d.isDirectory() || !isUid(d.name)) continue;
      const dir = path.join(typeDir, d.name);
      const versions: Version[] = [];
      const assets: string[] = [];
      let hasDraft = false;
      for (const file of walk(dir)) {
        const m = /^v(.+)\.md$/.exec(file);
        const version = m ? parseVersion(m[1]) : null;
        if (version) versions.push(version);
        else if (file === 'draft.md') hasDraft = true;
        else if (!file.endsWith('.md')) assets.push(file);
      }
      versions.sort(compareVersions);
      entries.push({ type, uid: d.name, dir, versions, hasDraft, assets });
    }
  }
  return entries;
}

export function findEntry(
  catalog: CatalogEntry[],
  type: TypeId,
  uid: string,
): CatalogEntry | undefined {
  return catalog.find((e) => e.type === type && e.uid === uid);
}

/** Identity of a content file from its path, or null if it is not an entry file. */
export function identify(
  filePath: string,
  contentDir = CONTENT_DIR,
): { type: TypeId; uid: string; version: Version | null } | null {
  const rel = path.relative(contentDir, filePath).split(path.sep);
  if (rel.length !== 3) return null;
  const [type, uid, file] = rel;
  if (!TYPE_IDS.includes(type as TypeId) || !isUid(uid)) return null;
  if (file === 'draft.md') return { type: type as TypeId, uid, version: null };
  const m = /^v(.+)\.md$/.exec(file);
  const version = m ? parseVersion(m[1]) : null;
  return version ? { type: type as TypeId, uid, version } : null;
}

export function assetUrl(type: TypeId, uid: string, rel: string): string {
  return `/assets/${type}/${uid}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}
