interface SkipRule {
  pattern: RegExp
}

interface ReplaceRule {
  pattern: RegExp
  replacement: string
}

interface MatchOutputRule {
  contains?: string
  pattern?: RegExp
  output: string
  unless?: string
}

export interface FilterConfig {
  name: string
  commandPattern?: RegExp
  stripAnsi?: boolean
  trimLines?: boolean
  stripEmpty?: boolean
  collapseEmpty?: boolean
  skip?: SkipRule[]
  keep?: RegExp[]
  dedup?: boolean
  dedupWindow?: number
  head?: number
  tail?: number
  maxLines?: number
  truncateLinesAt?: number
  replace?: ReplaceRule[]
  matchOutput?: MatchOutputRule[]
  stripProgressBars?: boolean
}

export interface FilterEvent {
  sessionId: string
  original: string
  filtered: string
  originalBytes: number
  filteredBytes: number
  originalTokens: number
  filteredTokens: number
  reduction: number
  rulesApplied: string[]
}

export interface FilterStats {
  totalOriginalBytes: number
  totalFilteredBytes: number
  totalOriginalTokens: number
  totalFilteredTokens: number
  eventsProcessed: number
}

const DEFAULT_CONFIGS: FilterConfig[] = [
  {
    name: 'default',
    stripAnsi: true,
    trimLines: true,
    collapseEmpty: true,
    stripEmpty: true,
    stripProgressBars: true,
    dedup: true,
    truncateLinesAt: 2000,
    maxLines: 500,
  },
  {
    name: 'git-status',
    commandPattern: /git\s+status/i,
    stripAnsi: true,
    trimLines: true,
    collapseEmpty: true,
    stripEmpty: true,
    dedup: true,
    head: 80,
    truncateLinesAt: 500,
  },
  {
    name: 'test-runner',
    commandPattern: /(npm test|pytest|go test|cargo test|jest|vitest|ruff|tsc)/i,
    stripAnsi: true,
    trimLines: true,
    collapseEmpty: true,
    stripEmpty: true,
    dedup: true,
    tail: 100,
    truncateLinesAt: 500,
    replace: [
      { pattern: /✓|✔|√|\x1b\[32m/g, replacement: 'PASS' },
      { pattern: /✗|✘|×|\x1b\[31m/g, replacement: 'FAIL' },
    ],
  },
  {
    name: 'linter',
    commandPattern: /(eslint|prettier|ruff\s+check|tsc\s+--noEmit)/i,
    stripAnsi: true,
    trimLines: true,
    collapseEmpty: true,
    stripEmpty: true,
    dedup: true,
    maxLines: 200,
    truncateLinesAt: 300,
  },
]

export class OutputFilterService {
  private configs: FilterConfig[]
  private sessionConfigs = new Map<string, FilterConfig>()
  private sessionHistory = new Map<string, FilterEvent[]>()
  private sessionStats = new Map<string, FilterStats>()
  private lastLines = new Map<string, string>()
  private dedupWindows = new Map<string, string[]>()
  private onEvent: ((event: FilterEvent) => void) | null = null
  private commandCounters = new Map<string, number>()

  static readonly MAX_HISTORY = 200

  constructor(customConfigs?: FilterConfig[]) {
    this.configs = customConfigs ?? DEFAULT_CONFIGS
  }

  setOnEvent(cb: (event: FilterEvent) => void) {
    this.onEvent = cb
  }

  setSessionConfig(sessionId: string, config: FilterConfig) {
    this.sessionConfigs.set(sessionId, config)
  }

  processOutput(sessionId: string, data: string): FilterEvent | null {
    const config = this.sessionConfigs.get(sessionId)
    if (!config) {
      return null
    }

    const rulesApplied: string[] = []
    let filtered = data

    if (config.stripAnsi) {
      const before = filtered.length
      filtered = filtered.replace(/\u001b\[\d+(;\d+)*[A-Za-z]/g, '')
        .replace(/\u001b\][\s\S]*?\u0007/g, '')
        .replace(/\u001b[[\](]<.+?>|[\x00-\x08\x0B-\x1F\x7F]/g, '')
      if (filtered.length !== before) rulesApplied.push('stripAnsi')
    }

    if (config.replace) {
      for (const rule of config.replace) {
        const before = filtered
        filtered = filtered.replace(rule.pattern, rule.replacement)
        if (filtered !== before) rulesApplied.push(`replace:${rule.pattern.source}`)
      }
    }

    let lines = filtered.split('\n')

    if (config.stripProgressBars) {
      const before = lines.length
      lines = lines.filter(l => !l.includes('\r') || l.trim().length > 0)
      lines = lines.filter(l => {
        const trimmed = l.trim()
        return !(/^[\d]+\/[\d]+/.test(trimmed) && trimmed.length < 60 && /[\d.]+%/.test(trimmed))
      })
      if (lines.length !== before && lines.length !== before) rulesApplied.push('stripProgressBars')
    }

    if (config.trimLines) {
      const before = lines.map(l => l.length).reduce((a, b) => a + b, 0)
      lines = lines.map(l => l.trimEnd())
      const after = lines.map(l => l.length).reduce((a, b) => a + b, 0)
      if (before !== after) rulesApplied.push('trimLines')
    }

    const lastLine = this.lastLines.get(sessionId)
    if (lastLine !== undefined && lines.length > 0) {
      lines[0] = lastLine + lines[0]
    }

    if (config.dedup) {
      const window = config.dedupWindow ?? 0
      const dw = this.dedupWindows.get(sessionId) || []
      const before = lines.length
      const newLines: string[] = []
      for (const line of lines) {
        if (window === 0) {
          if (newLines.length === 0 || line !== newLines[newLines.length - 1]) {
            newLines.push(line)
          }
        } else {
          if (!dw.includes(line)) {
            newLines.push(line)
          }
          dw.push(line)
          if (dw.length > window) dw.shift()
        }
      }
      this.dedupWindows.set(sessionId, dw)
      lines = newLines
      if (lines.length !== before) rulesApplied.push('dedup')
    }

    if (config.skip) {
      const before = lines.length
      lines = lines.filter(line => !config.skip!.some(rule => rule.pattern.test(line)))
      if (lines.length !== before) rulesApplied.push('skip')
    }

    if (config.keep) {
      const before = lines.length
      lines = lines.filter(line => config.keep!.some(pattern => pattern.test(line)))
      if (lines.length !== before) rulesApplied.push('keep')
    }

    this.lastLines.set(sessionId, lines.length > 0 ? lines[lines.length - 1] : '')

    if (config.stripEmpty) {
      const before = lines.length
      lines = lines.filter(l => l.trim().length > 0)
      if (lines.length !== before) rulesApplied.push('stripEmpty')
    } else if (config.collapseEmpty) {
      const before = lines.length
      lines = collapseEmptyLines(lines)
      if (lines.length !== before) rulesApplied.push('collapseEmpty')
    }

    if (config.head !== undefined && lines.length > config.head) {
      rulesApplied.push(`head:${config.head}`)
      lines = lines.slice(0, config.head)
    }

    if (config.tail !== undefined && lines.length > config.tail) {
      rulesApplied.push(`tail:${config.tail}`)
      lines = lines.slice(-config.tail)
    }

    if (config.maxLines !== undefined && lines.length > config.maxLines) {
      rulesApplied.push(`maxLines:${config.maxLines}`)
      lines = lines.slice(0, config.maxLines)
    }

    if (config.truncateLinesAt !== undefined) {
      const before = lines.map(l => l.length).reduce((a, b) => a + b, 0)
      lines = lines.map(l => l.length > config.truncateLinesAt! ? l.slice(0, config.truncateLinesAt!) + '…' : l)
      const after = lines.map(l => l.length).reduce((a, b) => a + b, 0)
      if (before !== after) rulesApplied.push(`truncateLinesAt:${config.truncateLinesAt}`)
    }

    if (config.matchOutput) {
      const combined = lines.join('\n')
      for (const rule of config.matchOutput) {
        let matched = false
        if (rule.contains && combined.includes(rule.contains)) matched = true
        if (rule.pattern && rule.pattern.test(combined)) matched = true
        if (matched && rule.unless && combined.includes(rule.unless)) matched = false
        if (matched) {
          const replacement = rule.output
            .replace('{lines}', String(lines.length))
            .replace('{bytes}', String(combined.length))
          lines = replacement.split('\n')
          rulesApplied.push(`matchOutput:${rule.output.slice(0, 40)}`)
          break
        }
      }
    }

    filtered = lines.join('\n')

    if (filtered === data) {
      return null
    }

    const originalTokens = estimateTokens(data)
    const filteredTokens = estimateTokens(filtered)
    const reduction = originalTokens > 0
      ? Math.round((1 - filteredTokens / originalTokens) * 10000) / 100
      : 0

    const event: FilterEvent = {
      sessionId,
      original: data,
      filtered,
      originalBytes: data.length,
      filteredBytes: filtered.length,
      originalTokens,
      filteredTokens,
      reduction,
      rulesApplied: [...new Set(rulesApplied)],
    }

    const hist = this.sessionHistory.get(sessionId) || []
    hist.push(event)
    if (hist.length > OutputFilterService.MAX_HISTORY) hist.shift()
    this.sessionHistory.set(sessionId, hist)

    const stats = this.sessionStats.get(sessionId) || {
      totalOriginalBytes: 0, totalFilteredBytes: 0,
      totalOriginalTokens: 0, totalFilteredTokens: 0,
      eventsProcessed: 0,
    }
    stats.totalOriginalBytes += event.originalBytes
    stats.totalFilteredBytes += event.filteredBytes
    stats.totalOriginalTokens += event.originalTokens
    stats.totalFilteredTokens += event.filteredTokens
    stats.eventsProcessed += 1
    this.sessionStats.set(sessionId, stats)

    const counter = (this.commandCounters.get(sessionId) || 0) + 1
    this.commandCounters.set(sessionId, counter)

    this.onEvent?.(event)

    return event
  }

  getSessionStats(sessionId: string): FilterStats | null {
    return this.sessionStats.get(sessionId) ?? null
  }

  getSessionHistory(sessionId: string): FilterEvent[] {
    return this.sessionHistory.get(sessionId) ?? []
  }

  getAllStats(): { sessionId: string; stats: FilterStats }[] {
    const result: { sessionId: string; stats: FilterStats }[] = []
    for (const [sessionId, stats] of this.sessionStats) {
      result.push({ sessionId, stats })
    }
    return result
  }

  getAllHistory(): FilterEvent[] {
    const all: FilterEvent[] = []
    for (const [, hist] of this.sessionHistory) {
      for (let i = hist.length - 1; i >= 0; i--) {
        all.push(hist[i])
      }
    }
    return all
  }

  cleanup(sessionId: string) {
    this.sessionConfigs.delete(sessionId)
    this.sessionHistory.delete(sessionId)
    this.sessionStats.delete(sessionId)
    this.lastLines.delete(sessionId)
    this.dedupWindows.delete(sessionId)
    this.commandCounters.delete(sessionId)
  }

  reset() {
    this.sessionConfigs.clear()
    this.sessionHistory.clear()
    this.sessionStats.clear()
    this.lastLines.clear()
    this.dedupWindows.clear()
    this.commandCounters.clear()
  }
}

function collapseEmptyLines(lines: string[]): string[] {
  const result: string[] = []
  let prevEmpty = false
  for (const line of lines) {
    const isEmpty = line.trim().length === 0
    if (isEmpty && prevEmpty) continue
    result.push(line)
    prevEmpty = isEmpty
  }
  return result
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
