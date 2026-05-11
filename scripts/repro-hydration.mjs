// Repro: load the rendered page into happy-dom, execute the client bundle,
// and surface the actual hydration error with a sourcemapped stack.
import { Window } from 'happy-dom'
import { readFile } from 'node:fs/promises'

const html = await (await fetch('http://127.0.0.1:8084/view/guide/Markdown%20features.md')).text()

const win = new Window({ url: 'http://127.0.0.1:8084/view/guide/Markdown%20features.md' })
const doc = win.document
doc.documentElement.innerHTML = html.replace(/^<!DOCTYPE html>/i, '')

// Stub IntersectionObserver
win.IntersectionObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
}

// Capture console
const origError = console.error
win.console = {
  log: (...a) => console.log('[page log]', ...a),
  warn: (...a) => console.warn('[page warn]', ...a),
  error: (...a) => console.error('[page err]', ...a),
}

process.on('uncaughtException', (e) => {
  origError('UNCAUGHT:', e)
})

console.log('readyState before script:', doc.readyState)
console.log('outline islands present:', doc.querySelectorAll('[data-island="outline"]').length)
console.log('script.marken-island-props found:', doc.querySelector('[data-island="outline"] script.marken-island-props')?.textContent?.slice(0, 60))

const raw = await readFile('dist/static/client.js', 'utf8')
const clientSrc = raw.replace(/export\s*\{[^}]*\}\s*;?\s*$/, '')

try {
  win.eval(clientSrc)
  console.log('script eval ok')
} catch (err) {
  console.error('THREW (sync):', err?.message)
  console.error(err?.stack)
}

// If init() registered for DOMContentLoaded, fire it manually.
doc.dispatchEvent(new win.Event('DOMContentLoaded'))

await new Promise((r) => setTimeout(r, 200))

// Inspect post-hydration DOM
const ol = doc.querySelector('[data-island="outline"]')
console.log('after: outline div children:', ol?.children?.length, 'first tag:', ol?.children?.[0]?.tagName)
console.log('done')
