/**
 * Entry identifiers, versions and URL forms.
 *
 * Pure and dependency-free: used by the build, by scripts/ and by browser code.
 *
 *   eid  = `${uid}v${version}`        e.g. 5v1.2
 *   uid  = lowercase hex counter      e.g. 0, 5, 1a
 *   ver  = major[.minor[.patch]]      trailing zero components are omitted
 *
 * Reference forms accepted in a URL after `/{type}/`:
 *   5           version list
 *   5l          latest version
 *   5v1.2       exact version
 *   5v6+.2.3    newest version of all        (came from 6.2.3)
 *   5v6.2+.3    newest version within v6     (came from 6.2.3)
 *   5v6.2.3+    newest patch of v6.2         (came from 6.2.3)
 */

export const TYPES = {
  p: { full: 'post', name: 'Post', plural: 'Posts' },
  ac: { full: 'article', name: 'Article', plural: 'Articles' },
  rfc: { full: 'rfc', name: 'RFC', plural: 'RFCs' },
  wp: { full: 'whitepaper', name: 'Whitepaper', plural: 'Whitepapers' },
  yp: { full: 'yellowpaper', name: 'Yellow Paper', plural: 'Yellow Papers' },
  rp: { full: 'respaper', name: 'Research Paper', plural: 'Research Papers' },
  psa: { full: 'psa', name: 'PSA', plural: 'PSAs' },
} as const;

export type TypeId = keyof typeof TYPES;
export const TYPE_IDS = Object.keys(TYPES) as TypeId[];

/** Types that share one uid counter: the same uid is the same idea at a different stage. */
export const PAPER_FAMILY: readonly TypeId[] = ['wp', 'yp', 'rp'];

/** Accepts a short or full type name. */
export function toTypeId(name: string): TypeId | null {
  const n = name.toLowerCase();
  if (n in TYPES) return n as TypeId;
  return TYPE_IDS.find((t) => TYPES[t].full === n) ?? null;
}

/** The types whose entries count towards the uid counter of `type`. */
export function counterGroup(type: TypeId): readonly TypeId[] {
  return PAPER_FAMILY.includes(type) ? PAPER_FAMILY : [type];
}

// ---------------------------------------------------------------- uid

const UID_RE = /^(0|[1-9a-f][0-9a-f]*)$/;

export function isUid(s: string): boolean {
  return UID_RE.test(s);
}
export function uidToNumber(uid: string): number {
  return parseInt(uid, 16);
}
export function numberToUid(n: number): string {
  return n.toString(16);
}
export function nextUid(existing: Iterable<string>): string {
  let max = -1;
  for (const u of existing) max = Math.max(max, uidToNumber(u));
  return numberToUid(max + 1);
}

// ------------------------------------------------------------ version

export type Version = readonly [major: number, minor: number, patch: number];
/** 0 = major, 1 = minor, 2 = patch. */
export type Level = 0 | 1 | 2;

const NUM = '(?:0|[1-9][0-9]*)';
const VERSION_RE = new RegExp(`^(${NUM})(?:\\.(${NUM}))?(?:\\.(${NUM}))?$`);

export function parseVersion(s: string): Version | null {
  const m = VERSION_RE.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function lastSignificant(v: Version): Level {
  return v[2] !== 0 ? 2 : v[1] !== 0 ? 1 : 0;
}

/** `[3,2,0]` -> `3.2`; `[1,0,0]` -> `1`. */
export function formatVersion(v: Version): string {
  return v.slice(0, lastSignificant(v) + 1).join('.');
}

export function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function sameVersion(a: Version, b: Version): boolean {
  return compareVersions(a, b) === 0;
}

export function bumpVersion(v: Version, level: Level): Version {
  if (level === 0) return [v[0] + 1, 0, 0];
  if (level === 1) return [v[0], v[1] + 1, 0];
  return [v[0], v[1], v[2] + 1];
}

/** Which component differs first between two versions (null when equal). */
export function changeLevel(a: Version, b: Version): Level | null {
  for (const i of [0, 1, 2] as const) if (a[i] !== b[i]) return i;
  return null;
}

// -------------------------------------------------------------- float

/**
 * A floating version: the component carrying the `+` and everything below it
 * may float upwards; everything above it is fixed.
 * `[6,2,3]` at level 0 -> `6+.2.3`, level 1 -> `6.2+.3`, level 2 -> `6.2.3+`.
 * Components are written up to the `+` or the last non-zero one, whichever is
 * later, so `[1,0,0]` gives `1+`, `1.0+` and `1.0.0+`.
 */
export function formatFloat(v: Version, level: Level): string {
  const last = Math.max(lastSignificant(v), level);
  return v
    .slice(0, last + 1)
    .map((n, i) => (i === level ? `${n}+` : `${n}`))
    .join('.');
}

export function floatForms(v: Version): string[] {
  return ([0, 1, 2] as const).map((l) => formatFloat(v, l));
}

/** Newest of `versions` that a float from `from` at `level` may land on. */
export function resolveFloat(
  versions: readonly Version[],
  from: Version,
  level: Level,
): Version | null {
  const candidates = versions.filter((v) => {
    for (let i = 0; i < level; i++) if (v[i] !== from[i]) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
}

export function latestVersion(versions: readonly Version[]): Version | null {
  if (versions.length === 0) return null;
  return versions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
}

// ---------------------------------------------------------------- ref

export type Ref =
  | { kind: 'list'; uid: string }
  | { kind: 'latest'; uid: string }
  | { kind: 'exact'; uid: string; version: Version }
  | { kind: 'float'; uid: string; version: Version; level: Level };

/**
 * Parses what follows `/{type}/` in a URL. Lenient about floats: a component
 * may be empty next to its `+` (`5v6.+`) and is then read as 0.
 */
export function parseRef(s: string): Ref | null {
  s = s.toLowerCase();
  if (isUid(s)) return { kind: 'list', uid: s };
  if (s.endsWith('l') && isUid(s.slice(0, -1))) return { kind: 'latest', uid: s.slice(0, -1) };

  const at = s.indexOf('v');
  if (at < 1) return null;
  const uid = s.slice(0, at);
  const rest = s.slice(at + 1);
  if (!isUid(uid)) return null;

  if (!rest.includes('+')) {
    const version = parseVersion(rest);
    return version ? { kind: 'exact', uid, version } : null;
  }

  const parts = rest.split('.');
  if (parts.length > 3) return null;
  let level: Level | null = null;
  const nums: number[] = [];
  for (const [i, part] of parts.entries()) {
    let digits = part;
    if (part.endsWith('+')) {
      if (level !== null) return null;
      level = i as Level;
      digits = part.slice(0, -1);
      if (digits === '' && i > 0) digits = '0';
    }
    if (!new RegExp(`^${NUM}$`).test(digits)) return null;
    nums.push(Number(digits));
  }
  if (level === null) return null;
  while (nums.length < 3) nums.push(0);
  return { kind: 'float', uid, version: [nums[0], nums[1], nums[2]], level };
}

export function formatEid(uid: string, version: Version): string {
  return `${uid}v${formatVersion(version)}`;
}

/** Resolves a ref against the published versions of its entry. */
export function resolveRef(ref: Ref, versions: readonly Version[]): Version | null {
  switch (ref.kind) {
    case 'list':
      return null;
    case 'latest':
      return latestVersion(versions);
    case 'exact':
      return versions.find((v) => sameVersion(v, ref.version)) ?? null;
    case 'float':
      return resolveFloat(versions, ref.version, ref.level);
  }
}

// --------------------------------------------------------------- urls

/** Canonical path of one version: `/rfc/5v1.2/`. */
export function entryPath(type: TypeId, uid: string, version: Version): string {
  return `/${type}/${formatEid(uid, version)}/`;
}
/** Version list: `/rfc/5/`. */
export function listPath(type: TypeId, uid: string): string {
  return `/${type}/${uid}/`;
}
/** Always-latest alias: `/rfc/5l/`. */
export function latestPath(type: TypeId, uid: string): string {
  return `/${type}/${uid}l/`;
}
/** Floating share link: `/rfc/5v6+.2.3/`. */
export function floatPath(type: TypeId, uid: string, version: Version, level: Level): string {
  return `/${type}/${uid}v${formatFloat(version, level)}/`;
}
