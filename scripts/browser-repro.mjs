import puppeteer from 'puppeteer-core'

const url = process.argv[2] || 'http://127.0.0.1:8084/view/guide/Markdown%20features.md'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'shell',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()

page.on('console', (msg) => console.log(`[console.${msg.type()}]`, msg.text()))
page.on('pageerror', (err) => console.log('[pageerror]', err.message, '\n', err.stack))
page.on('requestfailed', (req) => console.log('[reqfail]', req.url(), req.failure()?.errorText))
page.on('response', async (resp) => {
  if (resp.url() === url) {
    const buf = await resp.buffer()
    const fs = await import('node:fs/promises')
    await fs.writeFile('/tmp/marken-chrome-response.bin', buf)
    console.log('[response] saved', buf.length, 'bytes  headers:', resp.headers())
  }
})

await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 }).catch((e) => console.log('[goto]', e.message))

// Wait a bit for any async hydration / observers
await new Promise((r) => setTimeout(r, 800))

const parsedBody = await page.evaluate(() => document.body.innerHTML)
const parsedHead = await page.evaluate(() => document.head.innerHTML)
const allScripts = await page.evaluate(() =>
  Array.from(document.getElementsByTagName('script')).map((s) => ({
    type: s.type || '(none)',
    cls: s.className,
    parent: s.parentElement?.tagName,
    grandparent: s.parentElement?.parentElement?.tagName,
    snippet: (s.textContent || '').slice(0, 60),
  })),
)
const fs = await import('node:fs/promises')
await fs.writeFile('/tmp/marken-parsed-body.html', parsedBody)
await fs.writeFile('/tmp/marken-parsed-head.html', parsedHead)
console.log('parsed body length:', parsedBody.length)
console.log('parsed head length:', parsedHead.length)
console.log('ALL SCRIPTS in document (head+body):', JSON.stringify(allScripts, null, 2))

// Inspect post-load DOM
const summary = await page.evaluate(() => {
  const outline = document.querySelector('[data-island="outline"]')
  const search = document.querySelector('[data-island="search"]')
  // Where in the body does mermaid div live? Check its surroundings.
  const merm = document.querySelector('[data-island="mermaid"]')
  // Look at *all* scripts in the body
  const scripts = Array.from(document.querySelectorAll('script')).map((s) => ({
    type: s.type || '(none)',
    cls: s.className,
    parent: s.parentElement?.tagName + (s.parentElement?.className ? '.' + s.parentElement.className.replace(/\s.*/, '') : ''),
    contentSnippet: (s.textContent || '').slice(0, 60),
  }))
  return {
    bodyHTMLLength: document.body.innerHTML.length,
    scriptsInDoc: scripts,
    outlineHTML: outline?.outerHTML,
    mermHTML: merm?.outerHTML?.slice(0, 200),
    mermNext: merm?.nextElementSibling?.tagName,
    mermParent: merm?.parentElement?.tagName,
  }
})
console.log('--- DOM summary ---')
console.log(JSON.stringify(summary, null, 2))

await browser.close()
