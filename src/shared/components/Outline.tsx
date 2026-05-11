import { useEffect, useState } from 'preact/hooks'
import type { OutlineItem } from '../types.js'

export interface OutlineProps {
  items?: OutlineItem[]
}

/**
 * Server-renders a flat list of anchor links. After hydration, watches the
 * document scroll position and marks the heading currently in view.
 */
export default function Outline({ items = [] }: OutlineProps) {
  const [active, setActive] = useState<string | null>(items[0]?.slug ?? null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (items.length === 0) return
    const headings = items
      .map((i) => document.getElementById(i.slug))
      .filter((el): el is HTMLElement => !!el)
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry closest to the top that's visible.
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          setActive(visible[0]!.target.id)
          return
        }
        // None visible: pick the last one above the viewport.
        const above = entries
          .filter((e) => e.boundingClientRect.top < 0)
          .sort((a, b) => b.boundingClientRect.top - a.boundingClientRect.top)
        if (above[0]) setActive(above[0].target.id)
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )
    for (const h of headings) observer.observe(h)
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) {
    return (
      <nav class="marken-outline marken-outline-empty" aria-label="On this page">
        <p class="marken-outline-empty-msg">No headings on this page.</p>
      </nav>
    )
  }

  // Trim leading levels so the smallest heading present aligns to the left.
  const minLevel = items.reduce((m, i) => Math.min(m, i.level), 6)

  return (
    <nav class="marken-outline" aria-label="On this page">
      <h2 class="marken-outline-title">On this page</h2>
      <ul class="marken-outline-list">
        {items.map((item) => (
          <li
            class={`marken-outline-item lvl-${item.level - minLevel}${active === item.slug ? ' is-active' : ''}`}
          >
            <a class="marken-outline-link" href={`#${item.slug}`}>
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
