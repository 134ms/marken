/**
 * Strip a YAML front-matter block (delimited by `---`) from the start of a
 * Markdown document and parse its top-level scalar keys.
 *
 * Front matter is what Obsidian / Hugo / Jekyll / Perlite call the
 * metadata block at the top of a `.md` file:
 *
 *     ---
 *     title: "My document"
 *     date: 2026-04-25
 *     tags: [a, b]
 *     ---
 *
 *     # body…
 *
 * This parser is intentionally tiny — it only understands top-level
 * `key: value` pairs and strips surrounding quotes. Anything more
 * structured (lists, nested maps, multiline strings) is ignored. Front
 * matter is removed from the body so it doesn't render as content.
 */

const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/

export interface FrontMatter {
  data: Record<string, string>
  body: string
}

export function stripFrontMatter(source: string): FrontMatter {
  const m = source.match(FRONT_MATTER_RE)
  if (!m) return { data: {}, body: source }
  const data = parseScalarKeys(m[1] ?? '')
  return { data, body: source.slice(m[0].length) }
}

function parseScalarKeys(yaml: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of yaml.split(/\r?\n/)) {
    // Skip blank lines, comments, list items, and indented (nested) entries.
    if (!line.trim() || line.startsWith('#') || /^[ \t]/.test(line) || line.trim().startsWith('-')) continue
    const km = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!km) continue
    let v = (km[2] ?? '').trim()
    // Strip an inline `# comment` if the value is unquoted.
    const isQuoted = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
    if (isQuoted) {
      v = v.slice(1, -1)
    } else {
      const c = v.indexOf(' #')
      if (c >= 0) v = v.slice(0, c).trim()
    }
    if (!v) continue
    out[km[1]!] = v
  }
  return out
}
