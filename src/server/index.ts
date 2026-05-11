import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import mime from 'mime'

import { config } from './config.js'
import { Vault, type RefreshDiff } from './vault.js'
import { Renderer } from './markdown.js'
import { SearchIndex } from './search.js'
import {
  renderDocumentPage,
  renderNotFoundPage,
  renderEmptyVaultPage,
} from './render.js'

const ASSET_VERSION = String(Date.now())

function viewUrl(p: string): string {
  return `/view/${p.split('/').map(encodeURIComponent).join('/')}`
}

function rawUrl(p: string): string {
  return `/raw/${p.split('/').map(encodeURIComponent).join('/')}`
}

function decodePath(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

async function start() {
  const vault = await Vault.create(config.vaultPath)
  const renderer = new Renderer(vault, { viewUrl, rawUrl })
  const search = new SearchIndex(vault)
  await search.build()

  // Serialize concurrent refresh triggers so vault + search updates stay in
  // lockstep (one refresh's tree state matches the diff its search update sees).
  let refreshQueue: Promise<unknown> = Promise.resolve()
  function performRefresh(rawPath: string | null): Promise<RefreshDiff> {
    const next = refreshQueue.then(
      () => runRefresh(rawPath),
      () => runRefresh(rawPath),
    )
    refreshQueue = next.catch(() => undefined)
    return next
  }
  async function runRefresh(rawPath: string | null): Promise<RefreshDiff> {
    const diff = rawPath ? await vault.refreshPath(rawPath) : await vault.refreshAll()
    await search.applyDiff(diff)
    return diff
  }

  // Local-filesystem fast path: inotify-driven rebuilds. Best-effort; FUSE and
  // network mounts won't fire these for out-of-band changes.
  vault.startWatch(() => {
    void performRefresh(null).catch((err) => {
      console.error('[marken] watch-triggered rescan failed:', err)
    })
  })

  // Polling fallback for filesystems where inotify doesn't fire (GCS FUSE, NFS,
  // SMB, etc.). Disabled when MARKEN_RESCAN_INTERVAL is unset or 0.
  if (config.rescanIntervalSeconds > 0) {
    const intervalMs = config.rescanIntervalSeconds * 1000
    setInterval(() => {
      void performRefresh(null).catch((err) => {
        console.error('[marken] periodic rescan failed:', err)
      })
    }, intervalMs)
    console.log(`[marken] periodic rescan every ${config.rescanIntervalSeconds}s`)
  }

  const app = new Hono()

  // Ensure browsers trust the declared Content-Type. Without nosniff, Chrome
  // has been observed to silently strip inline `<script type="application/json">`
  // tags from HTML responses served over keep-alive — and it's good practice
  // either way.
  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
  })

  // Hono's serveStatic appends the request path to `root`. We strip "/static/"
  // and serve from "<staticRoot>/" so /static/app.css → <staticRoot>/app.css.
  app.use('/static/*', serveStatic({
    root: config.staticRoot.startsWith('/') ? config.staticRoot : './' + config.staticRoot.replace(/^\.\/+/, ''),
    rewriteRequestPath: (p) => p.replace(/^\/static\//, '/'),
  }))

  app.get('/api/tree', (c) => c.json(vault.tree()))

  app.get('/api/search', (c) => {
    const q = c.req.query('q') ?? ''
    return c.json(search.query(q))
  })

  app.post('/api/refresh', async (c) => {
    if (!config.apiToken) {
      return c.json({ error: 'api disabled — set MARKEN_API_TOKEN to enable' }, 503)
    }
    const auth = c.req.header('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token || token !== config.apiToken) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    const rawPath = c.req.query('path') ?? null
    try {
      const diff = await performRefresh(rawPath && rawPath.trim() ? rawPath : null)
      return c.json({
        ok: true,
        path: rawPath ?? null,
        added: diff.added,
        removed: diff.removed,
        modified: diff.modified,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 400)
    }
  })

  app.get('/raw/*', async (c) => {
    const rel = decodePath(c.req.path.replace(/^\/raw\//, ''))
    const file = await vault.resolveFile(rel)
    if (!file) return c.notFound()
    const st = await stat(file.absPath)
    const ct = mime.getType(file.absPath) ?? 'application/octet-stream'
    const isDownload = /\.md$/i.test(file.absPath)
    const headers: Record<string, string> = {
      'Content-Type': ct,
      'Content-Length': String(st.size),
      'Cache-Control': 'private, max-age=0, must-revalidate',
    }
    if (isDownload) {
      const base = path.basename(file.absPath)
      headers['Content-Disposition'] = `attachment; filename="${base.replace(/"/g, '')}"`
    }
    const stream = Readable.toWeb(createReadStream(file.absPath)) as unknown as ReadableStream
    return new Response(stream, { headers })
  })

  app.get('/view/*', async (c) => {
    const rel = decodePath(c.req.path.replace(/^\/view\//, ''))
    const file = await vault.resolveMarkdown(rel)
    if (!file) {
      const html = renderNotFoundPage(vault, rel, config.siteTitle, ASSET_VERSION)
      return c.html(html, 404)
    }
    const src = await readFile(file.absPath, 'utf8')
    const result = renderer.render(src, file.relativePath)
    // Front-matter `title` wins over the first H1 if present.
    const docTitle = result.frontMatter['title']?.trim() || result.firstHeading
    const meta = vault.buildDocumentMeta(file.relativePath, docTitle ?? null)
    const html = renderDocumentPage({
      siteTitle: config.siteTitle,
      docPath: file.relativePath,
      docTitle: meta.title,
      tree: vault.tree(),
      outline: result.outline,
      bodyHtml: result.html,
      hasMermaid: result.hasMermaid,
      breadcrumbs: meta.breadcrumbs,
      prev: meta.prev ?? null,
      next: meta.next ?? null,
      assetVersion: ASSET_VERSION,
    })
    return c.html(html)
  })

  app.get('/', (c) => {
    const first = vault.firstDocument()
    if (first) return c.redirect(viewUrl(first))
    return c.html(renderEmptyVaultPage(config.vaultPath, config.siteTitle))
  })

  app.notFound((c) => c.text('Not found', 404))

  serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    console.log(`Marken serving ${config.vaultPath} on http://${info.address}:${info.port}`)
  })
}

start().catch((err) => {
  console.error('[marken] failed to start:', err)
  process.exit(1)
})
