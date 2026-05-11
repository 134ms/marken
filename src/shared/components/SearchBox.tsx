import { useEffect, useRef, useState } from 'preact/hooks'
import type { SearchHit } from '../types.js'

export interface SearchBoxProps {
  /** Placeholder when the input is empty */
  placeholder?: string
}

export default function SearchBox({ placeholder = 'Search…' }: SearchBoxProps) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const ctrlRef = useRef<AbortController | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (!r.ok) throw new Error(`${r.status}`)
        const data = (await r.json()) as SearchHit[]
        setHits(data)
        setHighlight(0)
        setLoading(false)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setHits([])
        setLoading(false)
      }
    }, 150)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        rootRef.current?.querySelector<HTMLInputElement>('input')?.focus()
      }
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const navigate = (path: string) => {
    window.location.href = `/view/${path.split('/').map(encodeURIComponent).join('/')}`
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, Math.max(hits.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && hits[highlight]) {
      e.preventDefault()
      navigate(hits[highlight]!.path)
    } else if (e.key === 'Escape') {
      setOpen(false)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div class="marken-search-root" ref={rootRef}>
      <div class="marken-search-input-wrap">
        <SearchIcon />
        <input
          class="marken-search-input"
          type="search"
          spellcheck={false}
          autocomplete="off"
          placeholder={placeholder}
          value={q}
          onFocus={() => setOpen(true)}
          onInput={(e) => {
            setQ((e.target as HTMLInputElement).value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          aria-label="Search documents"
        />
        <kbd class="marken-search-kbd" aria-hidden="true">/</kbd>
      </div>
      {open && q.trim() !== '' && (
        <div class="marken-search-results" role="listbox">
          {loading && <div class="marken-search-status">Searching…</div>}
          {!loading && hits.length === 0 && <div class="marken-search-status">No results.</div>}
          {hits.map((h, i) => (
            <button
              type="button"
              class={`marken-search-hit${i === highlight ? ' is-active' : ''}`}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => navigate(h.path)}
            >
              <span class="marken-search-hit-title">{h.title}</span>
              <span class="marken-search-hit-path">{h.path.replace(/\.md$/i, '')}</span>
              {h.snippet && <span class="marken-search-hit-snippet">{h.snippet}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg class="marken-icon marken-search-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1ZM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
    </svg>
  )
}
