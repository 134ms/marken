import type { ComponentChildren } from 'preact'

/**
 * Wraps a server-rendered component so the client can find and hydrate it.
 *
 * Props are URL-encoded JSON in a `data-props` attribute. Using an attribute
 * (instead of an inline `<script type="application/json">`) makes the
 * mechanism robust: HTML parsers always preserve attributes, whereas inline
 * JSON scripts have been observed to be stripped under specific HTTP
 * response configurations (notably Chrome over keep-alive without nosniff).
 */
export function Island({
  name,
  props,
  className,
  tag,
  children,
}: {
  name: string
  props?: unknown
  className?: string
  tag?: 'div' | 'aside' | 'nav' | 'section' | 'form'
  children?: ComponentChildren
}) {
  const Tag = (tag ?? 'div') as 'div'
  const encoded = encodeURIComponent(JSON.stringify(props ?? {}))
  const cls = `marken-island marken-island-${name}` + (className ? ` ${className}` : '')
  return (
    <Tag data-island={name} data-props={encoded} class={cls}>
      {children}
    </Tag>
  )
}
