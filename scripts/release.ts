/**
 * Freezes an entry's draft.md as a new version.
 *
 *   npm run release -- <type>/<uid> [major|minor|patch]
 *
 * The first release is always v1. Later releases need the level and a
 * `changelog` property in the draft.
 *
 * Released versions never change, so links to other entries have to say which
 * version they mean: every unversioned [[type/uid]] link in the draft is
 * pinned to the target's current latest version in the released copy.
 * A link written as [[type/uidl]] is left alone and always follows the latest.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  bumpVersion,
  formatVersion,
  latestVersion,
  toTypeId,
  type Level,
  type Version,
} from '../src/lib/eid.ts';
import { findEntry, scanCatalog } from '../src/lib/catalog.ts';
import { WIKILINK_RE, parseTarget, parseWikilink, stripCode } from '../src/lib/wikilink.ts';
import * as fm from './frontmatter.ts';

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const [target, levelArg] = process.argv.slice(2);
const [typeArg, uid] = (target ?? '').split('/');
const type = typeArg ? toTypeId(typeArg) : null;
if (!type || !uid) die('Usage: npm run release -- <type>/<uid> [major|minor|patch]');

const catalog = scanCatalog();
const entry = findEntry(catalog, type, uid);
if (!entry) die(`${type}/${uid} does not exist.`);
if (!entry.hasDraft) die(`${type}/${uid} has no draft.md to release.`);

const latest = latestVersion(entry.versions);
let version: Version;
if (!latest) {
  version = [1, 0, 0];
} else {
  const level = ['major', 'minor', 'patch'].indexOf(levelArg ?? '');
  if (level < 0) {
    die(`${type}/${uid} is at v${formatVersion(latest)}. Say what kind of change this is: major, minor or patch.`);
  }
  version = bumpVersion(latest, level as Level);
}

const draftFile = path.join(entry.dir, 'draft.md');
const { head, body } = fm.split(fs.readFileSync(draftFile, 'utf8'));
if (latest && !fm.has(head, 'changelog')) {
  die('Add a "changelog" property to draft.md saying what changed since ' + `v${formatVersion(latest)}.`);
}

// Pin unversioned links. stripCode keeps offsets, so matches map onto `body`.
const pinned: string[] = [];
let out = '';
let at = 0;
for (const m of stripCode(body).matchAll(WIKILINK_RE)) {
  const link = parseWikilink(m[0]);
  if (!link || link.embed) continue;
  const t = parseTarget(link.path);
  if (t.kind !== 'entry' || t.ref.kind !== 'list') continue;
  const other = findEntry(catalog, t.type, t.ref.uid);
  const otherLatest = other && latestVersion(other.versions);
  if (!otherLatest) die(`${m[0]} points at ${t.type}/${t.ref.uid}, which has no released version yet.`);
  const replacement =
    `[[${t.type}/${t.ref.uid}/v${formatVersion(otherLatest)}` +
    (link.anchor ? `#${link.anchor}` : '') +
    (link.alias ? `|${link.alias}` : '') +
    ']]';
  out += body.slice(at, m.index) + replacement;
  at = m.index + m[0].length;
  pinned.push(`${m[0]} -> ${replacement}`);
}
out += body.slice(at);

const today = new Date().toISOString().slice(0, 10);
const file = path.join(entry.dir, `v${formatVersion(version)}.md`);
fs.writeFileSync(file, fm.join(fm.set(head, 'date', today), out), { flag: 'wx' });
// The draft carries on as the working copy for the next version.
fs.writeFileSync(draftFile, fm.join(fm.remove(head, 'changelog'), body));

console.log(`Released ${type}/${uid}v${formatVersion(version)} -> ${path.relative(process.cwd(), file)}`);
for (const p of pinned) console.log(`  pinned ${p}`);
console.log('Commit the new file. Run "npm run build" to check it.');
