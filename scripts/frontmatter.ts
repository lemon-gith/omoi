/** Minimal line-based editing of a markdown file's YAML properties. */

export function split(source: string): { head: string[]; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) throw new Error('The file has no properties block (--- ... ---) at the top.');
  return { head: m[1].split(/\r?\n/), body: source.slice(m[0].length) };
}

export function join(head: string[], body: string): string {
  return `---\n${head.join('\n')}\n---\n${body}`;
}

/** Line range [start, end) of a top-level key, including its indented or list lines. */
function range(head: string[], key: string): [number, number] | null {
  const start = head.findIndex((l) => l.startsWith(`${key}:`));
  if (start < 0) return null;
  let end = start + 1;
  while (end < head.length && /^(\s+|-\s)/.test(head[end])) end++;
  return [start, end];
}

export function has(head: string[], key: string): boolean {
  const r = range(head, key);
  if (!r) return false;
  const inline = head[r[0]].slice(key.length + 1).trim();
  return inline !== '' || r[1] - r[0] > 1;
}

export function set(head: string[], key: string, value: string): string[] {
  const r = range(head, key);
  const line = `${key}: ${value}`;
  if (!r) return [...head, line];
  return [...head.slice(0, r[0]), line, ...head.slice(r[1])];
}

export function remove(head: string[], key: string): string[] {
  const r = range(head, key);
  return r ? [...head.slice(0, r[0]), ...head.slice(r[1])] : head;
}
