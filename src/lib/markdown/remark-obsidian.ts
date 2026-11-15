/**
 * Obsidian-flavoured markdown on top of CommonMark + GFM:
 *
 *   [[wikilinks]] and ![[embeds|300]]     resolved against content/
 *   > [!TYPE] Title                        callouts (any type name; +/- to fold)
 *   paragraph text ^label                  block labels (anchors)
 *   ![alt|300](image.png)                  image sizing
 *   ==highlight==   %%comment%%
 *   [text](../5/v1.md)                     relative links between entries
 *
 * A link that cannot be resolved fails the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, PhrasingContent, Paragraph, Blockquote, Text, Parent, Nodes } from 'mdast';
import type { VFile } from 'vfile';
// Adds hName / hProperties to mdast node data.
import type {} from 'mdast-util-to-hast';
import {
  entryPath,
  floatPath,
  formatVersion,
  latestPath,
  listPath,
  resolveRef,
  latestVersion,
  type TypeId,
  type Version,
} from '../eid.ts';
import { assetUrl, findEntry, identify, scanCatalog, type CatalogEntry } from '../catalog.ts';
import { parseTarget, parseWikilink, type Wikilink } from '../wikilink.ts';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const INLINE_RE = /(!?\[\[[^\[\]\n]+?\]\])|==([^=\n]+?)==|%%[\s\S]*?%%/g;
const LABEL_RE = /(?:^|\s)\^([A-Za-z0-9-]+)$/;
const CALLOUT_RE = /^\[!([\w-]+)\]([+-]?)[ \t]*/;

interface Self {
  type: TypeId;
  uid: string;
  version: Version | null;
}

let cache: { at: number; catalog: CatalogEntry[] } | null = null;
function catalog(): CatalogEntry[] {
  if (!cache || Date.now() - cache.at > 1000) cache = { at: Date.now(), catalog: scanCatalog() };
  return cache.catalog;
}

const titles = new Map<string, string>();
function titleOf(entry: CatalogEntry, version: Version): string {
  const file = path.join(entry.dir, `v${formatVersion(version)}.md`);
  let title = titles.get(file);
  if (title === undefined) {
    const head = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '';
    const m = /^title:\s*(.+)$/m.exec(head);
    title = m ? m[1].trim().replace(/^(['"])(.*)\1$/, '$2') : `${entry.type}/${entry.uid}`;
    titles.set(file, title);
  }
  return title;
}

function anchorHref(anchor: string | null): string {
  if (!anchor) return '';
  if (anchor.startsWith('^')) return `#${anchor}`;
  const heading = anchor.split('#').pop()!;
  return `#${new GithubSlugger().slug(heading)}`;
}

function parseSize(s: string): { width: number; height?: number } | null {
  const m = /^(\d+)(?:x(\d+))?$/.exec(s.trim());
  if (!m) return null;
  return m[2] ? { width: Number(m[1]), height: Number(m[2]) } : { width: Number(m[1]) };
}

export function remarkObsidian() {
  return (tree: Root, file: VFile) => {
    const self: Self | null = file.path ? identify(file.path) : null;
    const fail = (message: string, node?: Nodes): never => file.fail(message, node);

    /** URL and default label for a link to another entry. */
    function resolveEntry(link: Wikilink, node: Nodes): { url: string; label: string } {
      const target = parseTarget(link.path);
      const hash = anchorHref(link.anchor);
      if (target.kind === 'self') {
        return { url: hash, label: link.anchor?.replace(/^\^/, '') ?? '' };
      }
      if (target.kind === 'file') {
        return fail(
          `Cannot resolve link "${link.raw}": expected {type}/{uid}/v{version}, e.g. [[rfc/5/v1.2]]`,
          node,
        );
      }
      const { type, ref } = target;
      const entry = findEntry(catalog(), type, ref.uid);
      if (!entry) return fail(`Link "${link.raw}" points at ${type}/${ref.uid}, which does not exist`, node);
      const latest = latestVersion(entry.versions);

      if (ref.kind === 'list') {
        // Unversioned. A released version is frozen, so it must say which
        // version it means; a draft follows the latest until it is released.
        if (self?.version) {
          return fail(
            `Unversioned link "${link.raw}" in a released version. ` +
              `Pin it (e.g. [[${type}/${ref.uid}/v${latest ? formatVersion(latest) : '1'}]]), ` +
              `or use [[${type}/${ref.uid}l]] to always follow the latest. ` +
              `"npm run release" pins these automatically.`,
            node,
          );
        }
        return latest
          ? { url: entryPath(type, ref.uid, latest) + hash, label: titleOf(entry, latest) }
          : { url: listPath(type, ref.uid) + hash, label: `${type}/${ref.uid}` };
      }

      const resolved = resolveRef(ref, entry.versions);
      if (!resolved) return fail(`Link "${link.raw}": no such version of ${type}/${ref.uid}`, node);
      const label = titleOf(entry, resolved);
      if (ref.kind === 'latest') return { url: latestPath(type, ref.uid) + hash, label };
      if (ref.kind === 'float') {
        return { url: floatPath(type, ref.uid, ref.version, ref.level) + hash, label };
      }
      return { url: entryPath(type, ref.uid, resolved) + hash, label };
    }

    /** URL of an asset stored next to the current entry. */
    function resolveAsset(src: string, raw: string, node: Nodes): string {
      const clean = decodeURI(src).replace(/^\.\//, '');
      const parts = clean.split('/');
      const all = catalog();
      // {type}/{uid}/file: an asset of another entry.
      const other = parts.length >= 3 ? all.find((e) => e.type === parts[0] && e.uid === parts[1]) : undefined;
      if (other) {
        const rel = parts.slice(2).join('/');
        if (other.assets.includes(rel)) return assetUrl(other.type, other.uid, rel);
      }
      const own = self && findEntry(all, self.type, self.uid);
      if (own) {
        const exact = own.assets.find((a) => a === clean);
        const byName = own.assets.filter((a) => path.posix.basename(a) === clean);
        const hit = exact ?? (byName.length === 1 ? byName[0] : undefined);
        if (hit) return assetUrl(own.type, own.uid, hit);
      }
      return fail(`Cannot find "${src}" for ${raw}. Put it in the entry's folder.`, node);
    }

    function wikilinkNode(raw: string, node: Nodes): PhrasingContent {
      const link = parseWikilink(raw)!;
      if (link.embed && IMAGE_EXT.test(link.path)) {
        const size = link.alias ? parseSize(link.alias) : null;
        return {
          type: 'image',
          url: resolveAsset(link.path, raw, node),
          alt: size || !link.alias ? '' : link.alias,
          data: size ? { hProperties: { ...size } } : undefined,
        };
      }
      const { url, label } = resolveEntry(link, node);
      return {
        type: 'link',
        url,
        children: [{ type: 'text', value: link.alias || label }],
        data: { hProperties: { class: 'wikilink' } },
      };
    }

    // ---- callouts
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== 'paragraph') return;
      const head = first.children[0];
      if (head?.type !== 'text') return;
      const m = CALLOUT_RE.exec(head.value);
      if (!m) return;
      const kind = m[1].toLowerCase();
      const fold = m[2];
      head.value = head.value.slice(m[0].length);

      // The title is the rest of the first line; the body is everything after.
      const title: PhrasingContent[] = [];
      const rest: PhrasingContent[] = [];
      let inTitle = true;
      for (const child of first.children) {
        if (!inTitle) rest.push(child);
        else if (child.type === 'break') inTitle = false;
        else if (child.type === 'text' && child.value.includes('\n')) {
          const at = child.value.indexOf('\n');
          if (at > 0) title.push({ type: 'text', value: child.value.slice(0, at) });
          if (at + 1 < child.value.length) rest.push({ type: 'text', value: child.value.slice(at + 1) });
          inTitle = false;
        } else title.push(child);
      }
      const hasTitle = title.some((t) => t.type !== 'text' || t.value.trim() !== '');
      const titleNode: Paragraph = {
        type: 'paragraph',
        children: hasTitle ? title : [{ type: 'text', value: kind[0].toUpperCase() + kind.slice(1) }],
        data: { hName: fold ? 'summary' : 'div', hProperties: { class: 'callout-title' } },
      };
      const body: Blockquote = {
        type: 'blockquote',
        children: [
          ...(rest.length ? [{ type: 'paragraph', children: rest } as Paragraph] : []),
          ...node.children.slice(1),
        ],
        data: { hName: 'div', hProperties: { class: 'callout-body' } },
      };
      node.data = {
        hName: fold ? 'details' : 'div',
        hProperties: {
          class: `callout callout-${kind}`,
          'data-callout': kind,
          ...(fold === '+' ? { open: true } : {}),
        },
      };
      node.children = body.children.length ? [titleNode, body] : [titleNode];
    });

    // ---- block labels: "text ^label"
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      const last = node.children[node.children.length - 1];
      if (last?.type !== 'text' || !parent || index === undefined) return;
      // The label may sit at the end of the paragraph's first line when the
      // paragraph is the head of a list item with lazy continuation.
      const m = LABEL_RE.exec(last.value);
      if (!m) return;
      last.value = last.value.slice(0, m.index);
      const label = m[1];
      const onlyLabel = node.children.length === 1 && last.value.trim() === '';

      let host: Nodes = node;
      if (onlyLabel && index > 0) {
        // A label on its own line labels the block before it.
        host = parent.children[index - 1];
        parent.children.splice(index, 1);
      } else if (parent.type === 'listItem' && index === 0) {
        host = parent;
      }
      host.data = { ...host.data, hProperties: { ...host.data?.hProperties, 'data-label': label } };
      if (onlyLabel && index > 0) return [SKIP, index];
    });

    // ---- wikilinks, embeds, ==highlight==, %%comments%%
    visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      INLINE_RE.lastIndex = 0;
      if (!INLINE_RE.test(node.value)) return;
      INLINE_RE.lastIndex = 0;
      const out: PhrasingContent[] = [];
      let at = 0;
      for (const m of node.value.matchAll(INLINE_RE)) {
        if (m.index > at) out.push({ type: 'text', value: node.value.slice(at, m.index) });
        if (m[1]) out.push(wikilinkNode(m[1], node));
        else if (m[2] !== undefined) {
          out.push({
            type: 'emphasis',
            children: [{ type: 'text', value: m[2] }],
            data: { hName: 'mark' },
          });
        }
        at = m.index + m[0].length;
      }
      if (at < node.value.length) out.push({ type: 'text', value: node.value.slice(at) });
      parent.children.splice(index, 1, ...(out as any[]));
      return [SKIP, index + out.length];
    });

    // ---- ![alt|300](src) and assets stored next to the entry
    visit(tree, 'image', (node) => {
      const bar = (node.alt ?? '').lastIndexOf('|');
      if (bar >= 0) {
        const size = parseSize(node.alt!.slice(bar + 1));
        if (size) {
          node.alt = node.alt!.slice(0, bar);
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...size } };
        }
      }
      if (!/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(node.url)) {
        node.url = resolveAsset(node.url, `![${node.alt ?? ''}](${node.url})`, node);
      }
    });

    // ---- [text](relative/path.md) between entries
    visit(tree, 'link', (node) => {
      if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(node.url)) return;
      const [rawPath, anchor = null] = decodeURI(node.url).split('#');
      if (!/\.md$/i.test(rawPath)) return;
      // Resolve relative to this file, then express relative to content/.
      const rel = self
        ? path.posix.normalize(path.posix.join(self.type, self.uid, rawPath))
        : rawPath;
      const viaSelf = parseTarget(rel).kind === 'entry' ? rel : rawPath;
      const { url } = resolveEntry(
        { embed: false, path: viaSelf, anchor, alias: null, raw: `(${node.url})` },
        node,
      );
      node.url = url;
    });
  };
}
