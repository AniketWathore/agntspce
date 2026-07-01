import { compress, decompress, compressDebug, getStats } from './caveman'
import type { CompressionDebug } from './caveman'

interface ReductionConfig {
  enabled: boolean
  compressInput: boolean
  compressOutput: boolean
}

const DEFAULT_CONFIG: ReductionConfig = {
  enabled: false,
  compressInput: true,
  compressOutput: false,
}

interface CumulativeStats {
  totalOriginalChars: number
  totalCompressedChars: number
  totalOriginalTokens: number
  totalCompressedTokens: number
  linesCompressed: number
}

const MAX_HISTORY = 100

export interface CompressionEvent {
  sessionId: string
  stats: {
    originalChars: number
    compressedChars: number
    originalTokens: number
    compressedTokens: number
    reduction: number
    charsSaved: number
    tokensSaved: number
  }
  cumulative: CumulativeStats
  debug: CompressionDebug
}

export class TokenReductionService {
  private configs = new Map<string, ReductionConfig>()
  private lineBuffers = new Map<string, string>()
  private cumulativeStats = new Map<string, CumulativeStats>()
  private history = new Map<string, CompressionDebug[]>()
  private onCompression: ((event: CompressionEvent) => void) | null = null

  setOnCompression(cb: (event: CompressionEvent) => void) {
    this.onCompression = cb
  }

  getConfig(sessionId: string): ReductionConfig {
    return this.configs.get(sessionId) ?? { ...DEFAULT_CONFIG }
  }

  setConfig(sessionId: string, config: Partial<ReductionConfig>) {
    const current = this.getConfig(sessionId)
    this.configs.set(sessionId, { ...current, ...config })
  }

  setEnabled(sessionId: string, enabled: boolean) {
    this.setConfig(sessionId, { enabled })
  }

  toggle(sessionId: string): boolean {
    const current = this.getConfig(sessionId)
    this.setConfig(sessionId, { enabled: !current.enabled })
    return !current.enabled
  }

  // Process input before sending to PTY
  processInput(sessionId: string, data: string): string {
    const config = this.getConfig(sessionId)
    if (!config.enabled || !config.compressInput) return data

    const buffer = this.lineBuffers.get(sessionId) || ''

    // Check if this is a newline (Enter key)
    if (data === '\r' || data === '\n') {
      if (buffer.trim().length > 0) {
        const debug = compressDebug(buffer.trim())
        const compressed = debug.compressed
        const origStats = getStats(buffer.trim(), compressed)

        // Store debug record
        const hist = this.history.get(sessionId) || []
        hist.push(debug)
        if (hist.length > MAX_HISTORY) hist.shift()
        this.history.set(sessionId, hist)

        // Update cumulative stats
        const cum = this.cumulativeStats.get(sessionId) || {
          totalOriginalChars: 0,
          totalCompressedChars: 0,
          totalOriginalTokens: 0,
          totalCompressedTokens: 0,
          linesCompressed: 0,
        }
        cum.totalOriginalChars += debug.originalChars
        cum.totalCompressedChars += debug.compressedChars
        cum.totalOriginalTokens += debug.originalTokens
        cum.totalCompressedTokens += debug.compressedTokens
        cum.linesCompressed += 1
        this.cumulativeStats.set(sessionId, cum)

        // Notify listener
        if (this.onCompression) {
          this.onCompression({
            sessionId,
            stats: {
              originalChars: debug.originalChars,
              compressedChars: debug.compressedChars,
              originalTokens: debug.originalTokens,
              compressedTokens: debug.compressedTokens,
              reduction: debug.reduction,
              charsSaved: debug.originalChars - debug.compressedChars,
              tokensSaved: debug.originalTokens - debug.compressedTokens,
            },
            cumulative: { ...cum },
            debug,
          })
        }

        this.lineBuffers.set(sessionId, '')
        return compressed + '\r'
      }
      return data
    }

    // Handle backspace
    if (data === '\x7f' || data === '\b') {
      this.lineBuffers.set(sessionId, buffer.slice(0, -1))
      return data
    }

    // Buffer character for line-based compression
    this.lineBuffers.set(sessionId, buffer + data)
    return data
  }

  // Process output from PTY before sending to client
  processOutput(sessionId: string, data: string): string {
    const config = this.getConfig(sessionId)
    if (!config.enabled || !config.compressOutput) return data
    return decompress(data)
  }

  getSessionStats(sessionId: string): CumulativeStats {
    return this.cumulativeStats.get(sessionId) ?? {
      totalOriginalChars: 0,
      totalCompressedChars: 0,
      totalOriginalTokens: 0,
      totalCompressedTokens: 0,
      linesCompressed: 0,
    }
  }

  getSessionHistory(sessionId: string): CompressionDebug[] {
    return this.history.get(sessionId) ?? []
  }

  getAllStats(): { sessionId: string; stats: CumulativeStats }[] {
    const result: { sessionId: string; stats: CumulativeStats }[] = []
    for (const [sessionId, stats] of this.cumulativeStats) {
      result.push({ sessionId, stats })
    }
    return result
  }

  clearBuffer(sessionId: string) {
    this.lineBuffers.delete(sessionId)
  }

  cleanup(sessionId: string) {
    this.configs.delete(sessionId)
    this.lineBuffers.delete(sessionId)
    this.cumulativeStats.delete(sessionId)
    this.history.delete(sessionId)
  }
}
