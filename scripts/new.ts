/**
 * Starts a new entry as a draft.
 *
 *   npm run new -- <type> <short-name> ["Title"] [--uid <uid>]
 *
 * The uid is the next free one for the type. wp, yp and rp share a counter;
 * pass --uid to add another stage of an existing paper (e.g. the rp for wp/5).
 */
import fs from 'node:fs';
import path from 'node:path';
import { TYPES, counterGroup, isUid, nextUid, toTypeId } from '../src/lib/eid.ts';
import { CONTENT_DIR, scanCatalog } from '../src/lib/catalog.ts';

const args = process.argv.slice(2);
const uidAt = args.indexOf('--uid');
const forcedUid = uidAt >= 0 ? args.splice(uidAt, 2)[1] : undefined;
const [typeArg, shortName, title = 'Untitled'] = args;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const type = typeArg ? toTypeId(typeArg) : null;
if (!type || !shortName) {
  die(`Usage: npm run new -- <type> <short-name> ["Title"] [--uid <uid>]\nTypes: ${Object.keys(TYPES).join(', ')}`);
}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(shortName)) die('short-name must be lowercase words joined by hyphens.');
if (forcedUid !== undefined && !isUid(forcedUid)) die(`"${forcedUid}" is not a uid (lowercase hex).`);

const catalog = scanCatalog();
const group = counterGroup(type);
const uid = forcedUid ?? nextUid(catalog.filter((e) => group.includes(e.type)).map((e) => e.uid));
const dir = path.join(CONTENT_DIR, type, uid);
const file = path.join(dir, 'draft.md');
if (fs.existsSync(dir)) die(`${type}/${uid} already exists.`);

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  file,
  `---
title: ${JSON.stringify(title)}
short-name: ${shortName}
date: ${new Date().toISOString().slice(0, 10)}
summary:
tags: []
---

`,
);
console.log(`Created ${path.relative(process.cwd(), file)}`);
console.log(`Preview: npm run dev, then open /${type}/${uid}/draft/`);
console.log(`Release: npm run release -- ${type}/${uid}`);
