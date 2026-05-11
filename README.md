# Marken

A lightweight, self-hosted Markdown viewer. Point it at a folder of `.md` files and read.

Inspired by [Perlite](https://github.com/secure-77/Perlite). See [SPEC.md](./SPEC.md) for the full requirements.

## Features

- **Three-pane reading layout** on desktop: document tree on the left, content in the middle, outline on the right.
- **Mobile-friendly drawers** for the tree and outline; single-column reading column.
- **GitHub-flavored Markdown** — tables, task lists, strikethrough, autolinks, fenced code with syntax highlighting.
- **Math** via KaTeX (server-rendered), **diagrams** via Mermaid (lazy-loaded on pages that use them).
- **Wiki-style links** — `[[Page]]` resolves by basename across the vault; `![[image.png]]` embeds assets.
- **Full-text search** (in-memory, MiniSearch). Press `/` to focus.
- **Dark / light themes** with a toggle in the `⋮` menu; respects `prefers-color-scheme` by default.
- **Trivial URL composition** — append the file's relative path to the base URL to get the viewer URL.
- **Stateless and read-only** — no database, never writes to the vault.

## Quick start

```bash
docker run --rm \
  -p 8080:8080 \
  -v "$PWD/my-notes:/vault:ro" \
  marken
```

Open <http://localhost:8080>. Marken redirects to the first document in your vault.

## URL shape

| Purpose | URL |
|---|---|
| Rendered view | `https://example.com/view/<relative-path-to-file>.md` |
| Raw / download | `https://example.com/raw/<relative-path>` |
| Tree JSON | `https://example.com/api/tree` |
| Search JSON | `https://example.com/api/search?q=...` |
| Refresh (POST) | `https://example.com/api/refresh[?path=<relative>]` — token-gated |

Example: a vault file at `notes/meetings/2026-01-15.md` is viewable at
`https://example.com/view/notes/meetings/2026-01-15.md`.

## Configuration

All settings are environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `MARKEN_VAULT_PATH` | `/vault` | Directory of Markdown files to serve |
| `PORT` | `8080` | TCP port |
| `MARKEN_HOST` | `0.0.0.0` | Bind address |
| `MARKEN_TITLE` | `Marken` | Site name in the header |
| `MARKEN_STATIC_ROOT` | `dist/static` | Where the client bundle and CSS live (relative to CWD) |
| `MARKEN_API_TOKEN` | _(unset)_ | Bearer token for write APIs (`/api/refresh`). When unset, those endpoints return 503. |
| `MARKEN_RESCAN_INTERVAL` | `0` | Periodic full-vault rescan interval, in seconds. `0` disables polling. Set this on filesystems where inotify doesn't fire reliably (GCS FUSE, NFS, SMB). |

## Picking up vault changes

Marken keeps an in-memory tree and search index. Three ways to refresh them:

1. **`fs.watch`** — fires automatically on local filesystems and Docker bind mounts. No config needed.
2. **`MARKEN_RESCAN_INTERVAL=<seconds>`** — periodic safety net. Use on FUSE / network mounts where inotify is silent for out-of-band changes (e.g. `gsutil` writes to a GCS bucket mounted via the GCS FUSE CSI driver).
3. **`POST /api/refresh`** — explicit trigger. Useful for wiring up to a webhook (e.g. GCS Pub/Sub object notifications). With an optional `?path=<relative-vault-path>`, only that file or folder is rescanned — cheap on large vaults.

```bash
# Full rescan
curl -X POST -H "Authorization: Bearer $MARKEN_API_TOKEN" \
  https://marken.example.com/api/refresh

# Incremental — single file
curl -X POST -H "Authorization: Bearer $MARKEN_API_TOKEN" \
  "https://marken.example.com/api/refresh?path=notes/today.md"

# Incremental — folder (handles creates/moves/deletes inside it)
curl -X POST -H "Authorization: Bearer $MARKEN_API_TOKEN" \
  "https://marken.example.com/api/refresh?path=notes/2026"
```

The response is `{ "ok": true, "added": [...], "removed": [...], "modified": [...] }` listing the markdown paths whose state changed. The server re-reads only those files into the search index.

On GCS FUSE specifically, also lower the metadata cache TTLs on the mount so a rescan actually sees fresh state — e.g. `--stat-cache-ttl=10s --type-cache-ttl=10s --kernel-list-cache-ttl-secs=10`.

## Building from source

Requires Node 22 (or later).

```bash
npm install
npm run dev                       # tsx watch, http://localhost:8080
npm run build && npm start        # production build (single bundled server)
```

Build artifacts:

- `dist/server.js` — single-file Node bundle (~1.5 MB) that includes Hono, markdown-it, KaTeX, highlight.js, Preact, and friends. No `node_modules/` needed at runtime.
- `dist/static/client.js` — client hydration bundle (~21 KB)
- `dist/static/app.css` — stylesheet (~19 KB)
- `dist/static/chunks/` — lazy-loaded chunks (mermaid lives here)
- `dist/static/katex/` — KaTeX CSS + fonts (self-hosted)

To produce a Docker image:

```bash
docker build -t marken .
```

The image is multi-stage: `node:22-alpine` for the build, then a tiny runtime that copies only `dist/`. Runs as a non-root user, exposes 8080, declares `/vault` as a volume.

## Architecture

Marken is SSR-first with light hydration:

```
src/
  server/
    index.ts        ← Hono routes (/, /view, /raw, /api/tree, /api/search, /static)
    vault.ts        ← filesystem walker, tree builder, safe path resolution
    markdown.ts     ← markdown-it + GFM + KaTeX + highlight.js + wiki-links + path rewriting
    wikilinks.ts    ← inline rule that handles [[Page]] and ![[asset]]
    search.ts       ← MiniSearch index
    render.tsx      ← preact-render-to-string entry points
  shared/
    components/     ← Preact components used both for SSR and hydration
      Layout.tsx    ← page shell (header, asides, doc, breadcrumbs, pager)
      Tree.tsx      ← document tree (uses native <details> for expand/collapse)
      Outline.tsx   ← heading list with scroll-spy (hydrated)
      SearchBox.tsx ← search box with dropdown results (hydrated)
      Menu.tsx      ← ⋮ dropdown (Download, Copy link, Toggle theme)
      Island.tsx    ← hydration wrapper — props travel via data-props attribute
  client/
    main.tsx        ← finds [data-island] elements, hydrates them; wires up
                      vanilla event handlers for theme, drawers, menu, mermaid
    style.css       ← all CSS, themed via CSS variables
```

The server renders complete HTML for every page. The client bundle (21 KB) hydrates exactly two "islands": the outline (for scroll-spy active state) and the search box (for live results). Everything else — tree expand/collapse, mobile drawers, menu, theme toggle, download — uses plain HTML elements (`<details>`, `<a download>`) or vanilla event handlers.

Mermaid is lazy-loaded only on pages that contain `mermaid` code fences.

## Development scripts

```bash
npm run dev          # tsx watches server source; client uses last-built dist/static
npm run build        # full production build (client + static assets + server bundle)
npm run build:client # vite client + CSS only
npm run build:server # esbuild server bundle only
npm run typecheck    # tsc --noEmit across the whole tree
```

Diagnostic helpers in `scripts/` use puppeteer-core against the system Chrome:

- `scripts/verify-page.mjs <url>` — green-light report (mermaid SVG, outline items, search, KaTeX, hljs, task boxes)
- `scripts/req-log.mjs <url>` — list every JS request Chrome makes
- `scripts/browser-repro.mjs <url>` — full DOM dump for debugging hydration
