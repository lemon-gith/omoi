# omoi

The site my omoi stuff lives on: posts, articles, RFCs and papers, written in
Obsidian-flavoured markdown and built into a fully static site for GitHub Pages.

Built with [Astro](https://astro.build). The build compiles every entry, every
alias URL and a set of JSON indices; a little client-side TypeScript uses those
indices for filtering, search and link resolution. Every page works without JS.

## Commands

```bash
npm install
npm run dev        # dev server, including draft previews
npm run build      # static site + search index into dist/
npm run preview    # serve dist/
npm test           # unit tests for ids, versions and links
npm run check      # type-check
```

## Entries

| Type           | Short | Full          |
| -------------- | ----- | ------------- |
| Post           | `p`   | `post`        |
| Article        | `ac`  | `article`     |
| RFC            | `rfc` | `rfc`         |
| Whitepaper     | `wp`  | `whitepaper`  |
| Yellow Paper   | `yp`  | `yellowpaper` |
| Research Paper | `rp`  | `respaper`    |
| PSA            | `psa` | `psa`         |

An entry's identity is its path. Everything else is in its properties.

```
content/{type}/{uid}/v{version}.md   a released version; never edited again
content/{type}/{uid}/draft.md        the working copy; only built by `npm run dev`
content/{type}/{uid}/figure.png      anything else is an asset of that entry
```

- `uid` is a lowercase hex counter from 0, per type. `wp`, `yp` and `rp` share
  one counter, so `wp/5`, `yp/5` and `rp/5` are the same idea at different stages.
- `version` is `major.minor.patch` with trailing zeros left off (`v1`, `v3.2`,
  `v5.0.1`). The first release is `v1`.

Properties:

```yaml
title: How addresses work here # required
short-name: addresses # required; used in full links
date: 2026-11-15 # required; release date of this version
summary: One line for lists and feeds.
tags: [meta]
changelog: # required from the second version on
  - What changed.
kind: white # articles: white (thoughts) or research
authors: [Someone Else] # defaults to the site author
```

### Writing and releasing

```bash
npm run new -- rfc my-proposal "My proposal"     # creates content/rfc/{next uid}/draft.md
npm run new -- rp my-paper "My paper" --uid 5    # another stage of paper 5
npm run release -- rfc/3                         # first release: v1
npm run release -- rfc/3 minor                   # later: major | minor | patch
```

`release` copies `draft.md` to the new version file, stamps the date, and pins
every unversioned link (below). The draft stays as the working copy.

## URLs

| URL                          | What it is                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| `/rfc/5v1.2/`                | The entry. This is the canonical, permanent address.        |
| `/rfc/5/`                    | Every version of the entry, with changelogs.                |
| `/rfc/5l/`                   | The latest version.                                         |
| `/rfc/5v1.2/short-name/`     | Full link; the name is decoration.                          |
| `/rfc/5v6+.2.3/`             | Newest version of all (shared from 6.2.3).                  |
| `/rfc/5v6.2+.3/`             | Newest version within v6.                                   |
| `/rfc/5v6.2.3+/`             | Newest patch of v6.2.                                       |
| `/rfc/5/diff/1..1.2/`        | Source diff between two versions.                           |
| `/rfc/5v1.2/cite.bib`        | BibTeX for that exact version.                              |
| `/post/…`, `/whitepaper/…`   | Full type names work everywhere the short ones do.          |
| `/rfc/`, `/tags/x/`          | Lists. `/feed.xml` and `/rfc/feed.xml` are Atom feeds.      |

Only the first two rows are real pages. The rest are **stubs**: GitHub Pages
cannot send redirects, so each alias is a tiny pre-built page that forwards to
the canonical URL (by meta refresh without JS; with JS the query and hash are
kept). They are regenerated on every build, which is how `5l` and `5v6+` move.
Anything else that still parses as a reference (`/RFC/5V1`, `/rfc/5v6.+`) is
resolved in the browser by `404.html`.

### Blocks

Every top-level block and list item is numbered in hex within its version:
`/rfc/5v1.2/#b1a`. An Obsidian label (`some text ^my-label`) also gives
`#^my-label`. To highlight instead of just scrolling:

```
?b=1a          block 1a
?b=1a-1c       blocks 1a to 1c
?b=1a:10-25    characters 10 to 25 of block 1a
?b=3,1a:10-25  several
```

The `#` button beside a block copies such a link, for the selected text if
there is a selection.

## Markdown

CommonMark, GFM (tables, footnotes, task lists), inline HTML, maths
(`$…$`, `$$…$$`), and from Obsidian:

- `[[rfc/5/v1.2]]`, `[[rfc/5/v1.2#Heading]]`, `[[rfc/5/v1.2#^label|shown text]]`
- `[[rfc/5l]]` always follows the latest; `[[rfc/5v2+.1]]` floats
- `[[rfc/5]]` is unversioned: fine in a draft, pinned to the then-latest version
  by `npm run release`, and a build error in a released file
- `![[figure.png|300]]` and `![alt|300x200](figure.png)` for sized images
- `> [!WARNING] Title` callouts, any type name, `+`/`-` to fold
- `==highlight==`, `%%comment%%`, `^block-labels`

A link that does not resolve fails the build.

## Indices

Built into `dist/index/` and fetched by the browser when needed:

| File            | Contents                                           |
| --------------- | -------------------------------------------------- |
| `entries.json`  | Latest version of every entry, newest first.       |
| `versions.json` | `{ type: { uid: [versions] } }`                    |
| `tags.json`     | `{ tag: ["type/uid"] }`                            |
| `links.json`    | Outgoing links per version (the backlink graph).   |

Full-text search uses [Pagefind](https://pagefind.app), indexed over the latest
version of each entry after the build.

## Layout

```
site.config.ts            site name, URL, author
src/lib/eid.ts            ids, versions, floating links (shared with the browser)
src/lib/wikilink.ts       wikilink parsing
src/lib/catalog.ts        what exists in content/
src/lib/content.ts        the content model: versions, links, backlinks, related
src/lib/markdown/         the Obsidian remark plugin and the block-id rehype plugin
src/pages/[type]/[ref]/   entry pages, version lists, stubs, diffs, citations
src/client/               browser scripts
scripts/                  new and release
```

## Deploying

`.github/workflows/deploy.yml` tests, builds and deploys `main` to GitHub
Pages. In the repository settings set Pages → Source to "GitHub Actions". The
custom domain is in `public/CNAME` and `site.config.ts`.
