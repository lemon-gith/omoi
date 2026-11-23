/**
 * The site's content model, built once per build from the `entries` collection:
 * every version of every entry, grouped, validated and cross-linked.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import {
  PAPER_FAMILY,
  TYPE_IDS,
  compareVersions,
  entryPath,
  formatEid,
  formatVersion,
  isUid,
  parseVersion,
  resolveRef,
  type TypeId,
  type Version,
} from './eid.ts';
import { findWikilinks, parseTarget } from './wikilink.ts';

export interface EntryVersion {
  type: TypeId;
  uid: string;
  version: Version;
  /** `1.2` */
  ver: string;
  /** `5v1.2` */
  eid: string;
  /** `rfc/5v1.2` */
  key: string;
  /** `/rfc/5v1.2/` */
  url: string;
  title: string;
  shortName: string;
  date: Date;
  summary?: string;
  tags: string[];
  changelog: string[];
  kind?: 'white' | 'research';
  authors?: string[];
  body: string;
  entry: CollectionEntry<'entries'>;
  group: EntryGroup;
}

export interface EntryGroup {
  type: TypeId;
  uid: string;
  /** `rfc/5` */
  key: string;
  /** Ascending. */
  versions: EntryVersion[];
  latest: EntryVersion;
  /** Unreleased working copy; only present under `astro dev`. */
  draft?: CollectionEntry<'entries'>;
}

export interface Backlink {
  from: EntryVersion;
  /** The version of the target that `from` points at; null for latest/floating links. */
  to: Version | null;
}

export interface Site {
  groups: EntryGroup[];
  /** Every version, newest release first. */
  versions: EntryVersion[];
  /** The latest version of every entry, newest release first. */
  latest: EntryVersion[];
  group(type: TypeId, uid: string): EntryGroup | undefined;
  /** Tag -> latest versions carrying it. */
  tags: Map<string, EntryVersion[]>;
  /** Outgoing entry links per version key. */
  links: Map<string, { key: string; to: Version | null }[]>;
  backlinks(group: EntryGroup): Backlink[];
  related(group: EntryGroup): EntryVersion[];
  /** Same uid at other stages of the paper family. */
  family(group: EntryGroup): EntryGroup[];
}

const byDateDesc = (a: EntryVersion, b: EntryVersion) =>
  b.date.getTime() - a.date.getTime() || a.key.localeCompare(b.key);

async function build(): Promise<Site> {
  const raw = await getCollection('entries');
  const groupMap = new Map<string, EntryGroup>();

  for (const entry of raw) {
    const [type, uid, file] = entry.id.split('/') as [TypeId, string, string];
    if (!TYPE_IDS.includes(type) || !isUid(uid ?? '')) {
      throw new Error(`content/${entry.id}.md: expected content/{type}/{uid}/v{version}.md`);
    }
    const key = `${type}/${uid}`;
    let group = groupMap.get(key);
    if (!group) {
      group = { type, uid, key, versions: [], latest: undefined as never };
      groupMap.set(key, group);
    }
    if (file === 'draft') {
      group.draft = entry;
      continue;
    }
    const version = parseVersion(file.slice(1));
    if (!version) throw new Error(`content/${entry.id}.md: "${file}" is not a version like v1 or v1.2.3`);
    if (file.slice(1) !== formatVersion(version)) {
      throw new Error(
        `content/${entry.id}.md: write the version without trailing zeros (v${formatVersion(version)}.md)`,
      );
    }
    const d = entry.data;
    group.versions.push({
      type,
      uid,
      version,
      ver: formatVersion(version),
      eid: formatEid(uid, version),
      key: `${type}/${formatEid(uid, version)}`,
      url: entryPath(type, uid, version),
      title: d.title,
      shortName: d['short-name'],
      date: d.date,
      summary: d.summary,
      tags: d.tags,
      changelog: d.changelog,
      kind: d.kind,
      authors: d.authors,
      body: entry.body ?? '',
      entry,
      group,
    });
  }

  const groups = [...groupMap.values()].filter((g) => g.versions.length > 0);
  for (const g of groups) {
    g.versions.sort((a, b) => compareVersions(a.version, b.version));
    g.latest = g.versions[g.versions.length - 1];
    for (const v of g.versions.slice(1)) {
      if (v.changelog.length === 0) {
        throw new Error(`content/${v.entry.id}.md: add a "changelog" property saying what changed`);
      }
    }
  }
  groups.sort((a, b) => a.type.localeCompare(b.type) || parseInt(a.uid, 16) - parseInt(b.uid, 16));

  const versions = groups.flatMap((g) => g.versions).sort(byDateDesc);
  const latest = groups.map((g) => g.latest).sort(byDateDesc);

  const tags = new Map<string, EntryVersion[]>();
  for (const v of latest) {
    for (const t of v.tags) tags.set(t, [...(tags.get(t) ?? []), v]);
  }

  // Link graph, read from the wikilinks in each body.
  const links = new Map<string, { key: string; to: Version | null }[]>();
  const incoming = new Map<string, Backlink[]>();
  for (const v of versions) {
    const out: { key: string; to: Version | null }[] = [];
    for (const link of findWikilinks(v.body)) {
      if (link.embed) continue;
      const target = parseTarget(link.path);
      if (target.kind !== 'entry') continue;
      const key = `${target.type}/${target.ref.uid}`;
      const g = groupMap.get(key);
      if (!g || g === v.group) continue;
      const to = target.ref.kind === 'exact' ? resolveRef(target.ref, g.versions.map((x) => x.version)) : null;
      if (out.some((o) => o.key === key)) continue;
      out.push({ key, to });
      incoming.set(key, [...(incoming.get(key) ?? []), { from: v, to }]);
    }
    links.set(v.key, out);
  }

  return {
    groups,
    versions,
    latest,
    tags,
    links,
    group: (type, uid) => {
      const g = groupMap.get(`${type}/${uid}`);
      return g && g.versions.length > 0 ? g : undefined;
    },
    backlinks(group) {
      // One line per linking entry: its newest version that links here.
      const best = new Map<string, Backlink>();
      for (const b of incoming.get(group.key) ?? []) {
        const seen = best.get(b.from.group.key);
        if (!seen || compareVersions(b.from.version, seen.from.version) > 0) best.set(b.from.group.key, b);
      }
      return [...best.values()].sort((a, b) => byDateDesc(a.from, b.from));
    },
    related(group) {
      const mine = new Set(group.latest.tags);
      return latest
        .filter((v) => v.group !== group)
        .map((v) => ({ v, score: v.tags.filter((t) => mine.has(t)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || byDateDesc(a.v, b.v))
        .slice(0, 5)
        .map((x) => x.v);
    },
    family(group) {
      if (!PAPER_FAMILY.includes(group.type)) return [];
      return PAPER_FAMILY.filter((t) => t !== group.type)
        .map((t) => groupMap.get(`${t}/${group.uid}`))
        .filter((g): g is EntryGroup => !!g && g.versions.length > 0);
    },
  };
}

let site: Promise<Site> | null = null;
/** Cached per build; rebuilt on every request under `astro dev`. */
export function getSite(): Promise<Site> {
  if (import.meta.env.DEV) return build();
  return (site ??= build());
}

/** The JSON shape used by the client-side indices. */
export function summarise(v: EntryVersion) {
  return {
    type: v.type,
    uid: v.uid,
    v: v.ver,
    url: v.url,
    title: v.title,
    short: v.shortName,
    date: v.date.toISOString().slice(0, 10),
    summary: v.summary ?? null,
    tags: v.tags,
    kind: v.kind ?? null,
    versions: v.group.versions.length,
  };
}
export type EntrySummary = ReturnType<typeof summarise>;
