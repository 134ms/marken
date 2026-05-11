import type { ComponentChildren } from 'preact'
import type { OutlineItem, TreeDirNode } from '../types.js'
import Tree from './Tree.js'
import Outline from './Outline.js'
import Menu from './Menu.js'
import SearchBox from './SearchBox.js'
import { Island } from './Island.js'

export interface LayoutProps {
  siteTitle: string
  docPath: string
  docTitle: string
  tree: TreeDirNode
  outline: OutlineItem[]
  breadcrumbs: { label: string; path: string }[]
  prev?: { label: string; path: string } | null
  next?: { label: string; path: string } | null
  hasMermaid: boolean
  bodyHtml: string
  /** Cache-buster suffix on static assets */
  assetVersion: string
}

export default function Layout(props: LayoutProps) {
  const {
    siteTitle,
    docPath,
    docTitle,
    tree,
    outline,
    breadcrumbs,
    prev,
    next,
    hasMermaid,
    bodyHtml,
    assetVersion,
  } = props
  const v = `?v=${assetVersion}`
  const title = `${docTitle} — ${siteTitle}`
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="generator" content="Marken" />
        <link rel="stylesheet" href={`/static/app.css${v}`} />
        <link rel="stylesheet" href={`/static/katex/katex.min.css${v}`} />
        <script
          // Avoid FOUC: read saved theme synchronously before paint.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('marken-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})();",
          }}
        />
      </head>
      <body class="marken-body">
        <div class="marken-app">
          <header class="marken-header">
            <button type="button" class="marken-icon-btn marken-menu-tree-btn" data-action="toggle-tree" aria-label="Open document tree">
              <MenuIcon />
            </button>
            <a class="marken-site-title" href="/">
              <Logo />
              <span>{siteTitle}</span>
            </a>
            <div class="marken-header-spacer" />
            <Island name="search" className="marken-header-search">
              <SearchBox />
            </Island>
            <button type="button" class="marken-icon-btn marken-menu-outline-btn" data-action="toggle-outline" aria-label="Open page outline">
              <ListIcon />
            </button>
            <Menu docPath={docPath} />
          </header>

          <aside class="marken-side marken-side-left" data-side="left" aria-label="Navigation">
            <div class="marken-side-inner">
              <Tree tree={tree} currentPath={docPath} />
            </div>
          </aside>

          <main class="marken-main" id="main">
            <nav class="marken-breadcrumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((c, i) => (
                <>
                  {i > 0 && <span class="marken-breadcrumb-sep" aria-hidden="true">/</span>}
                  {i < breadcrumbs.length - 1 ? (
                    <a class="marken-breadcrumb" href={`/view/${encodePath(c.path)}`}>{c.label}</a>
                  ) : (
                    <span class="marken-breadcrumb is-current">{c.label}</span>
                  )}
                </>
              ))}
            </nav>

            <article
              class="marken-doc markdown-body"
              data-has-mermaid={hasMermaid ? 'true' : undefined}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />

            {(prev || next) && (
              <nav class="marken-pager" aria-label="Document navigation">
                {prev ? (
                  <a class="marken-pager-link is-prev" href={`/view/${encodePath(prev.path)}`}>
                    <span class="marken-pager-label">Previous</span>
                    <span class="marken-pager-title">{prev.label}</span>
                  </a>
                ) : <span />}
                {next ? (
                  <a class="marken-pager-link is-next" href={`/view/${encodePath(next.path)}`}>
                    <span class="marken-pager-label">Next</span>
                    <span class="marken-pager-title">{next.label}</span>
                  </a>
                ) : <span />}
              </nav>
            )}
          </main>

          <aside class="marken-side marken-side-right" data-side="right" aria-label="On this page">
            <div class="marken-side-inner">
              <Island name="outline" props={{ items: outline }}>
                <Outline items={outline} />
              </Island>
            </div>
          </aside>

          <div class="marken-scrim" data-action="close-drawers" aria-hidden="true" />
        </div>

        <script type="module" src={`/static/client.js${v}`} />
      </body>
    </html>
  )
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" class="marken-icon" aria-hidden="true">
      <path d="M1.75 3.5h12.5a.75.75 0 0 0 0-1.5H1.75a.75.75 0 0 0 0 1.5Zm0 5h12.5a.75.75 0 0 0 0-1.5H1.75a.75.75 0 0 0 0 1.5Zm0 5h12.5a.75.75 0 0 0 0-1.5H1.75a.75.75 0 0 0 0 1.5Z" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" class="marken-icon" aria-hidden="true">
      <path d="M2 4h12v1.5H2zm0 4h12v1.5H2zm0 4h8v1.5H2z" />
    </svg>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" class="marken-logo" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path
        d="M5 15V9l3 4 3-4v6M14 9v6M17 12l-3 3 3 3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  )
}

export interface NotFoundProps {
  siteTitle: string
  tree: TreeDirNode
  attemptedPath: string
  assetVersion: string
}

export function NotFoundPage({ siteTitle, tree, attemptedPath, assetVersion }: NotFoundProps) {
  const v = `?v=${assetVersion}`
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Not found — ${siteTitle}`}</title>
        <link rel="stylesheet" href={`/static/app.css${v}`} />
      </head>
      <body class="marken-body">
        <div class="marken-app marken-app-simple">
          <main class="marken-main">
            <h1>Document not found</h1>
            <p>
              <code>{attemptedPath}</code> doesn't exist in this vault.
            </p>
            <h2>Browse</h2>
            <Tree tree={tree} currentPath="" />
          </main>
        </div>
      </body>
    </html>
  )
}

export interface EmptyVaultProps {
  siteTitle: string
  vaultPath: string
}

export function EmptyVaultPage({ siteTitle, vaultPath }: EmptyVaultProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`No documents — ${siteTitle}`}</title>
        <link rel="stylesheet" href="/static/app.css" />
      </head>
      <body class="marken-body">
        <div class="marken-app marken-app-simple">
          <main class="marken-main">
            <h1>{siteTitle}</h1>
            <p>No Markdown files were found in the vault.</p>
            <p>
              Configured vault path: <code>{vaultPath}</code>
            </p>
            <p>
              Mount a directory containing <code>.md</code> files at that location
              (or set <code>MARKEN_VAULT_PATH</code> to point somewhere else) and reload.
            </p>
          </main>
        </div>
      </body>
    </html>
  )
}
