import puppeteer from 'puppeteer-core'
const url = process.argv[2]
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'shell',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const urls = []
page.on('request', (r) => urls.push({ ok: '?', url: r.url() }))
page.on('requestfailed', (r) => urls.push({ ok: 'FAIL', url: r.url(), err: r.failure()?.errorText }))
page.on('requestfinished', (r) => {
  const e = urls.find((u) => u.url === r.url() && u.ok === '?')
  if (e) e.ok = String(r.response()?.status() ?? '?')
})
await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 500))
for (const u of urls) {
  if (u.url.includes('chunks') || /\.js(\?|$)/.test(u.url)) {
    console.log(u.ok.padEnd(6), u.url, u.err ? '  err=' + u.err : '')
  }
}
await browser.close()
