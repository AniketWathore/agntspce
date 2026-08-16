export const APP_VERSION = '0.1.0'

export const SERVER_PORT = 9460
export const MAX_PORT_RETRIES = 5
export const SERVER_HOST = '127.0.0.1'

export const MAX_JSON_BODY_SIZE = '1mb'

export const DEFAULT_MAX_CONCURRENT_SESSIONS = 8

export function getMaxConcurrentSessions(): number {
  try {
    const fs = require('node:fs')
    const path = require('node:path')
    const configFile = path.join(process.cwd(), 'config.json')
    if (fs.existsSync(configFile)) {
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'))
      const value = raw?.orchestration?.maxConcurrentSessions
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value)
      }
    }
  } catch {}
  return DEFAULT_MAX_CONCURRENT_SESSIONS
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  return origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
}
