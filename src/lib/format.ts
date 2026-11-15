/** Small formatting helpers shared by the build and the browser. */
import { TYPES, type TypeId } from './eid.ts';
import type { EntrySummary } from './content.ts';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-11-15` -> `15 Nov 2026`. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function tagPath(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`;
}

/** One entry in a list. Used for server-rendered lists and by the client-side browser. */
export function renderRow(e: EntrySummary): string {
  const type = TYPES[e.type as TypeId];
  const tags = e.tags.map((t) => `<a class="tag" href="${esc(tagPath(t))}">${esc(t)}</a>`).join('');
  return (
    `<li class="row">` +
    `<a class="eid" href="${esc(e.url)}" title="${esc(type.name)}">${esc(e.type)}/${esc(e.uid)}<b>v${esc(e.v)}</b></a>` +
    `<div><a class="row-title" href="${esc(e.url)}">${esc(e.title)}</a>` +
    (e.summary ? `<p class="row-sum">${esc(e.summary)}</p>` : '') +
    `<p class="row-meta"><time datetime="${esc(e.date)}">${fmtDate(e.date)}</time>` +
    (e.kind ? `<span>${e.kind === 'research' ? 'researched' : 'thoughts'}</span>` : '') +
    `${tags}</p></div></li>`
  );
}
