export interface TreeFileNode {
  type: 'file'
  name: string
  /** Display name (filename without `.md`) */
  label: string
  /** POSIX relative path from vault root, including `.md` extension */
  path: string
}

export interface TreeDirNode {
  type: 'dir'
  name: string
  /** POSIX relative path from vault root */
  path: string
  children: TreeNode[]
}

export type TreeNode = TreeFileNode | TreeDirNode

export interface OutlineItem {
  /** Heading level, 1-6 */
  level: number
  /** Plain-text heading content */
  text: string
  /** Anchor slug used as the id of the heading element */
  slug: string
}

export interface SearchHit {
  path: string
  title: string
  snippet: string
  score: number
}

export interface DocumentMeta {
  /** Vault-relative path including `.md` */
  path: string
  /** Title (first H1 if present, otherwise filename) */
  title: string
  /** Crumb segments, from root to current file (display labels only) */
  breadcrumbs: { label: string; path: string }[]
  /** Previous sibling .md, if any */
  prev?: { label: string; path: string } | null
  /** Next sibling .md, if any */
  next?: { label: string; path: string } | null
}
