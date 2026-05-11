import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import type { TreeDirNode, TreeFileNode, TreeNode, DocumentMeta } from '../shared/types.js'

const MD_EXT = /\.md$/i

function isHidden(name: string): boolean {
  return name.startsWith('.')
}

function toLabel(name: string): string {
  return name.replace(MD_EXT, '')
}

const treeCmp = (a: TreeNode, b: TreeNode) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

function sortChildren(dir: TreeDirNode): void {
  dir.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return treeCmp(a, b)
  })
}

/**
 * Walk the filesystem subtree at `absDir`, returning a sorted child list.
 * Also populates `mtimes` with `mtimeMs` for every `.md` file found.
 */
async function walk(absDir: string, relDir: string, mtimes: Map<string, number>): Promise<TreeNode[]> {
  const entries = await readdir(absDir, { withFileTypes: true })
  const dirs: TreeDirNode[] = []
  const files: TreeNode[] = []
  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    const childAbs = path.join(absDir, entry.name)
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const children = await walk(childAbs, childRel, mtimes)
      if (children.length === 0) continue
      const node: TreeDirNode = { type: 'dir', name: entry.name, path: childRel, children }
      sortChildren(node)
      dirs.push(node)
    } else if (entry.isFile() && MD_EXT.test(entry.name)) {
      const st = await stat(childAbs).catch(() => null)
      if (st) mtimes.set(childRel, st.mtimeMs)
      files.push({
        type: 'file',
        name: entry.name,
        label: toLabel(entry.name),
        path: childRel,
      })
    }
  }
  dirs.sort(treeCmp)
  files.sort(treeCmp)
  return [...dirs, ...files]
}

/**
 * Path-internal helper: normalize and validate a vault-relative path. Returns
 * `''` for the root, the cleaned posix path, or `null` if the input tries to
 * escape the vault root.
 */
function sanitizeVaultPath(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('/')) return null
  const normalized = path.posix.normalize(trimmed)
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.') return null
  return normalized
}

/** Create any missing intermediate dirs, returning the dir node at `relPath`. */
function ensureDir(root: TreeDirNode, relPath: string): TreeDirNode {
  if (!relPath) return root
  const segments = relPath.split('/')
  let node: TreeDirNode = root
  let acc = ''
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg
    let next = node.children.find((c) => c.type === 'dir' && c.name === seg) as TreeDirNode | undefined
    if (!next) {
      next = { type: 'dir', name: seg, path: acc, children: [] }
      node.children.push(next)
      sortChildren(node)
    }
    node = next
  }
  return node
}

/** Remove a node by path; prune any parent directories that become empty. */
function removeAtPath(root: TreeDirNode, relPath: string): void {
  if (!relPath) return
  const segments = relPath.split('/')
  const stack: TreeDirNode[] = [root]
  let node: TreeDirNode = root
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!
    const next = node.children.find((c) => c.type === 'dir' && c.name === seg)
    if (!next || next.type !== 'dir') return
    stack.push(next)
    node = next
  }
  const lastName = segments[segments.length - 1]!
  const idx = node.children.findIndex((c) => c.name === lastName)
  if (idx === -1) return
  node.children.splice(idx, 1)
  // Prune empty parents upward (stop at root so the root dir itself stays).
  for (let i = stack.length - 1; i > 0; i--) {
    const dir = stack[i]!
    if (dir.children.length > 0) break
    const parent = stack[i - 1]!
    const pidx = parent.children.indexOf(dir)
    if (pidx !== -1) parent.children.splice(pidx, 1)
  }
}

/** Replace or insert a child node at `relPath` under its parent. */
function spliceNode(root: TreeDirNode, relPath: string, node: TreeNode): void {
  const parentPath = path.posix.dirname(relPath)
  const parent = ensureDir(root, parentPath === '.' ? '' : parentPath)
  const baseName = path.posix.basename(relPath)
  const idx = parent.children.findIndex((c) => c.name === baseName)
  if (idx === -1) parent.children.push(node)
  else parent.children[idx] = node
  sortChildren(parent)
}

export interface RefreshDiff {
  /** Markdown files newly present after the refresh. */
  added: string[]
  /** Markdown files that disappeared. */
  removed: string[]
  /** Markdown files whose mtime changed (so content may have changed). */
  modified: string[]
}

function diffMtimes(oldMtimes: Map<string, number>, newMtimes: Map<string, number>): RefreshDiff {
  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []
  for (const [p, m] of newMtimes) {
    const prev = oldMtimes.get(p)
    if (prev === undefined) added.push(p)
    else if (prev !== m) modified.push(p)
  }
  for (const p of oldMtimes.keys()) {
    if (!newMtimes.has(p)) removed.push(p)
  }
  return { added, removed, modified }
}

export class Vault {
  private treeRoot: TreeDirNode
  private basenameMap: Map<string, string[]>
  private allMarkdownPaths: string[]
  /** mtimeMs keyed by vault-relative path; tracked so polling can skip unchanged files. */
  private fileMtimes: Map<string, number>
  /** Serializes mutating operations so concurrent refreshes don't corrupt the tree. */
  private chain: Promise<unknown> = Promise.resolve()

  private constructor(public readonly root: string) {
    this.treeRoot = { type: 'dir', name: '', path: '', children: [] }
    this.basenameMap = new Map()
    this.allMarkdownPaths = []
    this.fileMtimes = new Map()
  }

  static async create(root: string): Promise<Vault> {
    const abs = path.resolve(root)
    const st = await stat(abs).catch(() => null)
    if (!st || !st.isDirectory()) {
      throw new Error(`Vault path does not exist or is not a directory: ${abs}`)
    }
    const vault = new Vault(abs)
    await vault.refreshAll()
    return vault
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
    if (cleaned.includes('/') || /\.[a-z0-9]+$/i.test(cleaned)) {
      const withExt = MD_EXT.test(cleaned) ? cleaned : `${cleaned}.md`
      if (this.allMarkdownPaths.includes(withExt)) return withExt
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
    const folder = path.posix.dirname(currentRel)
    if (folder && folder !== '.') {
      const sibling = path.posix.normalize(`${folder}/${cleaned}`)
      const r = await this.resolveFile(sibling)
      if (r) return r.relativePath
    }
    return findFileByName(this.treeRoot, cleaned.toLowerCase())
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
   * files are added/removed/renamed. Returns a stop() function. Best-effort —
   * inotify isn't fired by FUSE/network filesystems for out-of-band changes,
   * so it should be paired with `MARKEN_RESCAN_INTERVAL` in those deployments.
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
      return () => {}
    }
    return () => {
      if (timer) clearTimeout(timer)
      watcher?.close()
    }
  }

  /** Full rescan from disk; returns the diff against the previous tree. */
  refreshAll(): Promise<RefreshDiff> {
    return this.serialize(() => this.doRefreshAll())
  }

  /**
   * Refresh a single file or folder. The path is treated as the source of
   * truth: if it exists, splice the fresh subtree in; if not, remove the
   * subtree. An empty path triggers a full rescan.
   */
  refreshPath(relPath: string): Promise<RefreshDiff> {
    return this.serialize(() => this.doRefreshPath(relPath))
  }

  private async doRefreshAll(): Promise<RefreshDiff> {
    const newMtimes = new Map<string, number>()
    const children = await walk(this.root, '', newMtimes)
    const oldMtimes = this.fileMtimes
    this.treeRoot = { type: 'dir', name: '', path: '', children }
    sortChildren(this.treeRoot)
    this.fileMtimes = newMtimes
    this.rebuildIndexes()
    return diffMtimes(oldMtimes, newMtimes)
  }

  private async doRefreshPath(rawPath: string): Promise<RefreshDiff> {
    const cleaned = sanitizeVaultPath(rawPath)
    if (cleaned === null) {
      throw new Error(`invalid refresh path: ${rawPath}`)
    }
    if (cleaned === '') return this.doRefreshAll()

    // Snapshot old mtimes under this prefix so we can compute a diff later.
    const oldMtimes = this.mtimesUnder(cleaned)

    const abs = this.resolve(cleaned)
    if (!abs) {
      throw new Error(`refresh path escapes vault root: ${rawPath}`)
    }
    const st = await stat(abs).catch(() => null)

    const newMtimes = new Map<string, number>()
    let newNode: TreeNode | null = null

    if (st && st.isDirectory()) {
      const children = await walk(abs, cleaned, newMtimes)
      if (children.length > 0) {
        const dir: TreeDirNode = {
          type: 'dir',
          name: path.posix.basename(cleaned),
          path: cleaned,
          children,
        }
        sortChildren(dir)
        newNode = dir
      }
    } else if (st && st.isFile()) {
      const base = path.posix.basename(cleaned)
      if (!isHidden(base) && MD_EXT.test(base)) {
        const file: TreeFileNode = {
          type: 'file',
          name: base,
          label: toLabel(base),
          path: cleaned,
        }
        newMtimes.set(cleaned, st.mtimeMs)
        newNode = file
      }
    }

    // Forget any tracked mtimes that previously lived under this path.
    for (const p of oldMtimes.keys()) this.fileMtimes.delete(p)

    if (newNode) {
      spliceNode(this.treeRoot, cleaned, newNode)
      for (const [p, m] of newMtimes) this.fileMtimes.set(p, m)
    } else {
      removeAtPath(this.treeRoot, cleaned)
    }

    this.rebuildIndexes()
    return diffMtimes(oldMtimes, newMtimes)
  }

  private rebuildIndexes(): void {
    const allMd: string[] = []
    collectMd(this.treeRoot, allMd)
    this.allMarkdownPaths = allMd
    const map = new Map<string, string[]>()
    for (const p of allMd) {
      const key = path.posix.basename(p).replace(MD_EXT, '').toLowerCase()
      const list = map.get(key)
      if (list) list.push(p)
      else map.set(key, [p])
    }
    this.basenameMap = map
  }

  private mtimesUnder(prefix: string): Map<string, number> {
    const out = new Map<string, number>()
    if (!prefix) {
      for (const [k, v] of this.fileMtimes) out.set(k, v)
      return out
    }
    const withSlash = `${prefix}/`
    for (const [k, v] of this.fileMtimes) {
      if (k === prefix || k.startsWith(withSlash)) out.set(k, v)
    }
    return out
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work)
    this.chain = next.catch(() => undefined)
    return next
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

