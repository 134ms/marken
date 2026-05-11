# Marken — Roadmap

Features to add, roughly in priority order. Each item describes what the feature is and what "done" looks like.

## Callouts

Obsidian-flavored callout blocks rendered from blockquote syntax:

```
> [!note] Optional title
> Body text, can contain **markdown**.
```

Supported types: `note`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`, plus aliases. Each type gets its own icon and color accent. The block can be foldable (`> [!note]-` collapsed, `> [!note]+` expanded) but the viewer can render this as a static accent for now. Most-requested rendering parity feature on Perlite, with a steady tail of edge-case bugs there — worth doing carefully (nested callouts, empty body, default title from type).

## Note transclusion

Embedding the contents of another note inline using `![[Other note]]` (or `![[Other note#Heading]]` for a section, `![[Other note^block-id]]` for a block). Renders the target note's HTML in place, with a small header linking back to the source. Needs cycle detection (A embeds B embeds A) and a sensible depth cap. Perlite has wikilinks but not full transclusion — clear unmet ask (#146).

## Footnotes

Standard Markdown footnote syntax:

```
Here is a claim.[^1]

[^1]: And here is the supporting reference.
```

Drop-in via `markdown-it-footnote`. Renders numbered superscript references and a footnotes section at the bottom of the document with back-links. Perlite closed this as wontfix (#9), so a real opportunity.

## Graph view

Force-directed graph of notes (nodes) and their links (edges), opened from a button in the top bar or sidebar. Clicking a node navigates to that note; hovering highlights neighbors. Filters: depth from current note, tag, folder. Must be performant on large vaults — Perlite's graph repeatedly hit PHP-FPM timeouts on thousands of notes (#97, #123). Design constraint: precompute the link graph at vault-scan time (file watcher updates it incrementally), serve it as a static JSON blob — never recompute per request. Render with a small canvas-based layout lib (e.g. d3-force or cytoscape).

## Canvas / Excalidraw

Render Obsidian `.canvas` files (a documented JSON format describing positioned cards, embedded notes, images, and arrow connections) as an interactive view. Read-only. Bonus: render Excalidraw `.excalidraw` / `.excalidraw.md` files inline. This is Perlite's single biggest unmet ask (#72, #117) — the maintainer explicitly said they couldn't find a JS library to render canvases. Likely path: React Flow or similar for layout/edges, plus reuse our own renderer for embedded markdown cards. Largest scope item on this list.

## Tag panel + tag-based navigation

Collect `#tag` occurrences and YAML frontmatter `tags:` arrays during vault scan. Add:

- A **tag panel** (sidebar section or dedicated page) listing all tags with note counts, expandable to show the notes under each tag. Nested tags (`#project/marken`) form a tree.
- A `/tag/<tag>` route showing all notes with that tag.
- Inline `#tag` tokens in rendered notes become links to that route.

Perlite ships this (#122) and it's a frequent secondary navigation mode for vault users.
