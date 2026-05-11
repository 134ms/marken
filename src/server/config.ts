import { resolve } from 'node:path'

const env = process.env

function parseNonNegativeInt(raw: string | undefined): number {
  if (!raw) return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

export const config = {
  vaultPath: resolve(env.MARKEN_VAULT_PATH ?? '/vault'),
  port: Number(env.PORT ?? env.MARKEN_PORT ?? 8080),
  host: env.MARKEN_HOST ?? '0.0.0.0',
  siteTitle: env.MARKEN_TITLE ?? 'Marken',
  staticRoot: env.MARKEN_STATIC_ROOT ?? 'dist/static',
  /** Bearer token required for `/api/*` write endpoints. Empty disables them. */
  apiToken: env.MARKEN_API_TOKEN ?? '',
  /** Periodic full rescan interval in seconds. 0 disables polling. */
  rescanIntervalSeconds: parseNonNegativeInt(env.MARKEN_RESCAN_INTERVAL),
}
