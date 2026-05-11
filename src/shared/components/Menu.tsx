export interface MenuProps {
  /** vault-relative path of the current doc (without leading slash) */
  docPath: string
}

/**
 * The `⋮` dropdown. Implemented with `<details>` so it works without JS;
 * the client lightly enhances it (close on outside click).
 */
export default function Menu({ docPath }: MenuProps) {
  const encoded = docPath.split('/').map(encodeURIComponent).join('/')
  const basename = docPath.split('/').pop() ?? 'document.md'
  return (
    <details class="marken-menu" data-menu>
      <summary class="marken-menu-trigger" aria-label="More actions" title="More">
        <svg viewBox="0 0 16 16" width="18" height="18" class="marken-icon" aria-hidden="true">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </summary>
      <div class="marken-menu-panel" role="menu">
        <a class="marken-menu-item" role="menuitem" href={`/raw/${encoded}`} download={basename}>
          <DownloadIcon />
          <span>Download Markdown</span>
        </a>
        <button type="button" class="marken-menu-item" role="menuitem" data-action="copy-link">
          <LinkIcon />
          <span>Copy link</span>
        </button>
        <button type="button" class="marken-menu-item" role="menuitem" data-action="toggle-theme">
          <ThemeIcon />
          <span data-theme-label>Toggle theme</span>
        </button>
      </div>
    </details>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" class="marken-icon" aria-hidden="true">
      <path d="M7.47 10.78a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 0 0-1.06-1.06L8.75 8.44V1.75a.75.75 0 0 0-1.5 0v6.69L4.78 5.97a.75.75 0 0 0-1.06 1.06l3.75 3.75ZM3.75 13a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" class="marken-icon" aria-hidden="true">
      <path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 1 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 1 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z" />
    </svg>
  )
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" class="marken-icon" aria-hidden="true">
      <path d="M8 0a8 8 0 1 0 8 8A6.5 6.5 0 0 1 8 0Z" />
    </svg>
  )
}
