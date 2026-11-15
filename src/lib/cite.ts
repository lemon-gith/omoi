import { SITE } from '../../site.config.ts';
import { TYPES } from './eid.ts';
import type { EntryVersion } from './content.ts';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function tex(s: string): string {
  return s.replace(/([&%$#_{}])/g, '\\$1');
}

/** A BibTeX record for one exact version, citing its permanent URL. */
export function bibtex(v: EntryVersion): string {
  const authors = v.authors?.length ? v.authors : [SITE.author];
  const url = new URL(v.url, SITE.url).href;
  const fields: [string, string][] = [
    ['author', `{${authors.map(tex).join(' and ')}}`],
    ['title', `{{${tex(v.title)}}}`],
    ['year', `{${v.date.getUTCFullYear()}}`],
    ['month', MONTHS[v.date.getUTCMonth()]],
    ['howpublished', `{${tex(`${SITE.title} ${TYPES[v.type].name} ${v.uid}`)}}`],
    ['version', `{${v.ver}}`],
    ['url', `{${url}}`],
  ];
  const width = Math.max(...fields.map(([k]) => k.length));
  return (
    `@misc{${SITE.title}-${v.type}-${v.eid},\n` +
    fields.map(([k, val]) => `  ${k.padEnd(width)} = ${val},`).join('\n') +
    '\n}\n'
  );
}
