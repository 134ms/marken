import puppeteer from 'puppeteer-core'
const url = process.argv[2]
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'shell',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (err) => errors.push(err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('[console] ' + msg.text())
})

await page.goto(url, { waitUntil: 'networkidle0', timeout: 12000 }).catch((e) => errors.push('[goto] ' + e.message))
await new Promise((r) => setTimeout(r, 1200))

const report = await page.evaluate(() => {
  const merm = document.querySelector('[data-island="mermaid"]')
  const outline = document.querySelector('[data-island="outline"]')
  const outlineItems = outline?.querySelectorAll('.marken-outline-link').length ?? 0
  const outlineActive = outline?.querySelector('.marken-outline-item.is-active')?.textContent?.trim()
  const search = document.querySelector('[data-island="search"] input')
  const katexNodes = document.querySelectorAll('.katex').length
  const hljsTokens = document.querySelectorAll('[class^="hljs-"]').length
  const taskBoxes = document.querySelectorAll('input[type=checkbox]').length
  return {
    mermaidRenderedSvg: !!merm?.querySelector('svg'),
    mermaidContentSnippet: merm?.outerHTML?.slice(0, 120),
    outlineItems,
    outlineActive,
    searchInputPresent: !!search,
    katexNodes,
    hljsTokens,
    taskBoxes,
    docTitle: document.title,
  }
})
console.log('errors:', errors)
console.log('report:', JSON.stringify(report, null, 2))
await browser.close()
