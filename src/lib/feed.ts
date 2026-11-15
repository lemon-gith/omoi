import { SITE } from '../../site.config.ts';
import { TYPES } from './eid.ts';
import { esc } from './format.ts';
import type { EntryVersion } from './content.ts';

/**
 * An Atom feed in which every released version is an item, so a new version
 * of an old entry shows up as an update.
 */
export function atom(versions: EntryVersion[], opts: { title: string; path: string }): Response {
  const abs = (p: string) => new URL(p, SITE.url).href;
  const items = versions.slice(0, 50).map((v) => {
    const first = v === v.group.versions[0];
    const summary = first ? (v.summary ?? '') : v.changelog.join(' ');
    return `  <entry>
    <id>${abs(v.url)}</id>
    <title>${esc(v.title)}${first ? '' : ` (v${v.ver})`}</title>
    <link href="${abs(v.url)}"/>
    <updated>${v.date.toISOString()}</updated>
    <category term="${esc(TYPES[v.type].name)}"/>
${v.tags.map((t) => `    <category term="${esc(t)}"/>`).join('\n')}
    <summary>${esc(summary)}</summary>
  </entry>`;
  });
  const updated = (versions[0]?.date ?? new Date(0)).toISOString();
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${abs(opts.path)}</id>
  <title>${esc(opts.title)}</title>
  <link href="${abs(opts.path)}" rel="self"/>
  <link href="${abs('/')}"/>
  <updated>${updated}</updated>
  <author><name>${esc(SITE.author)}</name></author>
${items.join('\n')}
</feed>
`;
  return new Response(xml.replace(/\n\n+/g, '\n'), {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
}
