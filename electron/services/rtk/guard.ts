import { estimateTokens } from './utils'

export function neverWorse(raw: string, filtered: string): string {
  if (estimateTokens(filtered) > estimateTokens(raw)) {
    return raw
  }
  return filtered
}
