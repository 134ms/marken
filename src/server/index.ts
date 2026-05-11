import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import mime from 'mime'

import { config } from './config.js'
import { Vault } from './vault.js'
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

  // Rebuild on file changes (best-effort; debounced).
  vault.startWatch(() => {
    void (async () => {
      try {
        const refreshed = await Vault.create(config.vaultPath)
        Object.assign(vault, refreshed)
        await search.build()
      } catch {
        /* ignore transient errors during reload */
      }
    })()
  })

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
    const meta = vault.buildDocumentMeta(file.relativePath, result.firstHeading)
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
