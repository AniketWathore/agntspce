import { filterCommandOutput, hasSpecificFilter, estimateTokens, stripAllControl } from './rtk'
import { formatCommand } from './rtk/formatter'
import fs from 'fs'
import path from 'path'

const LOG_FILE = '/tmp/agntspce-filter.log'
function debugLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    fs.appendFileSync(LOG_FILE, line)
  } catch {}
}

interface CumulativeStats {
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
  formatted: string
  rawOutput: string
  filteredOutput: string
  originalTokens: number
  filteredTokens: number
  reduction: number
  exitCode: number | null
  duration: number
  timestamp: number
  filterName?: string
}

const AGNTSPCE_CMD_RE = /^agntspce\s+\$\s+(.+)$/
const AGNTSPCE_STATS_RE = /^AGNTSPCE_STATS raw=(\d+) filtered=(\d+)$/
const SHELL_CMD_RE = /[$#%❯➜]\s+(.+)$/
const SHELL_ECHO_RE = /^\$\s+agntspce\s+run\s+/
export class OutputFilterService {
  private commandBuffers = new Map<string, {
    command: string
    args: string[]
    rawOutput: string
    startTime: number
    exitCode: number | null
  }>()
  private lineBuffer = new Map<string, string>()
  private outputAccum = new Map<string, string[]>()
  private insideCommand = new Map<string, boolean>()
  private finalizeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private onCommandEvent: ((event: CommandEvent) => void) | null = null
  private _commandHistory = new Map<string, CommandEvent[]>()
  private _pendingStats = new Map<string, { rawTokens: number; filteredTokens: number }>()
  private _recentTokenReports = new Map<string, number>() // key: "raw-filtered" → timestamp
  private _cumulativeStats: CumulativeStats = { totalOriginalBytes: 0, totalFilteredBytes: 0, totalOriginalTokens: 0, totalFilteredTokens: 0, eventsProcessed: 0 }
  private _statsFilePath: string = ''

  constructor(dataDir?: string) {
    if (dataDir) {
      this._statsFilePath = path.join(dataDir, 'filter-stats.json')
      this._loadCumulativeStats()
    }
  }

  private _loadCumulativeStats() {
    if (!this._statsFilePath) return
    try {
      const data = fs.readFileSync(this._statsFilePath, 'utf-8')
      const parsed = JSON.parse(data)
      this._cumulativeStats = {
        totalOriginalBytes: parsed.totalOriginalBytes || 0,
        totalFilteredBytes: parsed.totalFilteredBytes || 0,
        totalOriginalTokens: parsed.totalOriginalTokens || 0,
        totalFilteredTokens: parsed.totalFilteredTokens || 0,
        eventsProcessed: parsed.eventsProcessed || 0,
      }
    } catch {}
  }

  private _saveCumulativeStats() {
    if (!this._statsFilePath) return
    try {
      fs.mkdirSync(path.dirname(this._statsFilePath), { recursive: true })
      fs.writeFileSync(this._statsFilePath, JSON.stringify(this._cumulativeStats), 'utf-8')
    } catch {}
  }

  setOnCommandEvent(cb: (event: CommandEvent) => void) {
    this.onCommandEvent = cb
  }

  hasPendingTimer(sessionId: string): boolean {
    return this.finalizeTimers.has(sessionId)
  }

  private emit(event: CommandEvent) {
    const hist = this._commandHistory.get(event.sessionId) || []
    hist.push(event)
    if (hist.length > 200) hist.shift()
    this._commandHistory.set(event.sessionId, hist)
    this.onCommandEvent?.(event)
  }

  private clearTimer(sessionId: string) {
    const t = this.finalizeTimers.get(sessionId)
    if (t) { clearTimeout(t); this.finalizeTimers.delete(sessionId) }
  }

  // Process incoming PTY data. Returns data for the frontend.
  // VT sequences MUST pass through unmodified — xterm.js's parser depends on
  // receiving the exact stream. Marker detection and command accumulation
  // happen independently without altering the display data.
  processOutput(sessionId: string, data: string): string {
    debugLog(`DATA CHUNK session=${sessionId.slice(0,8)} len=${data.length} preview="${data.slice(0,100).replace(/\n/g,'\\n').replace(/\r/g,'\\r')}"`)
    // Buffer partial lines across chunks (PTY data can split lines)
    const prevPartial = this.lineBuffer.get(sessionId) || ''
    const full = prevPartial + data
    const parts = full.split(/\r?\n/)
    // Last element may be incomplete — save for next chunk
    const completeLines = parts.slice(0, -1)
    this.lineBuffer.set(sessionId, parts[parts.length - 1])

    for (const rawLine of completeLines) {
      // Strip ANSI for command detection (line itself goes to terminal raw)
      const plain = rawLine.replace(/\x1b\[[\d;]*[A-Za-z]/g, '').replace(/\x1b\][\s\S]*?(?:\x1b\\|\x07)/g, '').replace(/[\x00-\x08\x0b\x0c\r\x0e-\x1f\x7f]/g, '')

      // Detect wrapper markers: "agntspce $ <command>"
      const tagMatch = plain.match(AGNTSPCE_CMD_RE)
      if (tagMatch) {
        const cmdStr = tagMatch[1].trim()
        debugLog(`MARKER DETECTED session=${sessionId.slice(0,8)} cmd="${cmdStr}" plain="${plain.slice(0,120)}"`)
        this.clearTimer(sessionId)
        this.finalizeCommand(sessionId)
        const detected = this._detectCommand(cmdStr)
        if (detected) {
          this.commandBuffers.set(sessionId, {
            command: detected.command,
            args: detected.args,
            rawOutput: '',
            startTime: Date.now(),
            exitCode: null,
          })
          this.insideCommand.set(sessionId, true)
          this.outputAccum.set(sessionId, [])
        }
      }

      // Detect shell prompt + command (e.g. "$ git status", "❯ git diff")
      // Agents echo commands with a shell prompt before running them.
      // Only track commands that have a specific RTK filter (avoids noise from
      // commands like `cd`, `echo`, `ls` that produce no filtered savings).
      if (!tagMatch) {
        const shellCmdMatch = plain.match(SHELL_CMD_RE)
        if (shellCmdMatch) {
          const cmdStr = shellCmdMatch[1].trim()
          // Strip "agntspce " prefix — the RTK filter patterns match the
          // underlying command (e.g. "git show"), not "agntspce git show".
          const strippedCmd = cmdStr.replace(/^agntspce\s+/, '')
          debugLog(`SHELL CMD session=${sessionId.slice(0,8)} cmd="${cmdStr}" stripped="${strippedCmd}" hasFilter=${hasSpecificFilter(strippedCmd)} isEcho=${SHELL_ECHO_RE.test(plain)}`)
          if (strippedCmd && hasSpecificFilter(strippedCmd) && !SHELL_ECHO_RE.test(plain)) {
            const detected = this._detectCommand(strippedCmd)
            if (detected) {
              this.clearTimer(sessionId)
              this.finalizeCommand(sessionId)
              this.commandBuffers.set(sessionId, {
                command: detected.command,
                args: detected.args,
                rawOutput: '',
                startTime: Date.now(),
                exitCode: null,
              })
              this.insideCommand.set(sessionId, true)
              this.outputAccum.set(sessionId, [])
            }
          }
        }
      }

      // Detect token stats from wrapper (AGNTSPCE_STATS raw=N filtered=N).
      // The wrapper emits this line before the filtered output with the real
      // raw vs filtered token counts from spawnSync. Don't accumulate this line.
      if (this.insideCommand.get(sessionId)) {
        const statsMatch = plain.match(AGNTSPCE_STATS_RE)
        if (statsMatch) {
          const r = parseInt(statsMatch[1], 10)
          const f = parseInt(statsMatch[2], 10)
          debugLog(`STATS DETECTED session=${sessionId.slice(0,8)} raw=${r} filtered=${f} plain="${plain.slice(0,120)}"`)
          this._pendingStats.set(sessionId, { rawTokens: r, filteredTokens: f })
          continue
        }
      }
      if (plain.includes('AGNTSPCE_STATS') && !this.insideCommand.get(sessionId)) {
        debugLog(`STATS SEEN BUT insideCommand FALSE plain="${plain.slice(0,120)}"`)
      }

      // Always accumulate output for fallback events (200-line sliding window).
      // When shell command detection works, this feeds accurate per-command data.
      // When it doesn't (status transitions without markers), the fallback in
      // finalizeCommand creates events from the recent accumulator.
      const accum = this.outputAccum.get(sessionId) || []
      accum.push(rawLine)
      if (accum.length > 200) accum.shift()
      this.outputAccum.set(sessionId, accum)
      if (this.insideCommand.get(sessionId)) {
        if (/[$#%❯➜]\s*$/.test(plain.trim()) || /^PS\s+.*>\s*$/.test(plain.trim()) || /^[A-Z]:\\.*>/.test(plain.trim()) || plain.trim() === '') {
          this.scheduleFinalize(sessionId)
        }
      }
    }

    // Safety net: ensure a finalize timer is pending if we're mid-command
    // but no prompt or status change has triggered one yet. The timer acts as
    // a fallback when the wrapper's output doesn't end with a clear prompt.
    if (this.insideCommand.get(sessionId) && !this.finalizeTimers.has(sessionId) && this.commandBuffers.has(sessionId)) {
      this.scheduleFinalize(sessionId)
    }

    // Pass raw data through unmodified — any change to the VT stream
    // desynchronizes xterm.js's internal buffer (cursor, scroll regions, colors).
    return data
  }

  private _detectCommand(cmdStr: string): { command: string; args: string[] } | null {
    const trimmed = cmdStr.trim()
    if (!trimmed) return null
    const parts = trimmed.split(/\s+/)
    if (parts.length === 0) return null
    return { command: parts[0], args: parts.slice(1) }
  }

  private _detectCommandFromOutput(lines: string[]): { command: string; args: string[] } | null {
    for (const rawLine of lines) {
      const plain = rawLine.replace(/\x1b\[[\d;]*[A-Za-z]/g, '').replace(/\x1b\][\s\S]*?(?:\x1b\\|\x07)/g, '').replace(/[\x00-\x08\x0b\x0c\r\x0e-\x1f\x7f]/g, '')
      const tagMatch = plain.match(AGNTSPCE_CMD_RE)
      if (tagMatch) {
        const d = this._detectCommand(tagMatch[1])
        if (d) return d
      }
      const shellMatch = plain.match(SHELL_CMD_RE)
      if (shellMatch) {
        const strippedCmd = shellMatch[1].trim().replace(/^agntspce\s+/, '')
        if (strippedCmd && hasSpecificFilter(strippedCmd)) {
          const d = this._detectCommand(strippedCmd)
          if (d) return d
        }
      }
    }
    return null
  }

  private scheduleFinalize(sessionId: string) {
    this.clearTimer(sessionId)
    const timer = setTimeout(() => {
      this.finalizeCommand(sessionId)
    }, 1500)
    this.finalizeTimers.set(sessionId, timer)
  }

  // General-purpose compression for output with no detected command.
  // Applies safe reductions that work on any terminal output: collapses
  // blank lines, truncates long lines, limits total lines, strips tail space.
  private compressOutput(text: string): string {
    let lines = text.split('\n')
    // Collapse 3+ consecutive blank lines into one blank line
    lines = lines.reduce((acc: string[], line: string) => {
      const isBlank = line.trim() === ''
      if (isBlank && acc.length > 0 && acc[acc.length - 1] === '') return acc
      acc.push(isBlank ? '' : line)
      return acc
    }, [] as string[])
    // Truncate lines > 2000 chars
    lines = lines.map(l => l.length > 2000 ? l.slice(0, 1997) + '...' : l)
    // Strip trailing whitespace per line
    lines = lines.map(l => l.trimEnd())
    // Limit to head 200 + tail 100
    const head = 200, tail = 100
    if (lines.length > head + tail) {
      lines = [
        ...lines.slice(0, head),
        `... (${lines.length - head - tail} lines omitted)`,
        ...lines.slice(lines.length - tail),
      ]
    }
    return lines.join('\n')
  }

  finalizeCommand(sessionId: string, exitCode?: number): CommandEvent | null {
    debugLog(`finalizeCommand called session=${sessionId.slice(0,8)} exitCode=${exitCode ?? 'none'} hasPendingStats=${this._pendingStats.has(sessionId)} hasBuf=${this.commandBuffers.has(sessionId)} insideCmd=${this.insideCommand.get(sessionId)}`)
    let cmdBuf = this.commandBuffers.get(sessionId)
    const accum = this.outputAccum.get(sessionId) || []
    const rawOutput = accum.join('\n').trim()

    // Fallback: if no shell command was detected but there's accumulated output,
    // scan the output for command patterns to apply the right filter.
    if (!cmdBuf) {
      if (!rawOutput) return null
      const detectedCmd = this._detectCommandFromOutput(accum)
      cmdBuf = {
        command: detectedCmd?.command || 'output',
        args: detectedCmd?.args || [],
        rawOutput,
        startTime: Date.now(),
        exitCode: exitCode ?? 0,
      }
      this.commandBuffers.set(sessionId, cmdBuf)
      if (detectedCmd) {
        debugLog(`FALLBACK cmd detected from output: "${cmdBuf.command}"`)
      } else {
        debugLog(`FALLBACK no cmd detected, using "output"`)
      }
    }

    // Guard: if the command just started and the wrapper's stats haven't
    // arrived, don't finalize yet. The marker line alone triggers an idle
    // status transition in detectStatus (buffer < 100 chars → idle) which
    // calls finalizeCommand before the stats line and filtered output arrive.
    if (!this._pendingStats.has(sessionId) && Date.now() - cmdBuf.startTime < 500 && rawOutput.length < 50) {
      debugLog(`GUARD FIRED session=${sessionId.slice(0,8)} cmd="${cmdBuf.command}" elapsed=${Date.now()-cmdBuf.startTime} rawLen=${rawOutput.length}`)
      return null
    }

    this.clearTimer(sessionId)
    this.insideCommand.set(sessionId, false)

    cmdBuf.exitCode = exitCode ?? 0
    cmdBuf.rawOutput = rawOutput

    const cmdStr = `${cmdBuf.command} ${cmdBuf.args.join(' ')}`.trim()
    const cleanedOutput = stripAllControl(rawOutput)

    // Use wrapper-reported stats if available (real raw vs filtered from
    // spawnSync in bin/agntspce.mjs). Otherwise fall back to RTK filter.
    const pending = this._pendingStats.get(sessionId)
    let originalTokens: number
    let filteredTokens: number
    let reduction: number
    let filtered: string
    let filterName: string | undefined
    if (pending) {
      debugLog(`USING PENDING STATS session=${sessionId.slice(0,8)} raw=${pending.rawTokens} filtered=${pending.filteredTokens}`)
      originalTokens = pending.rawTokens
      filteredTokens = pending.filteredTokens
      reduction = originalTokens > 0
        ? Math.round((1 - filteredTokens / originalTokens) * 10000) / 100
        : 0
      filtered = stripAllControl(cleanedOutput)
      this._pendingStats.delete(sessionId)
    } else {
      debugLog(`FALLBACK no pending stats session=${sessionId.slice(0,8)} cmd="${cmdBuf.command}" rawLen=${cleanedOutput.length}`)

      // Apply RTK filter if we detected a specific command (e.g. git status
      // via shell prompt). The filter strips matching lines and truncates.
      const rtkResult = filterCommandOutput(cmdStr, cleanedOutput)
      filtered = rtkResult.filtered
      filterName = rtkResult.filterName || undefined

      // If no specific filter matched or command is 'output' (no command
      // detected, e.g. agent session output), apply general-purpose
      // compression that always reduces tokens: collapse blank lines,
      // truncate long lines, limit total lines.
      if (!rtkResult.filterName || cmdBuf.command === 'output') {
        const compressed = this.compressOutput(filtered)
        if (estimateTokens(compressed) < estimateTokens(filtered)) {
          debugLog(`COMPRESS: applied general compression cmd="${cmdBuf.command}" before=${filtered.length} after=${compressed.length}`)
          filtered = compressed
        }
        filterName = undefined
      }

      // neverWorse: if filtered is larger than raw, use raw instead
      if (estimateTokens(filtered) > estimateTokens(cleanedOutput)) {
        debugLog(`NEVER WORSE: filtered larger than raw cmd="${cmdBuf.command}"`)
        filtered = cleanedOutput
        filterName = undefined
      }

      originalTokens = estimateTokens(cleanedOutput)
      filteredTokens = estimateTokens(filtered)
      reduction = originalTokens > 0
        ? Math.round((1 - filteredTokens / originalTokens) * 10000) / 100
        : 0
    }

    const brandedCmd = formatCommand(cmdBuf.command, cmdBuf.args, 'agntspce')
    const event: CommandEvent = {
      sessionId,
      command: cmdBuf.command,
      args: cmdBuf.args,
      formatted: brandedCmd,
      rawOutput: cleanedOutput,
      filteredOutput: filtered,
      originalTokens,
      filteredTokens,
      reduction,
      exitCode: cmdBuf.exitCode,
      duration: Date.now() - cmdBuf.startTime,
      timestamp: Date.now(),
      filterName,
    }

    debugLog(`EMIT EVENT session=${sessionId.slice(0,8)} cmd="${brandedCmd}" reduction=${reduction}% orig=${originalTokens} filt=${filteredTokens}`)

    this.commandBuffers.delete(sessionId)
    this.outputAccum.delete(sessionId)
    this.emit(event)
    return event
  }

  getCommandHistory(sessionId: string): CommandEvent[] {
    return this._commandHistory.get(sessionId) || []
  }

  getAllCommandHistory(): CommandEvent[] {
    const all: CommandEvent[] = []
    for (const [, hist] of this._commandHistory) all.push(...hist)
    return all
  }

  getAllStats(): { stats: { totalOriginalBytes: number; totalFilteredBytes: number; totalOriginalTokens: number; totalFilteredTokens: number; eventsProcessed: number } }[] {
    const sessionEvents = this.getAllCommandHistory().filter(e => !e.command.startsWith('agntspce-search'))
    const sessionStats = {
      totalOriginalBytes: sessionEvents.reduce((s, e) => s + new TextEncoder().encode(e.rawOutput).length, 0),
      totalFilteredBytes: sessionEvents.reduce((s, e) => s + new TextEncoder().encode(e.filteredOutput).length, 0),
      totalOriginalTokens: sessionEvents.reduce((s, e) => s + e.originalTokens, 0),
      totalFilteredTokens: sessionEvents.reduce((s, e) => s + e.filteredTokens, 0),
      eventsProcessed: sessionEvents.length,
    }
    const stats = {
      totalOriginalBytes: this._cumulativeStats.totalOriginalBytes + sessionStats.totalOriginalBytes,
      totalFilteredBytes: this._cumulativeStats.totalFilteredBytes + sessionStats.totalFilteredBytes,
      totalOriginalTokens: this._cumulativeStats.totalOriginalTokens + sessionStats.totalOriginalTokens,
      totalFilteredTokens: this._cumulativeStats.totalFilteredTokens + sessionStats.totalFilteredTokens,
      eventsProcessed: this._cumulativeStats.eventsProcessed + sessionStats.eventsProcessed,
    }
    return [{ stats }]
  }

  getCumulativeStats(): CumulativeStats {
    return { ...this._cumulativeStats }
  }

  getAllHistory(): any[] {
    const allEvents = this.getAllCommandHistory()
    return allEvents.map(e => ({
      sessionId: e.sessionId,
      original: e.rawOutput,
      filtered: e.filteredOutput,
      originalBytes: new TextEncoder().encode(e.rawOutput).length,
      filteredBytes: new TextEncoder().encode(e.filteredOutput).length,
      originalTokens: e.originalTokens,
      filteredTokens: e.filteredTokens,
      reduction: e.reduction,
      rulesApplied: e.filterName ? [e.filterName] : [],
    }))
  }

  reportTokenSavings(originalTokens: number, filteredTokens: number, toolName?: string) {
    // Dedup: if any active session has pending stats with the same token
    // values, the PTY-based detection already captured this command.
    // The HTTP POST (from bin/agntspce.mjs reportStats) is redundant.
    for (const [, pending] of this._pendingStats) {
      if (pending.rawTokens === originalTokens && pending.filteredTokens === filteredTokens) {
        return null
      }
    }
    // Secondary dedup: same token pair reported within the last 5 seconds
    const dedupKey = `${originalTokens}-${filteredTokens}`
    const lastReported = this._recentTokenReports.get(dedupKey)
    const now = Date.now()
    if (lastReported && now - lastReported < 5000) {
      debugLog(`DEDUP reportTokenSavings key=${dedupKey} age=${now - lastReported}ms`)
      return null
    }
    this._recentTokenReports.set(dedupKey, now)
    // Prune entries older than 30s
    if (this._recentTokenReports.size > 100) {
      for (const [k, t] of this._recentTokenReports) {
        if (now - t > 30000) this._recentTokenReports.delete(k)
      }
    }
    const event: CommandEvent = {
      sessionId: 'system',
      command: toolName || 'tool',
      args: [],
      formatted: `agntspce $ ${toolName || 'tool'}`,
      rawOutput: '',
      filteredOutput: '',
      originalTokens,
      filteredTokens,
      reduction: originalTokens > 0 ? Math.round((1 - filteredTokens / originalTokens) * 10000) / 100 : 0,
      exitCode: 0,
      duration: 0,
      timestamp: Date.now(),
    }
    this.emit(event)
    return event
  }

  cleanup(sessionId: string) {
    const events = (this._commandHistory.get(sessionId) || []).filter(e => !e.command.startsWith('agntspce-search'))
    if (events.length > 0) {
      this._cumulativeStats.totalOriginalBytes += events.reduce((s, e) => s + new TextEncoder().encode(e.rawOutput).length, 0)
      this._cumulativeStats.totalFilteredBytes += events.reduce((s, e) => s + new TextEncoder().encode(e.filteredOutput).length, 0)
      this._cumulativeStats.totalOriginalTokens += events.reduce((s, e) => s + e.originalTokens, 0)
      this._cumulativeStats.totalFilteredTokens += events.reduce((s, e) => s + e.filteredTokens, 0)
      this._cumulativeStats.eventsProcessed += events.length
      this._saveCumulativeStats()
    }
    this.commandBuffers.delete(sessionId)
    this.outputAccum.delete(sessionId)
    this.lineBuffer.delete(sessionId)
    this.insideCommand.delete(sessionId)
    this.clearTimer(sessionId)
    this._commandHistory.delete(sessionId)
    this._pendingStats.delete(sessionId)
  }

  reset() {
    this.commandBuffers.clear()
    this.outputAccum.clear()
    this.lineBuffer.clear()
    this.insideCommand.clear()
    this._commandHistory.clear()
    this._pendingStats.clear()
    for (const [, t] of this.finalizeTimers) clearTimeout(t)
    this.finalizeTimers.clear()
  }

  resetCumulativeStats() {
    this._cumulativeStats = { totalOriginalBytes: 0, totalFilteredBytes: 0, totalOriginalTokens: 0, totalFilteredTokens: 0, eventsProcessed: 0 }
    this._saveCumulativeStats()
  }

  persistCumulativeStats() {
    const sessionEvents = this.getAllCommandHistory().filter(e => !e.command.startsWith('agntspce-search'))
    this._cumulativeStats.totalOriginalBytes += sessionEvents.reduce((s, e) => s + new TextEncoder().encode(e.rawOutput).length, 0)
    this._cumulativeStats.totalFilteredBytes += sessionEvents.reduce((s, e) => s + new TextEncoder().encode(e.filteredOutput).length, 0)
    this._cumulativeStats.totalOriginalTokens += sessionEvents.reduce((s, e) => s + e.originalTokens, 0)
    this._cumulativeStats.totalFilteredTokens += sessionEvents.reduce((s, e) => s + e.filteredTokens, 0)
    this._cumulativeStats.eventsProcessed += sessionEvents.length
    this._saveCumulativeStats()
  }
}
