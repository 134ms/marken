import { readFile } from 'node:fs/promises'
import MiniSearch from 'minisearch'
import path from 'node:path'
import type { Vault, RefreshDiff } from './vault.js'
import { stripFrontMatter } from './frontmatter.js'
import type { SearchHit } from '../shared/types.js'

interface Doc {
  id: string
  path: string
  title: string
  body: string
}

/** Strip Markdown-ish noise from body text before snippetting. */
function plainify(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')      // fenced code
    .replace(/`[^`]*`/g, ' ')              // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^#{1,6}\s+/gm, '')           // headings
    .replace(/^[*\->]\s+/gm, '')           // list markers
    .replace(/[*_~`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function deriveTitle(md: string, fallback: string): string {
  const m = md.match(/^\s*#\s+(.+?)\s*$/m)
  return m?.[1] ?? fallback
}

export class SearchIndex {
  private index = new MiniSearch<Doc>({
    fields: ['title', 'body'],
    storeFields: ['title', 'path', 'body'],
    searchOptions: {
      boost: { title: 3 },
      prefix: true,
      fuzzy: 0.1,
      combineWith: 'AND',
    },
  })

  constructor(private vault: Vault) {}

  async build(): Promise<void> {
    this.index.removeAll()
    for (const p of this.vault.allDocuments()) {
      const doc = await this.buildDoc(p)
      if (doc) this.index.add(doc)
    }
  }

  /** Apply a tree-refresh diff incrementally — only re-reads changed files. */
  async applyDiff(diff: RefreshDiff): Promise<void> {
    for (const p of diff.removed) {
      if (this.index.has(p)) this.index.discard(p)
    }
    for (const p of diff.added) {
      const doc = await this.buildDoc(p)
      if (!doc) continue
      if (this.index.has(p)) this.index.replace(doc)
      else this.index.add(doc)
    }
    for (const p of diff.modified) {
      const doc = await this.buildDoc(p)
      if (!doc) {
        if (this.index.has(p)) this.index.discard(p)
        continue
      }
      if (this.index.has(p)) this.index.replace(doc)
      else this.index.add(doc)
    }
  }

  query(q: string, limit = 25): SearchHit[] {
    if (!q.trim()) return []
    const results = this.index.search(q, { combineWith: 'AND' })
    return results.slice(0, limit).map((r) => {
      const body = String(r['body'] ?? '')
      const snippet = makeSnippet(body, q)
      return {
        path: String(r['path']),
        title: String(r['title']),
        snippet,
        score: r.score,
      }
    })
  }

  private async buildDoc(p: string): Promise<Doc | null> {
    const abs = this.vault.resolve(p)
    if (!abs) return null
    try {
      const raw = await readFile(abs, 'utf8')
      const { data, body: bodySrc } = stripFrontMatter(raw)
      const fallback = path.posix.basename(p).replace(/\.md$/i, '')
      const title = data['title']?.trim() || deriveTitle(bodySrc, fallback)
      const body = plainify(bodySrc)
      return { id: p, path: p, title, body }
    } catch {
      return null
    }
  }
}

function makeSnippet(body: string, query: string): string {
  const terms = query.trim().split(/\s+/).filter((t) => t.length >= 2)
  if (terms.length === 0) return body.slice(0, 160)
  const lower = body.toLowerCase()
  let pos = -1
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase())
    if (i !== -1 && (pos === -1 || i < pos)) pos = i
  }
  if (pos === -1) return body.slice(0, 160)
  const start = Math.max(0, pos - 60)
  const end = Math.min(body.length, pos + 120)
  let s = body.slice(start, end)
  if (start > 0) s = '…' + s
  if (end < body.length) s = s + '…'
  return s
}
