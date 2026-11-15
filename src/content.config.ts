import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Identity (type, uid, version) comes from the file's path:
 *   content/{type}/{uid}/v{version}.md
 * Everything else comes from the file's properties, validated here.
 * `draft.md` is the unreleased working copy and is only loaded by `astro dev`.
 */
const entries = defineCollection({
  loader: glob({
    base: './content',
    pattern: import.meta.env.DEV ? ['*/*/v*.md', '*/*/draft.md'] : '*/*/v*.md',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    title: z.string().min(1),
    /** Used in full links: /{type}/{eid}/{short-name}. */
    'short-name': z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase words joined by hyphens'),
    /** Release date of this version. */
    date: z.coerce.date(),
    // Obsidian writes an empty property as null, so empty means absent throughout.
    summary: z.string().nullish().transform((s) => s || undefined),
    tags: z.array(z.string()).nullish().transform((t) => t ?? []),
    /** What changed since the previous version. Required from the second version on. */
    changelog: z
      .union([z.string(), z.array(z.string())])
      .nullish()
      .transform((c) => (c == null ? [] : Array.isArray(c) ? c : [c])),
    /** Articles only: does it contain researched material, or just thoughts? */
    kind: z.enum(['white', 'research']).nullish().transform((k) => k ?? undefined),
    authors: z.array(z.string()).nullish().transform((a) => a ?? undefined),
  }),
});

export const collections = { entries };
