import { renderToString } from 'preact-render-to-string'
import { h } from 'preact'
import type { Vault } from './vault.js'
import type { OutlineItem, TreeDirNode } from '../shared/types.js'
import Layout, { NotFoundPage, EmptyVaultPage } from '../shared/components/Layout.js'

const DOCTYPE = '<!DOCTYPE html>'

export interface DocumentPageInput {
  siteTitle: string
  docPath: string
  docTitle: string
  tree: TreeDirNode
  outline: OutlineItem[]
  bodyHtml: string
  hasMermaid: boolean
  breadcrumbs: { label: string; path: string }[]
  prev: { label: string; path: string } | null
  next: { label: string; path: string } | null
  assetVersion: string
}

export function renderDocumentPage(input: DocumentPageInput): string {
  const html = renderToString(h(Layout, input))
  return DOCTYPE + html
}

export function renderNotFoundPage(
  vault: Vault,
  attemptedPath: string,
  siteTitle: string,
  assetVersion: string,
): string {
  const html = renderToString(
    h(NotFoundPage, {
      siteTitle,
      tree: vault.tree(),
      attemptedPath,
      assetVersion,
    }),
  )
  return DOCTYPE + html
}

export function renderEmptyVaultPage(vaultPath: string, siteTitle: string): string {
  const html = renderToString(h(EmptyVaultPage, { siteTitle, vaultPath }))
  return DOCTYPE + html
}
