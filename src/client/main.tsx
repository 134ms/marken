import { hydrate, h, type FunctionComponent } from 'preact'
import './style.css'

import SearchBox from '../shared/components/SearchBox.js'
import Outline from '../shared/components/Outline.js'

const islands: Record<string, FunctionComponent<any>> = {
  search: SearchBox,
  outline: Outline,
}

function hydrateIslands() {
  document.querySelectorAll<HTMLElement>('[data-island]').forEach((el) => {
    const name = el.dataset.island
    if (!name) return
    const Component = islands[name]
    if (!Component) return
    let props: Record<string, unknown> = {}
    const encoded = el.dataset.props
    if (encoded) {
      try {
        props = JSON.parse(decodeURIComponent(encoded))
      } catch (err) {
        console.warn('[marken] failed to parse island props for', name, err)
      }
    }
    hydrate(h(Component, props), el)
  })
}

function wireDrawers() {
  const body = document.body
  const open = (which: 'left' | 'right') => {
    body.classList.add(`marken-drawer-${which}-open`)
    body.classList.remove(`marken-drawer-${which === 'left' ? 'right' : 'left'}-open`)
  }
  const closeAll = () => {
    body.classList.remove('marken-drawer-left-open', 'marken-drawer-right-open')
  }
  document.querySelectorAll('[data-action="toggle-tree"]').forEach((b) =>
    b.addEventListener('click', () => {
      const isOpen = body.classList.contains('marken-drawer-left-open')
      if (isOpen) closeAll()
      else open('left')
    }),
  )
  document.querySelectorAll('[data-action="toggle-outline"]').forEach((b) =>
    b.addEventListener('click', () => {
      const isOpen = body.classList.contains('marken-drawer-right-open')
      if (isOpen) closeAll()
      else open('right')
    }),
  )
  document.querySelectorAll('[data-action="close-drawers"]').forEach((b) =>
    b.addEventListener('click', closeAll),
  )
  // Auto-close drawers when a link inside is clicked.
  document.querySelectorAll('.marken-side a').forEach((a) =>
    a.addEventListener('click', () => closeAll()),
  )
  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll()
  })
}

function wireTheme() {
  const root = document.documentElement
  const apply = (theme: 'dark' | 'light') => {
    root.dataset.theme = theme
    try {
      localStorage.setItem('marken-theme', theme)
    } catch {
      /* ignore */
    }
    document.querySelectorAll<HTMLElement>('[data-theme-label]').forEach((el) => {
      el.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode'
    })
  }
  const current = (root.dataset.theme === 'dark' ? 'dark' : 'light') as 'dark' | 'light'
  apply(current)
  document.querySelectorAll<HTMLButtonElement>('[data-action="toggle-theme"]').forEach((b) =>
    b.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
      apply(next)
    }),
  )
}

function wireMenuDismiss() {
  // Close any open <details data-menu> on outside click.
  document.addEventListener('click', (e) => {
    document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]').forEach((d) => {
      if (!d.contains(e.target as Node)) d.open = false
    })
  })
}

function wireCopyLink() {
  document.querySelectorAll<HTMLButtonElement>('[data-action="copy-link"]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href)
        const original = b.innerText
        b.innerText = 'Copied!'
        setTimeout(() => {
          b.innerText = original
        }, 1200)
      } catch {
        /* ignore */
      }
    }),
  )
}

async function wireMermaid() {
  const blocks = document.querySelectorAll<HTMLElement>('[data-island="mermaid"]')
  if (blocks.length === 0) return
  const { default: mermaid } = await import('mermaid')
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default'
  mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' })
  for (const el of blocks) {
    const code = el.textContent ?? ''
    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
    try {
      const { svg } = await mermaid.render(id, code)
      el.innerHTML = svg
    } catch (e) {
      el.innerHTML = `<pre class="marken-mermaid-error">${String(e).replace(/[<>]/g, '')}</pre>`
    }
  }
}

function init() {
  hydrateIslands()
  wireDrawers()
  wireTheme()
  wireMenuDismiss()
  wireCopyLink()
  void wireMermaid()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
