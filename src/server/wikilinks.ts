import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'

export interface WikiLinkContext {
  /** Current document's vault-relative path */
  currentPath: string
  /** Resolve `[[Target]]` → vault path to a markdown file, or null. */
  resolveLink: (target: string, currentPath: string) => string | null
  /** Resolve `![[asset]]` → vault path to a non-markdown file, or null. */
  resolveAsset: (target: string, currentPath: string) => string | null
  /** Build the URL to a markdown view given a vault path. */
  viewUrl: (vaultPath: string) => string
  /** Build the URL to a raw file given a vault path. */
  rawUrl: (vaultPath: string) => string
}

/**
 * Adds wiki-link parsing to markdown-it:
 *   [[Page]]            → link
 *   [[Page|alias]]      → link with custom text
 *   ![[image.png]]      → image embed
 *   ![[note]]           → transcluded note becomes a link (we don't recurse)
 *
 * The renderer is supplied per render via env.wikiLink, so the same
 * MarkdownIt instance can be reused across requests.
 */
export function wikiLinks(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'marken-wikilink', (state: StateInline, silent: boolean) => {
    const src = state.src
    const pos = state.pos
    const isEmbed = src.charCodeAt(pos) === 0x21 /* ! */
    const linkStart = isEmbed ? pos + 1 : pos
    if (src.charCodeAt(linkStart) !== 0x5b /* [ */) return false
    if (src.charCodeAt(linkStart + 1) !== 0x5b) return false

    // Find the matching closing `]]`
    const close = src.indexOf(']]', linkStart + 2)
    if (close === -1) return false
    const inner = src.slice(linkStart + 2, close)
    if (inner.length === 0 || inner.includes('\n')) return false

    if (silent) return true

    const pipe = inner.indexOf('|')
    const target = pipe === -1 ? inner : inner.slice(0, pipe)
    const alias = pipe === -1 ? null : inner.slice(pipe + 1)

    const ctx = (state.env as { wikiLink?: WikiLinkContext } | undefined)?.wikiLink
    if (!ctx) {
      // No context: emit raw text so we don't lose content.
      const t = state.push('text', '', 0)
      t.content = src.slice(pos, close + 2)
      state.pos = close + 2
      return true
    }

    if (isEmbed) {
      const asset = ctx.resolveAsset(target, ctx.currentPath)
      if (asset) {
        const token = state.push('image', 'img', 0)
        const url = ctx.rawUrl(asset)
        token.attrs = [
          ['src', url],
          ['alt', alias ?? target.split('/').pop() ?? target],
        ]
        token.content = alias ?? target
        token.children = []
        // markdown-it expects `image` tokens to also have `[ 'alt', ... ]`
        // populated via `children`, but the renderer reads attrs.alt as well.
      } else {
        // Fall back to a broken-link styled span so it's visible
        const open = state.push('html_inline', '', 0)
        open.content = `<span class="marken-broken-embed" title="Unresolved embed">![[${escapeHtml(target)}]]</span>`
      }
    } else {
      const dest = ctx.resolveLink(target, ctx.currentPath)
      if (dest) {
        const open = state.push('link_open', 'a', 1)
        open.attrs = [
          ['href', ctx.viewUrl(dest)],
          ['class', 'marken-wikilink'],
        ]
        const text = state.push('text', '', 0)
        text.content = alias ?? target
        state.push('link_close', 'a', -1)
      } else {
        const open = state.push('html_inline', '', 0)
        open.content = `<span class="marken-broken-link" title="Unresolved link">${escapeHtml(alias ?? target)}</span>`
      }
    }

    state.pos = close + 2
    return true
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Token unused-warning suppression
type _Token = Token
