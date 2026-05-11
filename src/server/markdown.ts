import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import taskLists from 'markdown-it-task-lists'
import katex from '@traptitech/markdown-it-katex'
import hljs from 'highlight.js/lib/common'
import path from 'node:path'
import { wikiLinks, type WikiLinkContext } from './wikilinks.js'
import type { Vault } from './vault.js'
import type { OutlineItem } from '../shared/types.js'

export interface RenderResult {
  html: string
  outline: OutlineItem[]
  firstHeading: string | null
  /** Whether the document includes mermaid code blocks (so the client knows to load mermaid) */
  hasMermaid: boolean
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'section'
}

/** Render mermaid blocks into a placeholder div the client picks up. */
function patchMermaid(md: MarkdownIt): void {
  const fenceRenderer = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    if (token.info.trim().toLowerCase() === 'mermaid') {
      const flags = env as { hasMermaid?: boolean }
      flags.hasMermaid = true
      return `<div class="marken-mermaid" data-island="mermaid">${escapeHtml(token.content)}</div>\n`
    }
    return fenceRenderer
      ? fenceRenderer(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }
}

/** Rewrite relative image/link paths so they resolve against /view and /raw. */
function patchRelativePaths(md: MarkdownIt, opts: { rawUrl: (p: string) => string; viewUrl: (p: string) => string }): void {
  const renderAttr = (token: { attrs: [string, string][] | null }, name: string, transform: (v: string) => string) => {
    if (!token.attrs) return
    for (const a of token.attrs) {
      if (a[0] === name) a[1] = transform(a[1]!)
    }
  }

  function resolve(env: { docPath?: string }, ref: string, kind: 'view' | 'raw'): string {
    if (!ref) return ref
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return ref // absolute URL
    if (ref.startsWith('#')) return ref               // pure anchor
    if (ref.startsWith('/')) return ref               // absolute path — leave it
    const base = env.docPath ?? ''
    const folder = base ? path.posix.dirname(base) : ''
    const hashIdx = ref.indexOf('#')
    const queryIdx = ref.indexOf('?')
    const splitIdx = (hashIdx === -1 ? Infinity : hashIdx) < (queryIdx === -1 ? Infinity : queryIdx) ? hashIdx : queryIdx
    const pathPart = splitIdx === -1 || splitIdx === Infinity ? ref : ref.slice(0, splitIdx)
    const tail = splitIdx === -1 || splitIdx === Infinity ? '' : ref.slice(splitIdx)
    const joined = path.posix.normalize(folder ? `${folder}/${pathPart}` : pathPart)
    const url = kind === 'view' && /\.md$/i.test(joined) ? opts.viewUrl(joined) : opts.rawUrl(joined)
    return `${url}${tail}`
  }

  const origImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    renderAttr(token as { attrs: [string, string][] | null }, 'src', (v) => resolve(env as { docPath?: string }, v, 'raw'))
    return origImage ? origImage(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
  }

  const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    renderAttr(token as { attrs: [string, string][] | null }, 'href', (v) => resolve(env as { docPath?: string }, v, 'view'))
    // External links: open in new tab.
    const href = token.attrGet('href') ?? ''
    if (/^https?:/i.test(href)) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener noreferrer')
    }
    return defaultLinkOpen(tokens, idx, options, env, self)
  }
}

/** Collect headings as the outline. */
function collectOutline(md: MarkdownIt): void {
  const origOpen = md.renderer.rules.heading_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const open = tokens[idx]!
    const inline = tokens[idx + 1]!
    const level = Number(open.tag.slice(1))
    const text = inline.content
    const slug = open.attrGet('id') || slugify(text)
    if (!open.attrGet('id')) open.attrSet('id', slug)
    const flags = env as { outline?: OutlineItem[]; firstHeading?: string }
    flags.outline ??= []
    flags.outline.push({ level, text, slug })
    if (!flags.firstHeading && level === 1) flags.firstHeading = text
    return origOpen(tokens, idx, options, env, self)
  }
}

export class Renderer {
  private md: MarkdownIt

  constructor(private vault: Vault, private urls: { viewUrl: (p: string) => string; rawUrl: (p: string) => string }) {
    this.md = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: false,
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
            return `<pre class="hljs"><code class="hljs language-${lang}">${out}</code></pre>`
          } catch {
            /* fall through */
          }
        }
        const escaped = this.md.utils.escapeHtml(code)
        return `<pre class="hljs"><code>${escaped}</code></pre>`
      },
    })
    this.md.use(anchor, {
      permalink: anchor.permalink.linkInsideHeader({
        symbol: '<span aria-hidden="true">#</span>',
        placement: 'after',
        ariaHidden: true,
      }),
      slugify,
    })
    this.md.use(taskLists, { enabled: true, label: false })
    this.md.use(katex, { throwOnError: false, output: 'html' })
    this.md.use(wikiLinks)
    patchMermaid(this.md)
    collectOutline(this.md)
    patchRelativePaths(this.md, this.urls)
  }

  render(source: string, currentPath: string): RenderResult {
    const wikiCtx: WikiLinkContext = {
      currentPath,
      resolveLink: (target, current) => this.vault.resolveWikiLink(target, current),
      resolveAsset: (target, current) => {
        // Synchronous path: rely on basename map + tree walk, no fs touch.
        // The Vault method is async because it stats files; for inline rendering
        // we approximate by looking for the file in the tree.
        return resolveWikiAssetSync(this.vault, target, current)
      },
      viewUrl: this.urls.viewUrl,
      rawUrl: this.urls.rawUrl,
    }
    const env: {
      docPath: string
      outline?: OutlineItem[]
      firstHeading?: string
      hasMermaid?: boolean
      wikiLink: WikiLinkContext
    } = { docPath: currentPath, wikiLink: wikiCtx }
    const html = this.md.render(source, env)
    return {
      html,
      outline: env.outline ?? [],
      firstHeading: env.firstHeading ?? null,
      hasMermaid: env.hasMermaid === true,
    }
  }
}

function resolveWikiAssetSync(vault: Vault, target: string, currentPath: string): string | null {
  const cleaned = target.trim()
  if (!cleaned) return null
  // For wiki asset embeds we approximate the async resolver: scan the cached
  // tree for a file with a matching name. (No fs hit, safe in inline render.)
  const tree = vault.tree()
  if (cleaned.includes('/')) {
    // Try as-is and relative to current folder
    if (findExact(tree, cleaned)) return cleaned
    const folder = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : ''
    if (folder) {
      const joined = `${folder}/${cleaned}`
      if (findExact(tree, joined)) return joined
    }
    return null
  }
  const lower = cleaned.toLowerCase()
  const folder = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : ''
  if (folder) {
    const sibling = `${folder}/${cleaned}`
    if (findExact(tree, sibling)) return sibling
  }
  return findByName(tree, lower)
}

function findExact(node: import('../shared/types.js').TreeDirNode | import('../shared/types.js').TreeFileNode, target: string): boolean {
  if (node.type === 'file') return node.path === target
  for (const c of node.children) if (findExact(c, target)) return true
  return false
}

function findByName(node: import('../shared/types.js').TreeDirNode | import('../shared/types.js').TreeFileNode, lowerName: string): string | null {
  if (node.type === 'file') return node.name.toLowerCase() === lowerName ? node.path : null
  for (const c of node.children) {
    const r = findByName(c, lowerName)
    if (r) return r
  }
  return null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
