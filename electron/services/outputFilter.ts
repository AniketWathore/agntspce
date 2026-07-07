import { getRegistry, getTracker, detectCommand, filterCommandOutput, estimateTokens, neverWorse, TimedExecution, type FilterDefinition } from './rtk'

interface SkipRule { pattern: RegExp }
interface ReplaceRule { pattern: RegExp; replacement: string }
interface MatchOutputRule { contains?: string; pattern?: RegExp; output: string; unless?: string }

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

export interface CommandEvent {
  sessionId: string
  command: string
  args: string[]
  rawOutput: string
  filteredOutput: string
  filterName: string | null
  originalTokens: number
  filteredTokens: number
  reduction: number
  exitCode: number | null
  duration: number
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
  private onCommandEvent: ((event: CommandEvent) => void) | null = null
  private commandCounters = new Map<string, number>()

  private commandBuffers = new Map<string, { command: string; args: string[]; output: string; startTime: number; exitCode: number | null }>()
  private inputBuffer = new Map<string, string>()
  private finalizeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private rtkSessions = new Set<string>()

  static readonly MAX_HISTORY = 200
  static readonly AUTO_FINALIZE_DELAY = 3000

  constructor(customConfigs?: FilterConfig[]) {
    this.configs = customConfigs ?? DEFAULT_CONFIGS
  }

  enableRtk(sessionId: string): void {
    this.rtkSessions.add(sessionId)
  }

  disableRtk(sessionId: string): void {
    this.rtkSessions.delete(sessionId)
  }

  isRtkActive(sessionId: string): boolean {
    return this.rtkSessions.has(sessionId)
  }

  private scheduleFinalize(sessionId: string): void {
    if (!this.rtkSessions.has(sessionId)) return
    this.clearFinalizeTimer(sessionId)
    const timer = setTimeout(() => {
      this.finalizeCommand(sessionId, 0)
    }, OutputFilterService.AUTO_FINALIZE_DELAY)
    this.finalizeTimers.set(sessionId, timer)
  }

  private clearFinalizeTimer(sessionId: string): void {
    const existing = this.finalizeTimers.get(sessionId)
    if (existing) {
      clearTimeout(existing)
      this.finalizeTimers.delete(sessionId)
    }
  }

  setOnEvent(cb: (event: FilterEvent) => void) {
    this.onEvent = cb
  }

  setOnCommandEvent(cb: (event: CommandEvent) => void) {
    this.onCommandEvent = cb
  }

  setSessionConfig(sessionId: string, config: FilterConfig) {
    this.sessionConfigs.set(sessionId, config)
  }

  trackInput(sessionId: string, input: string): void {
    if (!this.rtkSessions.has(sessionId)) return
    const prev = this.inputBuffer.get(sessionId) || ''
    const full = prev + input
    this.inputBuffer.set(sessionId, full)
    const lines = full.split('\n')
    if (lines.length > 1) {
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim()
        this.processCommandLine(sessionId, line)
      }
      this.inputBuffer.set(sessionId, lines[lines.length - 1])
    }

    if (full.length > 10000) {
      this.inputBuffer.set(sessionId, full.slice(-5000))
    }
  }

  private detectShellPrompt(text: string): boolean {
    const promptPatterns = [
      /^\$\s*$/m, /^%\s*$/m, /^#\s*$/m,
      /^[\w@~][\w.-]*[:/][\w.-]*(?:\$|%|#)\s*/m,
      /^\([\w.-]+\)\s*\$\s*/m,
      /^λ\s*/m,
      /^❯\s*/m,
      /^➜\s*/m,
    ]
    return promptPatterns.some(p => p.test(text))
  }

  private processCommandLine(sessionId: string, line: string): void {
    if (!line || line.startsWith('#') || line.startsWith('//')) return
    const promptMatch = line.match(/[$#%❯➜λ]\s*(.+)/)
    const cmdStr = promptMatch ? promptMatch[1].trim() : line.trim()
    if (!cmdStr) return
    const detected = detectCommand(cmdStr)
    if (!detected) return
    const { command, args } = detected

    const existing = this.commandBuffers.get(sessionId)
    if (existing && existing.exitCode === null) {
      existing.exitCode = null
    }

    this.commandBuffers.set(sessionId, {
      command,
      args,
      output: '',
      startTime: Date.now(),
      exitCode: null,
    })
  }

  processOutput(sessionId: string, data: string): FilterEvent | null {
    const cmdBuf = this.commandBuffers.get(sessionId)
    if (cmdBuf && cmdBuf.exitCode === null) {
      cmdBuf.output += data
      if (cmdBuf.output.length > 500000) {
        cmdBuf.output = cmdBuf.output.slice(-500000)
      }
      this.scheduleFinalize(sessionId)
    }

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
      if (lines.length !== before) rulesApplied.push('stripProgressBars')
    }

    if (config.trimLines) {
      const before = lines.reduce((a, l) => a + l.length, 0)
      lines = lines.map(l => l.trimEnd())
      const after = lines.reduce((a, l) => a + l.length, 0)
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
      const before = lines.reduce((a, l) => a + l.length, 0)
      lines = lines.map(l => l.length > config.truncateLinesAt! ? l.slice(0, config.truncateLinesAt!) + '…' : l)
      const after = lines.reduce((a, l) => a + l.length, 0)
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
          lines = rule.output.replace('{lines}', String(lines.length)).replace('{bytes}', String(combined.length)).split('\n')
          rulesApplied.push(`matchOutput:${rule.output.slice(0, 40)}`)
          break
        }
      }
    }

    filtered = lines.join('\n')

    if (rulesApplied.length === 0) {
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

  finalizeCommand(sessionId: string, exitCode: number | null = null): CommandEvent | null {
    const cmdBuf = this.commandBuffers.get(sessionId)
    if (!cmdBuf) return null

    cmdBuf.exitCode = exitCode
    const rawOutput = cmdBuf.output
    const cmdStr = `${cmdBuf.command} ${cmdBuf.args.join(' ')}`.trim()

    const rtkFiltered = filterCommandOutput(cmdStr, rawOutput)
    const filtered = neverWorse(rawOutput, rtkFiltered.filtered)

    const originalTokens = estimateTokens(rawOutput)
    const filteredTokens = estimateTokens(filtered)
    const reduction = originalTokens > 0
      ? Math.round((1 - filteredTokens / originalTokens) * 10000) / 100
      : 0

    const event: CommandEvent = {
      sessionId,
      command: cmdBuf.command,
      args: cmdBuf.args,
      rawOutput,
      filteredOutput: filtered,
      filterName: rtkFiltered.filterName,
      originalTokens,
      filteredTokens,
      reduction,
      exitCode: cmdBuf.exitCode,
      duration: Date.now() - cmdBuf.startTime,
    }

    const tracker = getTracker()
    tracker.record(
      cmdStr,
      rtkFiltered.filterName ? `${cmdBuf.command} (filtered)` : cmdStr,
      originalTokens,
      filteredTokens,
      event.duration,
    )

    this.addToCommandHistory(event)
    this.onCommandEvent?.(event)

    this.commandBuffers.delete(sessionId)
    return event
  }

  addCustomFilter(name: string, def: FilterDefinition): void {
    getRegistry().addFilter(name, def)
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

  getCommandHistory(sessionId: string): CommandEvent[] {
    return this._commandHistory.get(sessionId) || []
  }

  getAllCommandHistory(): CommandEvent[] {
    const all: CommandEvent[] = []
    for (const [, hist] of this._commandHistory) {
      all.push(...hist)
    }
    return all
  }

  private _commandHistory = new Map<string, CommandEvent[]>()

  private addToCommandHistory(event: CommandEvent): void {
    const hist = this._commandHistory.get(event.sessionId) || []
    hist.push(event)
    if (hist.length > 200) hist.shift()
    this._commandHistory.set(event.sessionId, hist)
  }

  cleanup(sessionId: string) {
    this.sessionConfigs.delete(sessionId)
    this.sessionHistory.delete(sessionId)
    this.sessionStats.delete(sessionId)
    this.lastLines.delete(sessionId)
    this.dedupWindows.delete(sessionId)
    this.commandCounters.delete(sessionId)
    this.commandBuffers.delete(sessionId)
    this.inputBuffer.delete(sessionId)
    this._commandHistory.delete(sessionId)
  }

  reset() {
    this.sessionConfigs.clear()
    this.sessionHistory.clear()
    this.sessionStats.clear()
    this.lastLines.clear()
    this.dedupWindows.clear()
    this.commandCounters.clear()
    this.commandBuffers.clear()
    this.inputBuffer.clear()
    this._commandHistory.clear()
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
