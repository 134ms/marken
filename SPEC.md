# Marken — Spec

A self-hosted, read-only Markdown viewer. You mount a folder of `.md` files into the container; Marken serves them as a polished web UI. Inspired by Perlite, but smaller and TypeScript-native.

## Product requirements

1. **Read a vault, don't manage it.** Marken never writes to the filesystem. No auth, no admin UI, no database. Stateless except for an in-memory search index.
2. **Vault is mountable.** Default path `/vault`, overridable via `MARKEN_VAULT_PATH`. The container is expected to be used as `-v ./notes:/vault:ro`.
3. **GitHub-flavored Markdown** with the usual: tables, task lists, strikethrough, autolinks, fenced code with syntax highlighting.
4. **Beyond GFM:** KaTeX math, Mermaid diagrams, Obsidian-style wiki-links (`[[Page]]`, `[[Page|alias]]`, `![[asset]]`).
5. **Full-text search** over the vault. In-memory; rebuilt at startup.
6. **Trivial URL composition.** `<base>/view/<relative-vault-path>.md` works for any document. No URL rewriting, no slug table — just concatenate. Keep the `.md` extension in URLs.
7. **Desktop layout:** three panes — document tree (left), content (center), heading outline (right). The outline tracks scroll position.
8. **Mobile layout:** single column. Tree and outline collapse into slide-in drawers with toggle buttons in the header.
9. **`⋮` menu** in the header on both layouts. Currently: Download Markdown, Copy link, Toggle theme. (Add more here, not in a hidden settings page.)
10. **Light and dark themes.** Default follows `prefers-color-scheme`; persisted choice overrides it. No FOUC.
11. **Small container.** Final image is just the bundled server (`dist/server.js`, ~1.5 MB) plus static assets (~5 MB including KaTeX fonts and the lazy mermaid chunk). No `node_modules/` at runtime.

## Stack (locked in)

| Layer | Choice |
|---|---|
| Runtime | Node 22 |
| Server framework | Hono + `@hono/node-server` |
| UI library | Preact (SSR via `preact-render-to-string`, hydrated via Preact islands) |
| Bundler | Vite for the client + CSS; esbuild for the server (single-file bundle with `--packages=bundle`) |
| Markdown | `markdown-it` + `markdown-it-anchor` + `markdown-it-task-lists` + `@traptitech/markdown-it-katex` + custom wiki-links plugin |
| Code highlighting | `highlight.js` (server-side; emits classed spans) |
| Diagrams | `mermaid` (client-side, dynamic-imported only when the page contains a `mermaid` fence) |
| Search | `minisearch` (in-memory index built at startup) |
| Language | TypeScript |

Don't swap any of these without a reason. The size budget is the constraint that keeps the substitution space narrow.

## URL contract

| Pattern | Purpose |
|---|---|
| `/` | Redirect to the first document, or render the empty-vault page |
| `/view/<path>.md` | Render a vault file as HTML |
| `/raw/<path>` | Serve a vault file as bytes (Markdown gets `Content-Disposition: attachment`; everything else by inferred MIME) |
| `/api/tree` | Vault tree as JSON |
| `/api/search?q=` | Search hits as JSON |
| `/static/*` | Client bundle, CSS, KaTeX assets |

Reserved prefixes: `/view`, `/raw`, `/api`, `/static`. The vault must not contain top-level entries named any of these, or paths would collide.

Inside a rendered document:
- Relative image URLs (`![](pic.png)`) are rewritten to `/raw/<doc-dir>/pic.png`.
- Relative links to other `.md` files (`[…](other.md)`) are rewritten to `/view/<doc-dir>/other.md`.
- Wiki-links `[[Page]]` resolve by basename across the whole vault (preferring same-folder matches when ambiguous).
- External links get `target="_blank" rel="noopener noreferrer"`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MARKEN_VAULT_PATH` | `/vault` | Vault directory |
| `PORT` | `8080` | Listen port |
| `MARKEN_HOST` | `0.0.0.0` | Bind address |
| `MARKEN_TITLE` | `Marken` | Site name in the header |
| `MARKEN_STATIC_ROOT` | `dist/static` | Static asset directory, relative to CWD |

## Architecture

```
src/
  server/        Hono app, vault walker, markdown pipeline, search, SSR
  shared/        Preact components shared between SSR and hydration
  client/        Hydration entry + global CSS
scripts/         Build helpers + browser-driven diagnostics
sample-vault/    Bundled demo content
```

### SSR + islands

The server renders complete HTML for every request. The client bundle hydrates exactly two **islands**:

- `outline` — for scroll-spy / active-heading state
- `search` — for the live results dropdown

Everything else is plain HTML/CSS:
- Tree expand/collapse uses native `<details>`/`<summary>`.
- The `⋮` menu uses native `<details>`.
- Mobile drawers are CSS classes toggled by vanilla click handlers.
- Theme switching is a vanilla handler + `localStorage`.
- Mermaid is a vanilla loader that dynamic-imports `mermaid` only when `[data-island="mermaid"]` elements exist.

If you find yourself reaching for more islands, pause — most interactions in this app are doable with `<details>` and a few event listeners.

### Island hydration mechanism

Island props travel in a **`data-props` attribute** on the wrapper element, URL-encoded JSON. The client reads `el.dataset.props`, `decodeURIComponent`s it, `JSON.parse`s it, and calls `hydrate(h(Component, props), el)`.

**Do not** put island props in inline `<script type="application/json">` tags. Chrome silently strips those from Hono's HTTP responses under default keep-alive without `nosniff`. The attribute approach is immune to this class of HTML-parser quirks. See `src/shared/components/Island.tsx`.

### Build pipeline

- `vite build` emits `dist/static/client.js`, `dist/static/app.css`, and lazy chunks under `dist/static/chunks/`. **`base: '/static/'`** is set so Vite generates absolute chunk URLs — without this, Chrome's preload scanner 404s on chunks before the runtime recovers.
- `scripts/copy-static.mjs` copies KaTeX CSS + fonts (and `highlight.js` themes, if used) into `dist/static/`.
- `esbuild` bundles `src/server/index.ts` into `dist/server.js`, bundling all dependencies (`--packages=bundle`). The runtime only needs `node dist/server.js`.

### Path safety

`Vault.resolve()` normalizes and verifies that the requested path stays inside the vault root. Any code that takes a user-supplied path and reaches into the filesystem must go through `resolveFile()` / `resolveMarkdown()`.

### Response hardening

A Hono middleware adds `X-Content-Type-Options: nosniff` to every response. It is **not** load-bearing for hydration (the `data-props` mechanism handles that), but it matters for `/raw/*` because that endpoint serves arbitrary user-mounted files — `nosniff` keeps the browser from MIME-promoting an unexpected file into something executable.

## Tone for the UI

Modern, polished, content-focused. Clean three-column reading layout, refined typography, subtle accents. Closer to Linear / Notion / Stripe docs than to old wiki software. System font stack (no Google Fonts). Generous line-height for prose. Use the CSS variables in `src/client/style.css` — don't hard-code colors elsewhere.

## Out of scope (v1)

- Editing, commenting, or anything that writes to the vault.
- Authentication. Deploy behind a reverse proxy if you need it.
- Persistent search index. We rebuild at startup; vault changes during runtime trigger a debounced reindex via `fs.watch` (best-effort; inotify on Docker bind mounts is unreliable).
- Multi-vault. One container, one vault.
- Client-side routing. Every navigation is a full page load. That's deliberate — the SSR is the point.
- iOS-Files-style column drilldown for the mobile tree. Current mobile UX is the same nested tree inside a drawer; revisit if the drawer feels cramped.

## Gotchas to remember

- **Chrome's HTML parser strips `<script type="application/json">` from some Hono responses.** Use `data-props` attributes for island props. (See `src/shared/components/Island.tsx`.)
- **Vite needs `base: '/static/'`.** Otherwise Chrome's preload scanner prefetches chunks against the document base and you'll see harmless-but-ugly 404s.
- **`<details>` is your friend.** Tree, menu — both rely on it. No JS needed.
- **Outline's `useState` initializer must handle empty items.** It does (`items[0]?.slug ?? null` with a default `items = []`), but be careful if you refactor.
- **Mermaid is heavy.** ~600 KB main chunk + per-diagram-type sub-chunks. Keep it lazy. Don't import it from the main client bundle.
- **`@hono/node-server` `serveStatic` appends the request path to `root`.** Use `rewriteRequestPath` to strip the `/static/` prefix so files resolve to `dist/static/<file>`, not `dist/static/static/<file>`.
- **The vault watcher uses `Object.assign(vault, refreshed)` to swap state in place.** That's a hack — sufficient for now, but if `Vault` grows non-data state, swap to a proper container with a `getCurrent()` accessor.
