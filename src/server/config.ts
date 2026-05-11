import { resolve } from 'node:path'

const env = process.env

export const config = {
  vaultPath: resolve(env.MARKEN_VAULT_PATH ?? '/vault'),
  port: Number(env.PORT ?? env.MARKEN_PORT ?? 8080),
  host: env.MARKEN_HOST ?? '0.0.0.0',
  siteTitle: env.MARKEN_TITLE ?? 'Marken',
  staticRoot: env.MARKEN_STATIC_ROOT ?? 'dist/static',
}
