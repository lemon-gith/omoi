/**
 * Gives every block a stable address within its version.
 *
 * Blocks are the top-level elements of the document plus every list item,
 * numbered in document order with a hex counter: `#b0`, `#b1`, ... `#b1a`.
 * A block that carries an Obsidian label (`^label`) also answers to `#^label`.
 *
 * Ids are only stable within one version, which is enough: reordering content
 * means releasing a new version, and that has a new eid.
 *
 * Each block gets `data-b="<hex>"`. The id goes on the element itself, unless
 * the element already has one or is a heading (whose id is its slug), in
 * which case an empty anchor is placed just before it.
 */
import type { Element, ElementContent, Root, RootContent } from 'hast';

const HEADING = /^h[1-6]$/;

function anchor(id: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: { id, class: 'b-anchor', ariaHidden: 'true' },
    children: [],
  };
}

export function rehypeBlocks() {
  return (tree: Root) => {
    let n = 0;

    /** Marks `el` as a block; returns anchors to insert before it. */
    function mark(el: Element, insideItem: boolean): Element[] {
      const hex = (n++).toString(16);
      const before: Element[] = [];
      el.properties.dataB = hex;
      if (el.properties.id || HEADING.test(el.tagName)) before.push(anchor(`b${hex}`));
      else el.properties.id = `b${hex}`;

      const label = el.properties.dataLabel;
      if (typeof label === 'string') {
        delete el.properties.dataLabel;
        // Inside a list only <li> may be a child, so the anchor goes inside.
        if (insideItem) el.children.unshift(anchor(`^${label}`));
        else before.push(anchor(`^${label}`));
      }
      return before;
    }

    function list(el: Element) {
      for (const item of el.children) {
        if (item.type !== 'element' || item.tagName !== 'li') continue;
        mark(item, true);
        for (const child of item.children) {
          if (child.type === 'element' && (child.tagName === 'ul' || child.tagName === 'ol')) list(child);
        }
      }
    }

    const out: RootContent[] = [];
    for (const node of tree.children) {
      if (node.type !== 'element') {
        out.push(node);
        continue;
      }
      // Footnote definitions already have ids that footnote references use.
      if ('dataFootnotes' in node.properties) {
        out.push(node);
        continue;
      }
      if (node.tagName === 'ul' || node.tagName === 'ol') list(node);
      else out.push(...(mark(node, false) as ElementContent[]));
      out.push(node);
    }
    tree.children = out;
  };
}
