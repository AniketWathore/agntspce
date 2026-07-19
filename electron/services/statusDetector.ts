const completionPatterns = [
  /Cost: \$[\d.]+/,
  /Total cost: \$[\d.]+/,
  /Session cost: \$[\d.]+/,
  /Total duration \(wall\):/,
  /Total code changes:/,
  /tokens used/i,
  /\d+ input, \d+ output.*cache/,
]

const toolPatterns = [
  /^● /m,
  /^⎿/m,
  /Read\(.*\)/,
  /Write\(.*\)/,
  /Edit\(.*\)/,
  /Bash\(.*\)/,
  /Update\(.*\)/,
  /Grep\(.*\)/,
  /Glob\(.*\)/,
  /Task\(.*\)/,
  /Agent\(.*\)/,
  /WebFetch\(.*\)/,
  /WebSearch\(.*\)/,
  /NotebookEdit\(.*\)/,
  /NotebookRead\(.*\)/,
  /Skill\(.*\)/,
  /AskUserQuestion\(.*\)/,
  /ToolSearch\(.*\)/,
  /TodoWrite\(.*\)/,
  /TaskOutput\(.*\)/,
  /TaskStop\(.*\)/,
]

const typingPatterns = [
  /∴ Thinking…/,
  /Waiting for permission/,
  /Waiting for task/,
  /Running command/,
  /compacting conversation/i,
]

const ASSUME_BUSY_SINCE_OUTPUT_MS = 8000
const ASSUME_BUSY_SINCE_OUTPUT_AGENT_MS = 15000
const ASSUME_BUSY_SINCE_OUTPUT_CLAUDE_MS = 30000
const ASSUME_BUSY_SINCE_OUTPUT_CODEX_MS = 10000
const ASSUME_BUSY_SINCE_OUTPUT_GEMINI_MS = 6000
const ASSUME_BUSY_SINCE_OUTPUT_OPENCODE_MS = 5000
const ASSUME_BUSY_SINCE_OUTPUT_AIDER_MS = 10000

interface SessionState {
  lastBufferLength: number
  lastOutputTime: number
  claudeLikely: boolean
  agent: string | null
}

export class StatusDetector {
  private sessionState = new Map<string, SessionState>()

  stripControlSequences(text: string): string {
    return String(text || '')
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b[()][A-Za-z0-9]/g, '')
  }

  private getState(sessionId: string): SessionState {
    if (!this.sessionState.has(sessionId)) {
      this.sessionState.set(sessionId, {
        lastBufferLength: 0,
        lastOutputTime: Date.now(),
        claudeLikely: false,
        agent: null,
      })
    }
    return this.sessionState.get(sessionId)!
  }

  private getLastNonEmptyLine(lines: string[]): string {
    for (let i = lines.length - 1; i >= 0; i--) {
      const raw = String(lines[i] || '').replace(/\r/g, '')
      if (raw.trim() !== '') return raw
    }
    return ''
  }

  private getLastNonEmptyLines(lines: string[], count: number): string[] {
    const out: string[] = []
    for (let i = lines.length - 1; i >= 0 && out.length < count; i--) {
      const raw = String(lines[i] || '').replace(/\r/g, '')
      if (raw.trim() !== '') out.push(raw)
    }
    return out
  }

  private normalizeAgent(agent: string | null | undefined): string | null {
    const normalized = String(agent || '').trim().toLowerCase()
    if (!normalized) return null
    if (normalized === 'gemini-cli') return 'gemini'
    if (normalized === 'open-code') return 'opencode'
    return normalized
  }

  private getAssumeBusyWindowMs(opts: { agent?: string | null; isAgentTerminal: boolean; claudeLikely: boolean }): number {
    const agent = this.normalizeAgent(opts.agent)
    if (agent === 'codex') return ASSUME_BUSY_SINCE_OUTPUT_CODEX_MS
    if (agent === 'gemini') return ASSUME_BUSY_SINCE_OUTPUT_GEMINI_MS
    if (agent === 'opencode') return ASSUME_BUSY_SINCE_OUTPUT_OPENCODE_MS
    if (agent === 'aider') return ASSUME_BUSY_SINCE_OUTPUT_AIDER_MS
    if (opts.claudeLikely) return ASSUME_BUSY_SINCE_OUTPUT_CLAUDE_MS
    if (opts.isAgentTerminal) return ASSUME_BUSY_SINCE_OUTPUT_AGENT_MS
    return ASSUME_BUSY_SINCE_OUTPUT_MS
  }

  private detectProviderStatus(agent: string | null, context: {
    recentOutput: string
    recentAll: string
    trimmedLastNonEmptyLine: string
    hasRecentOutput: boolean
  }): string | null {
    const agentStr = this.normalizeAgent(agent)
    if (!agentStr || agentStr === 'claude') return null
    const { recentOutput, trimmedLastNonEmptyLine, hasRecentOutput } = context

    if (agentStr === 'codex') {
      if (trimmedLastNonEmptyLine === '>' || /^codex>\s*$/i.test(trimmedLastNonEmptyLine) ||
        (/OpenAI Codex/i.test(recentOutput) && /\? for shortcuts/i.test(recentOutput))) return 'waiting'
      if (hasRecentOutput && (/esc to interrupt/i.test(recentOutput) || /tab to add notes/i.test(recentOutput))) return 'busy'
      return null
    }

    if (agentStr === 'gemini') {
      if (/Waiting for authentication/i.test(recentOutput) || /Do you trust the files/i.test(recentOutput) ||
        /Apply this change\?/i.test(recentOutput) || /Allow execution of/i.test(recentOutput)) return 'waiting'
      if (hasRecentOutput && (/Thinking\.\.\./i.test(recentOutput) || /\(esc to cancel/i.test(recentOutput))) return 'busy'
      return null
    }

    if (agentStr === 'opencode') {
      if ((/Ask anything\.\.\./i.test(recentOutput) && /ctrl\+t\s+variants/i.test(recentOutput)) ||
        /press enter to send the message/i.test(recentOutput)) return 'waiting'
      if (hasRecentOutput && (/Thinking\.\.\./i.test(recentOutput) || /Generating\.\.\./i.test(recentOutput) ||
        /Working\.\.\./i.test(recentOutput))) return 'busy'
      return null
    }

    return null
  }

  private hasExplicitShellIndicator(recentAll: string, trimmedLastNonEmptyLine: string): boolean {
    const normalizedRecent = this.stripControlSequences(recentAll || '')
    const normalizedLine = this.stripControlSequences(trimmedLastNonEmptyLine || '').trim()
    return (
      /Type 'claude' to start a new Claude session\./i.test(normalizedRecent) ||
      /Claude session ended\./i.test(normalizedRecent) ||
      this.looksLikeShellPrompt(normalizedLine)
    )
  }

  private looksLikeShellPrompt(line: string): boolean {
    const patterns = [
      /^\$$/, /^#$/, /^%$/, /^PS .*>$/i,
      /^\w+@[\w.-]+:.*[$#%]$/, /^\(.*\)\s*[$#%]$/,
      /^.*[/~].*[$#%]$/, /^bash-[\d.]+\$$/i,
      /^.+\s[❯»›]$/, /^❯$/, /^[A-Z]:\\.*>$/,
      /^PS\s+.*>$/,
    ]
    return patterns.some(p => p.test(line))
  }

  detectStatus(sessionId: string, buffer: string, options?: { agent?: string | null }): string {
    const state = this.getState(sessionId)
    const agent = this.normalizeAgent(options?.agent)
    const isNonClaudeAgent = !!(agent && agent !== 'claude')
    if (agent) state.agent = agent

    const now = Date.now()
    if (buffer.length > state.lastBufferLength) {
      state.lastOutputTime = now
      state.lastBufferLength = buffer.length
    } else if (buffer.length < state.lastBufferLength) {
      state.lastBufferLength = buffer.length
    }
    const timeSinceOutput = now - state.lastOutputTime
    const isAgentTerminal = /-(claude|codex)$/.test(String(sessionId || ''))
    const assumeBusyWindowMs = this.getAssumeBusyWindowMs({ agent, isAgentTerminal, claudeLikely: state.claudeLikely })
    const hasRecentOutput = timeSinceOutput < assumeBusyWindowMs

    const recentOutput = this.stripControlSequences(buffer.slice(-2000))
    const lines = recentOutput.split('\n')
    const lastFewLines = lines.slice(-10).join('\n')
    const lastNonEmptyLine = this.getLastNonEmptyLine(lines)
    const trimmedLastNonEmptyLine = lastNonEmptyLine.trim()
    const lastNonEmptyLines = this.getLastNonEmptyLines(lines, 6)
    const recentAll = lastNonEmptyLines.join('\n')

    if (isNonClaudeAgent) state.claudeLikely = false

    const providerStatus = this.detectProviderStatus(agent, {
      recentOutput, recentAll, trimmedLastNonEmptyLine, hasRecentOutput,
    })
    if (providerStatus) return providerStatus

    if (isNonClaudeAgent) {
      if (this.hasExplicitShellIndicator(recentAll, trimmedLastNonEmptyLine)) return 'idle'
      if (timeSinceOutput < assumeBusyWindowMs && buffer.length > 100) return 'busy'
      return 'idle'
    }

    if (!isNonClaudeAgent) {
      if (/Welcome to Claude Code!/.test(recentAll) || /\? for shortcuts/.test(recentAll)) state.claudeLikely = true
      if (/Claude session ended\./.test(recentAll) || /Type 'claude' to start a new Claude session\./.test(recentAll)) state.claudeLikely = false
    }

    if (trimmedLastNonEmptyLine === '? for shortcuts') return 'waiting'
    if (trimmedLastNonEmptyLine === '>' && state.claudeLikely) {
      const hasStartupMarkers = /Welcome to Claude Code!/.test(recentAll) || /\? for shortcuts/.test(recentAll)
      const hasRecentCompletion = lastNonEmptyLines.slice(1).some(line =>
        completionPatterns.some(p => p.test(String(line || '').trim())))
      if (hasStartupMarkers || hasRecentCompletion) return 'waiting'
    }

    if (buffer.includes('Welcome to Claude Code!') && trimmedLastNonEmptyLine === '? for shortcuts') return 'waiting'

    for (const pattern of completionPatterns) {
      if (pattern.test(trimmedLastNonEmptyLine)) {
        state.claudeLikely = true
        return 'waiting'
      }
    }

    if (hasRecentOutput) {
      for (const pattern of toolPatterns) {
        if (!pattern.test(lastFewLines)) continue
        state.claudeLikely = true
        return 'busy'
      }
    }

    if (hasRecentOutput) {
      for (const pattern of typingPatterns) {
        if (!pattern.test(lastFewLines)) continue
        state.claudeLikely = true
        return 'busy'
      }
      if (/(\.\.\.|…)$/.test(trimmedLastNonEmptyLine)) {
        state.claudeLikely = true
        return 'busy'
      }
    }

    if (this.hasExplicitShellIndicator(recentAll, trimmedLastNonEmptyLine)) {
      state.claudeLikely = false
      return 'idle'
    }

    if (timeSinceOutput < assumeBusyWindowMs && buffer.length > 100) return 'busy'
    return 'idle'
  }

  reset(sessionId?: string): void {
    if (sessionId) {
      this.sessionState.delete(sessionId)
    } else {
      this.sessionState.clear()
    }
  }
}
