/** Full-text search over the built pages, using the Pagefind index made after the build. */
import { esc } from '../lib/format.ts';

const form = document.querySelector<HTMLFormElement>('#search')!;
const status = document.querySelector<HTMLElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
const q = form.elements.namedItem('q') as HTMLInputElement;
const type = form.elements.namedItem('type') as HTMLSelectElement;

let pagefind: any;
async function engine() {
  if (pagefind) return pagefind;
  const path = '/pagefind/pagefind.js';
  pagefind = await import(/* @vite-ignore */ path);
  await pagefind.options({ excerptLength: 28 });
  return pagefind;
}

let run = 0;
async function search() {
  const term = q.value.trim();
  const next = new URLSearchParams();
  if (term) next.set('q', term);
  if (type.value) next.set('type', type.value);
  history.replaceState(null, '', next.size ? `?${next}` : location.pathname);
  if (!term) {
    results.innerHTML = '';
    status.textContent = '';
    return;
  }
  const mine = ++run;
  let pf;
  try {
    pf = await engine();
  } catch {
    status.textContent = 'The search index is not available (it is built by "npm run build", not by the dev server).';
    return;
  }
  const found = await pf.debouncedSearch(term, type.value ? { filters: { type: type.value } } : {});
  if (!found || mine !== run) return;
  const pages = await Promise.all(found.results.slice(0, 30).map((r: any) => r.data()));
  if (mine !== run) return;
  status.textContent = `${found.results.length} ${found.results.length === 1 ? 'result' : 'results'}.`;
  results.innerHTML = pages
    .map((p: any) => {
      const id = /^\/([a-z]+)\/([0-9a-f]+)v([\d.]+)\/$/.exec(p.url);
      const eid = id ? `<a class="eid" href="${esc(p.url)}">${id[1]}/${id[2]}<b>v${id[3]}</b></a>` : '<span></span>';
      return (
        `<li class="row result">${eid}<div>` +
        `<a class="row-title" href="${esc(p.url)}">${esc(p.meta?.title ?? p.url)}</a>` +
        `<p class="row-sum">${p.excerpt}</p></div></li>`
      );
    })
    .join('');
}

const params = new URLSearchParams(location.search);
q.value = params.get('q') ?? '';
type.value = params.get('type') ?? '';
form.addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});
form.addEventListener('input', search);
if (q.value) search();
