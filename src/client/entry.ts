/**
 * Entry pages: block highlighting from the URL, links to blocks, copy buttons.
 *
 *   ?b=1a          highlight block 1a
 *   ?b=1a-1c       blocks 1a to 1c
 *   ?b=1a:10-25    characters 10 to 25 of block 1a (an inline image counts as one)
 *   ?b=3,1a:10-25  several of the above
 */
const content = document.querySelector<HTMLElement>('#content');
const blockOf = (hex: string) => content?.querySelector<HTMLElement>(`[data-b="${hex}"]`) ?? null;

type Unit = { node: Text; from: number; to: number } | { node: Element; from: number; to: number };

/** The characters of a block in order: text, plus one unit per inline image. */
function units(block: HTMLElement): Unit[] {
  const out: Unit[] = [];
  let at = 0;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n instanceof Element) {
        if (n.matches('.b-link, .katex-mathml')) return NodeFilter.FILTER_REJECT;
        return n.matches('img, svg') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n instanceof Text ? n.data.length : 1;
    out.push({ node: n as Text, from: at, to: at + len });
    at += len;
  }
  return out;
}

function markChars(block: HTMLElement, from: number, to: number): HTMLElement | null {
  let first: HTMLElement | null = null;
  for (const u of units(block)) {
    const a = Math.max(from, u.from);
    const b = Math.min(to, u.to);
    if (a >= b) continue;
    const mark = document.createElement('mark');
    mark.className = 'hl';
    if (u.node instanceof Text) {
      const range = document.createRange();
      range.setStart(u.node, a - u.from);
      range.setEnd(u.node, b - u.from);
      range.surroundContents(mark);
    } else {
      u.node.replaceWith(mark);
      mark.append(u.node);
    }
    first ??= mark;
  }
  return first;
}

function clear() {
  content?.querySelectorAll('[data-b].hl').forEach((el) => el.classList.remove('hl'));
  content?.querySelectorAll('mark.hl').forEach((m) => {
    const parent = m.parentNode!;
    m.replaceWith(...m.childNodes);
    parent.normalize();
  });
}

function highlight(spec: string | null, scroll: boolean) {
  clear();
  if (!spec || !content) return;
  let first: HTMLElement | null = null;
  for (const part of spec.split(',')) {
    const chars = /^([0-9a-f]+):(\d+)-(\d+)$/.exec(part);
    const range = /^([0-9a-f]+)(?:-([0-9a-f]+))?$/.exec(part);
    if (chars) {
      const block = blockOf(chars[1]);
      if (block) first ??= markChars(block, Number(chars[2]), Number(chars[3])) ?? block;
    } else if (range) {
      const lo = parseInt(range[1], 16);
      const hi = range[2] ? parseInt(range[2], 16) : lo;
      for (let i = lo; i <= hi && i - lo < 500; i++) {
        const block = blockOf(i.toString(16));
        if (!block) continue;
        block.classList.add('hl');
        first ??= block;
      }
    }
  }
  if (scroll) first?.scrollIntoView({ block: 'center' });
}

highlight(new URLSearchParams(location.search).get('b'), !location.hash);

async function copy(text: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return false;
  }
  const label = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => (button.textContent = label), 1200);
  return true;
}

// ---- a "link to this block" button that follows the pointer
if (content) {
  const button = document.createElement('button');
  button.className = 'b-link';
  button.type = 'button';
  button.textContent = '#';
  button.hidden = true;
  button.title = 'Copy a link to this block (or to the selected text in it)';
  content.append(button);
  let current: HTMLElement | null = null;

  const show = (block: HTMLElement) => {
    current = block;
    const top = block.getBoundingClientRect().top - content.getBoundingClientRect().top;
    button.style.top = `${top}px`;
    button.hidden = false;
  };
  content.addEventListener('pointerover', (e) => {
    const block = (e.target as Element).closest<HTMLElement>('[data-b]');
    if (block && content.contains(block)) show(block);
  });
  content.addEventListener('focusin', (e) => {
    const block = (e.target as Element).closest<HTMLElement>('[data-b]');
    if (block && e.target !== button) show(block);
  });

  button.addEventListener('click', async () => {
    if (!current) return;
    let spec = current.dataset.b!;
    // If text inside this block is selected, link to exactly those characters.
    const sel = getSelection();
    if (sel && !sel.isCollapsed && current.contains(sel.anchorNode) && current.contains(sel.focusNode)) {
      const r = sel.getRangeAt(0);
      let from = -1;
      let to = -1;
      for (const u of units(current)) {
        if (u.node === r.startContainer) from = u.from + r.startOffset;
        if (u.node === r.endContainer) to = u.from + r.endOffset;
      }
      if (from >= 0 && to > from) spec += `:${from}-${to}`;
    }
    const url = new URL(location.href);
    url.hash = '';
    url.search = '';
    const link = `${url.href}?b=${spec}`;
    history.replaceState(null, '', link);
    getSelection()?.removeAllRanges();
    highlight(spec, false);
    await copy(link, button);
  });
}

// ---- copy buttons
for (const el of document.querySelectorAll<HTMLElement>('[data-copy]')) {
  el.hidden = false;
  el.addEventListener('click', () => {
    const source = document.querySelector(el.dataset.copy!);
    if (source) copy(source.textContent ?? '', el);
  });
}
// "Share" is a plain link without JS; with JS it copies the link instead.
for (const el of document.querySelectorAll<HTMLAnchorElement>('a[data-copy-url]')) {
  el.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!(await copy(el.href, el))) location.href = el.href;
  });
}
