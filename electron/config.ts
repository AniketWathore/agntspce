export const APP_NAME = 'AgntSpce'
export const APP_VERSION = '0.1.0'

export const SERVER_PORT = 9460
export const MAX_PORT_RETRIES = 5
export const SERVER_HOST = '127.0.0.1'

export const MAX_JSON_BODY_SIZE = '1mb'

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  return origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
}
