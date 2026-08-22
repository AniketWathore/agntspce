const SERVER_URL = 'http://127.0.0.1:9460'

let cachedToken: string | null | undefined

export async function getServerAuthToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken
  try {
    cachedToken = (await window.electronAPI?.getServerAuthToken?.()) || null
  } catch {
    cachedToken = null
  }
  return cachedToken
}

export async function apiHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getServerAuthToken()
  return token ? { ...extra, 'x-agntspce-token': token } : { ...extra }
}

// Synchronous variant for contexts that can't await. Returns cached token
// only (getServerAuthToken() primes the cache early via useSocket).
export function apiHeadersSync(extra: Record<string, string> = {}): Record<string, string> {
  return cachedToken ? { ...extra, 'x-agntspce-token': cachedToken } : { ...extra }
}

export { SERVER_URL }
