/**
 * Obsidian wikilink parsing. Pure: shared by the markdown pipeline, the link
 * graph and scripts/release.ts.
 *
 *   [[rfc/5/v1.2]]            exact version (path of the file in content/)
 *   [[rfc/5v1.2]]             same, written as an eid
 *   [[rfc/5l]]                always the latest version
 *   [[rfc/5v2+.1]]            floating version
 *   [[rfc/5]]                 unversioned: only legal in drafts; pinned on release
 *   [[rfc/5/v1.2#Heading]]    heading anchor
 *   [[rfc/5/v1.2#^label]]     block anchor
 *   [[#Heading]] [[#^label]]  same page
 *   [[target|shown text]]     alias
 *   ![[figure.png|300]]       embed, optional width or WIDTHxHEIGHT
 */
import { parseRef, parseVersion, toTypeId, isUid, type Ref, type TypeId } from './eid.ts';

export interface Wikilink {
  embed: boolean;
  /** Text before `#` and `|`. */
  path: string;
  /** Text after `#`, without the `#`. */
  anchor: string | null;
  /** Text after `|`. */
  alias: string | null;
  /** The full source text, e.g. `[[rfc/5|that RFC]]`. */
  raw: string;
}

export const WIKILINK_RE = /(!?)\[\[([^\[\]\n]+?)\]\]/g;

export function parseWikilink(raw: string): Wikilink | null {
  const m = /^(!?)\[\[([^\[\]\n]+?)\]\]$/.exec(raw);
  if (!m) return null;
  let inner = m[2];
  let alias: string | null = null;
  // Obsidian writes `\|` for the alias separator inside tables.
  const bar = inner.search(/\\?\|/);
  if (bar >= 0) {
    alias = inner.slice(inner.indexOf('|', bar) + 1).trim();
    inner = inner.slice(0, bar);
  }
  let anchor: string | null = null;
  const hash = inner.indexOf('#');
  if (hash >= 0) {
    anchor = inner.slice(hash + 1).trim();
    inner = inner.slice(0, hash);
  }
  return { embed: m[1] === '!', path: inner.trim(), anchor, alias, raw };
}

export type Target =
  | { kind: 'self' }
  | { kind: 'entry'; type: TypeId; ref: Ref }
  | { kind: 'file'; path: string };

/**
 * Classifies the path part of a wikilink (or of a relative `.md` link).
 * Anything that is not an entry reference is treated as a file path.
 */
export function parseTarget(path: string): Target {
  if (path === '') return { kind: 'self' };
  const clean = path.replace(/^\/+/, '').replace(/\.md$/i, '');
  const parts = clean.split('/');
  const type = toTypeId(parts[0]);
  if (type) {
    if (parts.length === 2) {
      const ref = parseRef(parts[1]);
      if (ref) return { kind: 'entry', type, ref };
    }
    if (parts.length === 3 && isUid(parts[1].toLowerCase())) {
      const uid = parts[1].toLowerCase();
      const v = /^v(.+)$/i.exec(parts[2]);
      const version = v ? parseVersion(v[1]) : null;
      if (version) return { kind: 'entry', type, ref: { kind: 'exact', uid, version } };
      if (parts[2].toLowerCase() === 'draft') return { kind: 'entry', type, ref: { kind: 'list', uid } };
    }
  }
  return { kind: 'file', path };
}

/** Removes code so that wikilink-looking text inside it is ignored. */
export function stripCode(markdown: string): string {
  return markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

/** All wikilinks in a markdown body, ignoring code. */
export function findWikilinks(markdown: string): Wikilink[] {
  const out: Wikilink[] = [];
  for (const m of stripCode(markdown).matchAll(WIKILINK_RE)) {
    const link = parseWikilink(m[0]);
    if (link) out.push(link);
  }
  return out;
}
