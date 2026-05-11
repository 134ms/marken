import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const distStatic = resolve(root, 'dist/static')

await mkdir(distStatic, { recursive: true })

// Copy KaTeX CSS + fonts so we can self-host them and stay air-gapped.
const katexDist = resolve(root, 'node_modules/katex/dist')
if (existsSync(katexDist)) {
  await mkdir(resolve(distStatic, 'katex'), { recursive: true })
  await cp(resolve(katexDist, 'katex.min.css'), resolve(distStatic, 'katex/katex.min.css'))
  await cp(resolve(katexDist, 'fonts'), resolve(distStatic, 'katex/fonts'), { recursive: true })
} else {
  console.warn('[copy-static] katex not found in node_modules — skipping')
}

// Copy highlight.js github + github-dark themes for code blocks.
const hljsThemes = resolve(root, 'node_modules/highlight.js/styles')
if (existsSync(hljsThemes)) {
  await mkdir(resolve(distStatic, 'hljs'), { recursive: true })
  await cp(resolve(hljsThemes, 'github.css'), resolve(distStatic, 'hljs/github.css'))
  await cp(resolve(hljsThemes, 'github-dark.css'), resolve(distStatic, 'hljs/github-dark.css'))
}

console.log('[copy-static] done')
