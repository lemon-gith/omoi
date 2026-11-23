/**
 * Home page: turns the static "latest entries" list into a browser over every
 * entry, driven by /index/entries.json. State lives in the URL so a filtered
 * view can be linked to: /?type=rfc,wp&tag=networking&q=word&sort=old
 */
import { renderRow } from '../lib/format.ts';
import type { EntrySummary } from '../lib/content.ts';

const form = document.querySelector<HTMLFormElement>('#filters')!;
const list = document.querySelector<HTMLElement>('#list')!;
const count = document.querySelector<HTMLElement>('#count')!;
const chips = [...document.querySelectorAll<HTMLAnchorElement>('#types .chip')];
const initialList = list.outerHTML;
const initialCount = count.textContent ?? '';

let index: Promise<EntrySummary[]> | null = null;
const load = () => (index ??= fetch('/index/entries.json').then((r) => r.json()));

const params = new URLSearchParams(location.search);
const types = new Set((params.get('type') ?? '').split(',').filter(Boolean));
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
field('q').value = params.get('q') ?? '';
field('tag').value = params.get('tag') ?? '';
field('sort').value = params.get('sort') ?? 'new';
form.hidden = false;

async function update() {
  const q = field('q').value.trim().toLowerCase();
  const tag = field('tag').value;
  const sort = field('sort').value;
  for (const chip of chips) chip.setAttribute('aria-pressed', String(types.has(chip.dataset.type!)));

  const next = new URLSearchParams();
  if (types.size) next.set('type', [...types].join(','));
  if (tag) next.set('tag', tag);
  if (q) next.set('q', q);
  if (sort !== 'new') next.set('sort', sort);
  const query = next.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);

  const target = document.querySelector<HTMLElement>('#list')!;
  if (!query) {
    target.outerHTML = initialList;
    count.textContent = initialCount;
    return;
  }

  let entries: EntrySummary[];
  try {
    entries = await load();
  } catch {
    count.textContent = 'Could not load the index. Use the per-type pages instead.';
    return;
  }
  const words = q.split(/\s+/).filter(Boolean);
  const shown = entries.filter((e) => {
    if (types.size && !types.has(e.type)) return false;
    if (tag && !e.tags.includes(tag)) return false;
    const hay = `${e.title} ${e.summary ?? ''} ${e.tags.join(' ')} ${e.type}/${e.uid}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  if (sort === 'old') shown.reverse();
  if (sort === 'title') shown.sort((a, b) => a.title.localeCompare(b.title));

  count.textContent = `${shown.length} of ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.`;
  target.outerHTML = shown.length
    ? `<ul class="rows" id="list">${shown.map(renderRow).join('')}</ul>`
    : `<p class="muted" id="list">Nothing matches.</p>`;
}

for (const chip of chips) {
  chip.setAttribute('role', 'button');
  chip.addEventListener('click', (e) => {
    // Modified clicks still open the per-type page.
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const t = chip.dataset.type!;
    if (!types.delete(t)) types.add(t);
    update();
  });
}
form.addEventListener('input', update);
form.addEventListener('submit', (e) => e.preventDefault());
if (location.search) update();
