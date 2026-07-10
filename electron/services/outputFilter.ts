import { getRegistry, filterCommandOutput, estimateTokens, stripAllControl } from './rtk'
import { formatCommand } from './rtk/formatter'

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
}

const AGNTSPCE_CMD_RE = /^agntspce\s+\$\s+(.+)$/
const SHELL_ECHO_RE = /^\$\s+agntspce\s+run\s+/
const AGENT_TYPES = ['opencode', 'claude', 'codex', 'gemini', 'aider', 'cursor-agent', 'copilot', 'mastracode', 'droid', 'amp', 'pi']

export class OutputFilterService {
  private commandBuffers = new Map<string, {
    command: string
    args: string[]
    rawOutput: string
    startTime: number
    exitCode: number | null
  }>()
  private outputAccum = new Map<string, string[]>()
  private insideCommand = new Map<string, boolean>()
  private finalizeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private onCommandEvent: ((event: CommandEvent) => void) | null = null
  private _commandHistory = new Map<string, CommandEvent[]>()

  setOnCommandEvent(cb: (event: CommandEvent) => void) {
    this.onCommandEvent = cb
  }

  private emit(event: CommandEvent) {
    this.onCommandEvent?.(event)
    const hist = this._commandHistory.get(event.sessionId) || []
    hist.push(event)
    if (hist.length > 200) hist.shift()
    this._commandHistory.set(event.sessionId, hist)
  }

  private clearTimer(sessionId: string) {
    const t = this.finalizeTimers.get(sessionId)
    if (t) { clearTimeout(t); this.finalizeTimers.delete(sessionId) }
  }

  // Process incoming PTY data. Returns the modified data for the frontend.
  processOutput(sessionId: string, data: string): string {
    const isAgent = [...this.commandBuffers.keys()].some(id => id.startsWith(sessionId))

    // Replace shell echoes of "agntspce run <tool>" with empty
    let modified = data.replace(/^.*?\$\s+(?:\/[^\s]*\/)?agntspce(?:\s+run)?\s+.*$/gm, '')

    // Detect our wrapper's output markers: "agntspce $ <command>"
    const lines = modified.split('\n')
    const outLines: string[] = []

    for (const line of lines) {
      const tagMatch = line.match(AGNTSPCE_CMD_RE)
      if (tagMatch) {
        const cmdStr = tagMatch[1].trim()
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
        outLines.push(line)
        continue
      }

      if (this.insideCommand.get(sessionId)) {
        const accum = this.outputAccum.get(sessionId) || []
        accum.push(line)
        this.outputAccum.set(sessionId, accum)
        outLines.push(line)
        // Auto-finalize after output stops (heuristic: detect empty line or prompt-like line)
        if (/^[$#%❯➜]\s*$/.test(line.trim()) || line.trim() === '') {
          this.scheduleFinalize(sessionId)
        }
        continue
      }

      outLines.push(line)
    }

    modified = outLines.join('\n')

    // Clear empty lines from shell echo replacement
    modified = modified.replace(/\n{3,}/g, '\n\n')

    return modified
  }

  private _detectCommand(cmdStr: string): { command: string; args: string[] } | null {
    const trimmed = cmdStr.trim()
    if (!trimmed) return null
    const parts = trimmed.split(/\s+/)
    if (parts.length === 0) return null
    return { command: parts[0], args: parts.slice(1) }
  }

  private scheduleFinalize(sessionId: string) {
    this.clearTimer(sessionId)
    const timer = setTimeout(() => {
      this.finalizeCommand(sessionId)
    }, 1500)
    this.finalizeTimers.set(sessionId, timer)
  }

  finalizeCommand(sessionId: string, exitCode?: number): CommandEvent | null {
    const cmdBuf = this.commandBuffers.get(sessionId)
    if (!cmdBuf) return null

    this.clearTimer(sessionId)
    this.insideCommand.set(sessionId, false)

    cmdBuf.exitCode = exitCode ?? 0
    const rawOutput = (this.outputAccum.get(sessionId) || []).join('\n').trim()
    cmdBuf.rawOutput = rawOutput

    const cmdStr = `${cmdBuf.command} ${cmdBuf.args.join(' ')}`.trim()
    const cleanedOutput = stripAllControl(rawOutput)

    // Compute filter
    const rtkResult = filterCommandOutput(cmdStr, cleanedOutput)
    const filtered = rtkResult.filtered
    const filterName = rtkResult.filterName

    // Compute stats from actual data
    const originalTokens = estimateTokens(cleanedOutput)
    const filteredTokens = estimateTokens(filtered)
    const reduction = originalTokens > 0
      ? Math.round((1 - filteredTokens / originalTokens) * 10000) / 100
      : 0

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
    }

    this.commandBuffers.delete(sessionId)
    this.outputAccum.delete(sessionId)
    this.emit(event)
    return event
  }

  // Track that an agent has started in a session
  trackAgentStart(sessionId: string, agentType: string) {
    if (AGENT_TYPES.includes(agentType)) {
      // Just mark the session as active - nothing more needed
    }
  }

  getCommandHistory(sessionId: string): CommandEvent[] {
    return this._commandHistory.get(sessionId) || []
  }

  getAllCommandHistory(): CommandEvent[] {
    const all: CommandEvent[] = []
    for (const [, hist] of this._commandHistory) all.push(...hist)
    return all
  }

  cleanup(sessionId: string) {
    this.commandBuffers.delete(sessionId)
    this.outputAccum.delete(sessionId)
    this.insideCommand.delete(sessionId)
    this.clearTimer(sessionId)
    this._commandHistory.delete(sessionId)
  }

  reset() {
    this.commandBuffers.clear()
    this.outputAccum.clear()
    this.insideCommand.clear()
    this._commandHistory.clear()
    for (const [, t] of this.finalizeTimers) clearTimeout(t)
    this.finalizeTimers.clear()
  }
}
