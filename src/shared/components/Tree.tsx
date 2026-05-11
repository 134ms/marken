import type { TreeDirNode, TreeNode } from '../types.js'

export interface TreeProps {
  tree: TreeDirNode
  currentPath: string
}

export default function Tree({ tree, currentPath }: TreeProps) {
  return (
    <div class="marken-tree" role="tree" aria-label="Documents">
      <TreeList nodes={tree.children} currentPath={currentPath} depth={0} />
    </div>
  )
}

function TreeList({ nodes, currentPath, depth }: { nodes: TreeNode[]; currentPath: string; depth: number }) {
  if (nodes.length === 0) return null
  return (
    <ul class={`marken-tree-list marken-tree-depth-${depth}`} role="group">
      {nodes.map((node) =>
        node.type === 'dir' ? (
          <FolderItem node={node} currentPath={currentPath} depth={depth} />
        ) : (
          <FileItem node={node} active={node.path === currentPath} />
        ),
      )}
    </ul>
  )
}

function FolderItem({ node, currentPath, depth }: { node: TreeDirNode; currentPath: string; depth: number }) {
  const containsCurrent =
    currentPath === node.path || currentPath.startsWith(node.path + '/')
  return (
    <li class="marken-tree-item is-folder" role="treeitem">
      <details class="marken-tree-folder" open={containsCurrent || depth === 0}>
        <summary class="marken-tree-folder-summary">
          <span class="marken-tree-twisty" aria-hidden="true" />
          <FolderIcon />
          <span class="marken-tree-label">{node.name}</span>
        </summary>
        <TreeList nodes={node.children} currentPath={currentPath} depth={depth + 1} />
      </details>
    </li>
  )
}

function FileItem({
  node,
  active,
}: {
  node: Extract<TreeNode, { type: 'file' }>
  active: boolean
}) {
  return (
    <li class={`marken-tree-item is-file${active ? ' is-active' : ''}`} role="treeitem" aria-current={active ? 'page' : undefined}>
      <a class="marken-tree-link" href={`/view/${encodePath(node.path)}`}>
        <span class="marken-tree-twisty" aria-hidden="true" />
        <FileIcon />
        <span class="marken-tree-label">{node.label}</span>
      </a>
    </li>
  )
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

function FolderIcon() {
  return (
    <svg class="marken-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M1.75 2.5h4.086a.75.75 0 0 1 .53.22l1.414 1.414a.75.75 0 0 0 .53.22h5.94c.69 0 1.25.56 1.25 1.25v7.146c0 .69-.56 1.25-1.25 1.25H1.75A1.25 1.25 0 0 1 .5 12.75V3.75c0-.69.56-1.25 1.25-1.25Z" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg class="marken-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3 1.75A.75.75 0 0 1 3.75 1h6.379c.232 0 .456.092.621.257l3.121 3.121a.875.875 0 0 1 .258.621V14.25a.75.75 0 0 1-.75.75h-9.5A.75.75 0 0 1 3 14.25V1.75Zm7 .664V4.5h2.086L10 2.414Z" />
    </svg>
  )
}
