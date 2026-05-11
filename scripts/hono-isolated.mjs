import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'

const body = await readFile('/tmp/feats.html', 'utf8')
console.log('body length:', body.length)
const app = new Hono()
// Vary handlers across ports to test different framings
const port = Number(process.env.P || 9997)
const mode = process.env.M || 'default'
app.get('/', (c) => {
  if (mode === 'close') c.header('Connection', 'close')
  if (mode === 'nosniff') c.header('X-Content-Type-Options', 'nosniff')
  return c.html(body)
})
serve({ fetch: app.fetch, port }, () => console.log(`hono ${mode} on ${port}`))
