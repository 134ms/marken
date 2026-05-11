import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import type { TreeDirNode, TreeNode, DocumentMeta } from '../shared/types.js'

const MD_EXT = /\.md$/i

function isHidden(name: string): boolean {
  return name.startsWith('.')
}

function toLabel(name: string): string {
  return name.replace(MD_EXT, '')
}

async function walk(absDir: string, relDir: string): Promise<TreeNode[]> {
  const entries = await readdir(absDir, { withFileTypes: true })
  const dirs: TreeDirNode[] = []
  const files: TreeNode[] = []
  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    const childAbs = path.join(absDir, entry.name)
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const children = await walk(childAbs, childRel)
      if (children.length === 0) continue
      dirs.push({
        type: 'dir',
        name: entry.name,
        path: childRel,
        children,
      })
    } else if (entry.isFile() && MD_EXT.test(entry.name)) {
      files.push({
        type: 'file',
        name: entry.name,
        label: toLabel(entry.name),
        path: childRel,
      })
    }
  }
  const cmp = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  dirs.sort(cmp)
  files.sort(cmp)
  return [...dirs, ...files]
}

export class Vault {
  private constructor(
    public readonly root: string,
    private treeRoot: TreeDirNode,
    private basenameMap: Map<string, string[]>,
    private allMarkdownPaths: string[],
  ) {}

  static async create(root: string): Promise<Vault> {
    const abs = path.resolve(root)
    const st = await stat(abs).catch(() => null)
    if (!st || !st.isDirectory()) {
      throw new Error(`Vault path does not exist or is not a directory: ${abs}`)
    }
    const children = await walk(abs, '')
    const treeRoot: TreeDirNode = { type: 'dir', name: '', path: '', children }
    const allMd: string[] = []
    collectMd(treeRoot, allMd)
    const map = new Map<string, string[]>()
    for (const p of allMd) {
      const key = path.posix.basename(p).replace(MD_EXT, '').toLowerCase()
      const list = map.get(key)
      if (list) list.push(p)
      else map.set(key, [p])
    }
    return new Vault(abs, treeRoot, map, allMd)
  }

  tree(): TreeDirNode {
    return this.treeRoot
  }

  allDocuments(): string[] {
    return this.allMarkdownPaths
  }

  firstDocument(): string | null {
    return this.allMarkdownPaths[0] ?? null
  }

  /**
   * Resolve a vault-relative path to an absolute on-disk path, refusing
   * anything that would escape the vault root.
   */
  resolve(relPath: string): string | null {
    const normalized = path.posix.normalize(relPath.replace(/^\/+/, ''))
    if (normalized === '..' || normalized.startsWith('../')) return null
    const abs = path.resolve(this.root, normalized)
    const rel = path.relative(this.root, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null
    return abs
  }

  async resolveMarkdown(relPath: string): Promise<{ absPath: string; relativePath: string } | null> {
    if (!MD_EXT.test(relPath)) return null
    const abs = this.resolve(relPath)
    if (!abs) return null
    const st = await stat(abs).catch(() => null)
    if (!st || !st.isFile()) return null
    return { absPath: abs, relativePath: relPath }
  }

  async resolveFile(relPath: string): Promise<{ absPath: string; relativePath: string } | null> {
    const abs = this.resolve(relPath)
    if (!abs) return null
    const st = await stat(abs).catch(() => null)
    if (!st || !st.isFile()) return null
    return { absPath: abs, relativePath: relPath }
  }

  /**
   * Resolve a wiki-link target (`[[Foo]]` or `[[folder/Foo]]`) against the
   * current document's location. Returns the vault-relative .md path or null.
   */
  resolveWikiLink(target: string, currentRel: string): string | null {
    const cleaned = target.trim()
    if (!cleaned) return null
    // Explicit path with slash or extension: try to resolve directly.
    if (cleaned.includes('/') || /\.[a-z0-9]+$/i.test(cleaned)) {
      const withExt = MD_EXT.test(cleaned) ? cleaned : `${cleaned}.md`
      if (this.allMarkdownPaths.includes(withExt)) return withExt
      // Also try resolving relative to the current doc's folder.
      const folder = path.posix.dirname(currentRel)
      if (folder && folder !== '.') {
        const combined = path.posix.normalize(`${folder}/${withExt}`)
        if (this.allMarkdownPaths.includes(combined)) return combined
      }
      return null
    }
    const key = cleaned.toLowerCase()
    const matches = this.basenameMap.get(key)
    if (!matches || matches.length === 0) return null
    if (matches.length === 1) return matches[0]!
    const folder = path.posix.dirname(currentRel)
    return matches.find((m) => path.posix.dirname(m) === folder) ?? matches[0]!
  }

  /**
   * Resolve a wiki-style asset embed `![[image.png]]`. Returns a vault path
   * to any non-markdown file matching the basename.
   */
  async resolveWikiAsset(target: string, currentRel: string): Promise<string | null> {
    const cleaned = target.trim()
    if (!cleaned) return null
    // Try direct path
    if (cleaned.includes('/')) {
      const r = await this.resolveFile(cleaned)
      if (r) return r.relativePath
      const folder = path.posix.dirname(currentRel)
      if (folder && folder !== '.') {
        const combined = path.posix.normalize(`${folder}/${cleaned}`)
        const r2 = await this.resolveFile(combined)
        if (r2) return r2.relativePath
      }
      return null
    }
    // Bare filename — try sibling folder first, then walk the tree
    const folder = path.posix.dirname(currentRel)
    if (folder && folder !== '.') {
      const sibling = path.posix.normalize(`${folder}/${cleaned}`)
      const r = await this.resolveFile(sibling)
      if (r) return r.relativePath
    }
    const found = findFileByName(this.treeRoot, cleaned.toLowerCase())
    return found
  }

  /**
   * Build display metadata for a document: title, breadcrumbs, prev/next.
   */
  buildDocumentMeta(relPath: string, firstHeading: string | null): DocumentMeta {
    const segments = relPath.split('/')
    const label = segments.at(-1)!.replace(MD_EXT, '')
    const title = firstHeading?.trim() || label
    const breadcrumbs: { label: string; path: string }[] = []
    let acc = ''
    for (let i = 0; i < segments.length - 1; i++) {
      acc = acc ? `${acc}/${segments[i]}` : segments[i]!
      breadcrumbs.push({ label: segments[i]!, path: acc })
    }
    breadcrumbs.push({ label, path: relPath })

    const idx = this.allMarkdownPaths.indexOf(relPath)
    const prev = idx > 0 ? makeStub(this.allMarkdownPaths[idx - 1]!) : null
    const next = idx >= 0 && idx < this.allMarkdownPaths.length - 1
      ? makeStub(this.allMarkdownPaths[idx + 1]!)
      : null
    return { path: relPath, title, breadcrumbs, prev, next }
  }

  /**
   * Start watching the vault for changes; invokes `onChange` (debounced) when
   * files are added/removed/renamed. Returns a stop() function.
   */
  startWatch(onChange: () => void): () => void {
    let watcher: FSWatcher | null = null
    let timer: NodeJS.Timeout | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, 500)
    }
    try {
      watcher = watch(this.root, { recursive: true }, fire)
    } catch {
      // fs.watch recursive not supported on this platform; bail silently.
      return () => {}
    }
    return () => {
      if (timer) clearTimeout(timer)
      watcher?.close()
    }
  }
}

function makeStub(p: string): { label: string; path: string } {
  return { label: path.posix.basename(p).replace(MD_EXT, ''), path: p }
}

function collectMd(node: TreeNode, out: string[]): void {
  if (node.type === 'file') {
    out.push(node.path)
    return
  }
  for (const c of node.children) collectMd(c, out)
}

function findFileByName(node: TreeDirNode, lowerName: string): string | null {
  for (const c of node.children) {
    if (c.type === 'file') {
      if (c.name.toLowerCase() === lowerName) return c.path
    } else {
      const r = findFileByName(c, lowerName)
      if (r) return r
    }
  }
  return null
}
