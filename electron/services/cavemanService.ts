import * as fs from 'fs'
import * as path from 'path'

export interface CavemanChunk {
  compressedText: string
  originalText: string
  compressedTokens: number
  originalTokens: number
  savedTokens: number
  removed: string[]
}

export interface CavemanRun {
  id: string
  prompt: string
  startedAt: number
  endedAt: number
  chunks: CavemanChunk[]
  totalCompressedTokens: number
  totalOriginalTokens: number
  totalSavedTokens: number
  removedWords: string[]
}

export interface CavemanSession {
  sessionId: string
  enabled: boolean
  level: string
  runs: CavemanRun[]
  startTime: number
}

export interface CavemanStats {
  sessionId: string
  enabled: boolean
  level: string
  runs: CavemanRun[]
  currentRun: CavemanRun | null
  startTime: number
  uptime: number
}

export interface CavemanAggregateStats {
  totalOutputTokens: number
  totalSavedTokens: number
  sessionsActive: number
  uptimeMs: number
}

interface InternalSession {
  enabled: boolean
  level: string
  runs: CavemanRun[]
  currentRun: CavemanRun | null
  rawBuffer: string
  pendingPrompt: string
  startTime: number
}

const SKILL_MD = `---
name: caveman
description: Ultra-compressed communication mode.
---

Respond terse like smart caveman. All technical substance stay. Only fluff die.

## Rules
Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms. No tool-call narration, no decorative tables/emoji. Technical terms exact. Code blocks unchanged. Errors quoted exact.

Preserve user's dominant language. No self-reference.

Pattern: [thing] [action] [reason]. [next step].

## Persistence
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.

## Auto-Clarity
Drop caveman for: security warnings, irreversible actions, user confused. Resume after.

## Boundaries
Code/commits/PRs: write normal. "stop caveman" / "normal mode": revert.
`

const CLAUDE_MD_RULES = `# Caveman Mode — Active

Respond terse like smart caveman. All technical substance stay. Only fluff die.

**Rules:**
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- No tool-call narration, no decorative tables/emoji.
- Pattern: [thing] [action] [reason]. [next step].
- Active every response. No style drift.

**Stop caveman:** user says "stop caveman" or "normal mode".
`

const TOOL_CALL_RE = /^\[(Read|Write|Edit|Bash|Grep|Glob|WebSearch|WebFetch|Task|Question|Skill|Tool|Search|Replace)\b/i
const THOUGHT_RE = /^\s*thought:\s*\d+ms/i
const TIMING_RE = /^\[(\d+\.?\d*)(ms|s)\]/i
const TOOK_RE = /^took \d+\.?\d* (ms|seconds)/i
const SYSTEM_REMINDER_RE = /^<\/?system-reminder>/i
const LSP_RE = /^LSPs?\s+(are\s+)?disabled/i
const BUILD_RE = /^Build · /i
const TOKEN_STATS_RE = /^\d+\s+tokens?(?:\s|$)/i
const TOKEN_LABEL_RE = /^(Total|Input|Output)\s+Tokens?:/i
const SHELL_PROMPT_RE = /^\$?\s*(cd|ls|cat|git|npm|node|echo|exit|clear)\b/i
const SHELL_ARROW_RE = /^\s*[❯▶$#]\s/
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T/
const VERSION_RE = /^(Using\s+)?(python|node|typescript|javascript|go|rust|ruby|java|kotlin|swift)\b.*version/i
const HASH_RE = /^(sha256|sha384|sha512)[a-f0-9]+\s+/
const DEC_SEQ_RE = /^\[?\?[\d;]+[a-z$]/i

export class CavemanService {
  private sessions = new Map<string, InternalSession>()
  private dataDir = ''
  private runCounter = 0
  private onRunCompleteCbs: ((sessionId: string, run: CavemanRun) => void)[] = []

  onRunComplete(cb: (sessionId: string, run: CavemanRun) => void): void {
    this.onRunCompleteCbs.push(cb)
  }

  private emitRunComplete(sessionId: string, run: CavemanRun): void {
    for (const cb of this.onRunCompleteCbs) {
      try { cb(sessionId, run) } catch {}
    }
  }

  setDataDir(dir: string): void {
    this.dataDir = dir
    this.loadFromDisk()
  }

  private getFilePath(): string {
    return path.join(this.dataDir, 'caveman-data.json')
  }

  private loadFromDisk(): void {
    if (!this.dataDir) return
    const fp = this.getFilePath()
    try {
      if (fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, 'utf-8')
        const data = JSON.parse(raw) as { sessions: [string, any][] }
        if (data?.sessions) {
          for (const [sid, s] of data.sessions) {
            s.currentRun = null
            s.rawBuffer = ''
            s.pendingPrompt = ''
            if (s.runs) {
              for (const run of s.runs) {
                if ('totalRawTokens' in run) {
                  run.totalCompressedTokens = run.totalRawTokens
                  run.totalOriginalTokens = run.totalExpandedTokens || 0
                  run.totalSavedTokens = Math.max(0, run.totalOriginalTokens - run.totalCompressedTokens)
                  delete run.totalRawTokens
                  delete run.totalExpandedTokens
                }
                if (run.chunks) {
                  for (const chunk of run.chunks) {
                    if ('rawText' in chunk) {
                      chunk.compressedText = chunk.rawText
                      chunk.originalText = chunk.expandedText || ''
                      chunk.compressedTokens = chunk.rawTokens || 0
                      chunk.originalTokens = chunk.expandedTokens || 0
                      chunk.savedTokens = Math.max(0, chunk.originalTokens - chunk.compressedTokens)
                      delete chunk.rawText
                      delete chunk.expandedText
                      delete chunk.rawTokens
                      delete chunk.expandedTokens
                    }
                  }
                }
              }
            }
            this.sessions.set(sid, s)
            if (s.runs.length > this.runCounter) {
              this.runCounter = s.runs.length
            }
          }
        }
      }
    } catch {}
  }

  private saveToDisk(): void {
    if (!this.dataDir) return
    try {
      fs.mkdirSync(this.dataDir, { recursive: true })
      const serializable: [string, any][] = []
      for (const [sid, s] of this.sessions) {
        serializable.push([sid, {
          enabled: s.enabled,
          level: s.level,
          runs: s.runs,
          currentRun: null,
          rawBuffer: '',
          pendingPrompt: '',
          startTime: s.startTime,
        }])
      }
      fs.writeFileSync(this.getFilePath(), JSON.stringify({ sessions: serializable }, null, 2), 'utf-8')
    } catch {}
  }

  getState(sessionId: string): CavemanStats | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return {
      sessionId,
      enabled: s.enabled,
      level: s.level,
      runs: s.runs,
      currentRun: s.currentRun,
      startTime: s.startTime,
      uptime: Date.now() - s.startTime,
    }
  }

  getAllStates(): CavemanStats[] {
    const result: CavemanStats[] = []
    for (const [sessionId] of this.sessions) {
      const state = this.getState(sessionId)
      if (state) result.push(state)
    }
    return result
  }

  setEnabled(sessionId: string, enabled: boolean, level?: string): void {
    if (enabled) {
      if (!this.sessions.has(sessionId)) {
        this.sessions.set(sessionId, {
          enabled: true,
          level: (level as any) || 'full',
          runs: [],
          currentRun: null,
          rawBuffer: '',
          pendingPrompt: '',
          startTime: Date.now(),
        })
      } else {
        const existing = this.sessions.get(sessionId)!
        existing.enabled = true
        existing.level = (level as any) || 'full'
      }
    } else {
      const existing = this.sessions.get(sessionId)
      if (existing) {
        this.endRun(sessionId)
        existing.enabled = false
      }
    }
    this.saveToDisk()
  }

  isEnabled(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.enabled ?? false
  }

  getLevel(sessionId: string): string {
    return this.sessions.get(sessionId)?.level || 'full'
  }

  setPendingPrompt(sessionId: string, text: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.enabled) return
    state.pendingPrompt = text.slice(0, 500)
  }

  private consumePrompt(sessionId: string): string {
    const state = this.sessions.get(sessionId)
    if (!state || !state.pendingPrompt) return ''
    const p = state.pendingPrompt
    state.pendingPrompt = ''
    return p
  }

  startRun(sessionId: string, prompt?: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.enabled) return

    this.endRun(sessionId)
    state.rawBuffer = ''

    const actualPrompt = prompt || this.consumePrompt(sessionId) || '(unknown)'
    this.runCounter++
    state.currentRun = {
      id: `run_${this.runCounter}_${Date.now()}`,
      prompt: actualPrompt.slice(0, 500),
      startedAt: Date.now(),
      endedAt: 0,
      chunks: [],
      totalCompressedTokens: 0,
      totalOriginalTokens: 0,
      totalSavedTokens: 0,
      removedWords: [],
    }
  }

  endRun(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.currentRun) return
    const run = state.currentRun
    run.endedAt = Date.now()

    const originalText = state.rawBuffer.trim()
    state.rawBuffer = ''

    if (originalText.length > 10) {
      const compressedText = compressAgentOutput(originalText)
      const originalTokens = estimateTokens(originalText)
      const compressedTokens = estimateTokens(compressedText)
      const savedTokens = Math.max(0, originalTokens - compressedTokens)
      const removed = findRemovedWords(compressedText, originalText)

      const chunk: CavemanChunk = {
        compressedText,
        originalText,
        compressedTokens,
        originalTokens,
        savedTokens,
        removed: removed.slice(0, 20),
      }

      run.chunks = [chunk]
      run.totalCompressedTokens = compressedTokens
      run.totalOriginalTokens = originalTokens
      run.totalSavedTokens = savedTokens
      run.removedWords = removed.slice(0, 30)
    }

    state.runs.push(run)
    if (state.runs.length > 100) state.runs = state.runs.slice(-100)
    state.currentRun = null
    this.emitRunComplete(sessionId, run)
    this.saveToDisk()
  }

  processOutput(sessionId: string, text: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.enabled) return

    let clean = cleanTerminalOutput(text)
    if (!clean || clean.length < 20) return
    if (HASH_RE.test(clean)) return
    if (TIMESTAMP_RE.test(clean)) return
    if (SHELL_PROMPT_RE.test(clean) && clean.length < 60) return
    if (SHELL_ARROW_RE.test(clean)) return
    if (DEC_SEQ_RE.test(clean)) return
    if (TOOL_CALL_RE.test(clean) && clean.length < 80) return
    if (estimateTokens(clean) < 5) return

    let run = state.currentRun
    if (!run) {
      const autoPrompt = this.consumePrompt(sessionId) || '(unknown)'
      this.runCounter++
      run = {
        id: `run_${this.runCounter}_${Date.now()}`,
        prompt: autoPrompt.slice(0, 500),
        startedAt: Date.now(),
        endedAt: 0,
        chunks: [],
        totalCompressedTokens: 0,
        totalOriginalTokens: 0,
        totalSavedTokens: 0,
        removedWords: [],
      }
      state.currentRun = run
      state.rawBuffer = ''
    }

    if (state.rawBuffer) state.rawBuffer += ' '
    state.rawBuffer += clean
  }

  writeSkillFiles(workspacePath: string, agentId: string): void {
    if (!workspacePath) return
    switch (agentId) {
      case 'opencode': {
        const dir = path.join(workspacePath, '.opencode', 'skills', 'caveman')
        const p = path.join(dir, 'SKILL.md')
        try {
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(p, SKILL_MD, 'utf-8')
        } catch {}
        break
      }
      case 'claude': {
        const p = path.join(workspacePath, 'CLAUDE.md')
        try {
          let existing = ''
          try { existing = fs.readFileSync(p, 'utf-8') } catch {}
          if (!existing.includes('Caveman Mode')) {
            fs.writeFileSync(p, existing.trim() ? existing + '\n\n' + CLAUDE_MD_RULES : CLAUDE_MD_RULES, 'utf-8')
          }
        } catch {}
        break
      }
    }
  }

  removeSkillFiles(workspacePath: string, agentId: string): void {
    if (!workspacePath) return
    switch (agentId) {
      case 'opencode': {
        const p = path.join(workspacePath, '.opencode', 'skills', 'caveman', 'SKILL.md')
        try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch {}
        break
      }
      case 'claude': {
        const p = path.join(workspacePath, 'CLAUDE.md')
        try {
          if (fs.existsSync(p)) {
            let content = fs.readFileSync(p, 'utf-8')
            const idx = content.indexOf('# Caveman Mode')
            if (idx !== -1) {
              content = content.slice(0, idx).trim()
              if (content) fs.writeFileSync(p, content, 'utf-8')
              else fs.unlinkSync(p)
            }
          }
        } catch {}
        break
      }
    }
  }

  cleanup(sessionId: string): void {
    this.endRun(sessionId)
    this.saveToDisk()
    this.sessions.delete(sessionId)
  }

  cleanupAll(): void {
    for (const [sid] of this.sessions) {
      this.endRun(sid)
    }
    this.saveToDisk()
    this.sessions.clear()
  }

  getAggregateStats(): CavemanAggregateStats {
    let totalOutputTokens = 0
    let totalSavedTokens = 0
    let sessionsActive = 0
    let earliestStart = Date.now()

    for (const [, state] of this.sessions) {
      if (state.enabled) sessionsActive++
      for (const run of state.runs) {
        totalOutputTokens += run.totalOriginalTokens
        totalSavedTokens += run.totalSavedTokens
      }
      if (state.startTime < earliestStart) earliestStart = state.startTime
    }

    return {
      totalOutputTokens,
      totalSavedTokens,
      sessionsActive,
      uptimeMs: Date.now() - earliestStart,
    }
  }
}

function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function cleanTerminalOutput(text: string): string {
  let clean = text
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1bP[\s\S]*?\x1b\\/g, '')
    .replace(/\x1b[<>]/g, '')
    .replace(/\[\?[\d;]+[a-z\$]/gi, '')
    .replace(/;[\d;]+m?/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u2500-\u259F\u2580-\u259F▄▀█▌▐░▒▓▔▕]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return clean
}

function compressAgentOutput(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (/^```/.test(trimmed)) {
      result.push(line)
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      result.push(line)
      continue
    }

    if (!trimmed) continue

    if (THOUGHT_RE.test(trimmed)) continue
    if (TIMING_RE.test(trimmed)) continue
    if (TOOK_RE.test(trimmed)) continue
    if (SYSTEM_REMINDER_RE.test(trimmed)) continue
    if (TOOL_CALL_RE.test(trimmed)) continue
    if (LSP_RE.test(trimmed)) continue
    if (BUILD_RE.test(trimmed)) continue
    if (TOKEN_STATS_RE.test(trimmed) && trimmed.length < 50) continue
    if (TOKEN_LABEL_RE.test(trimmed)) continue
    if (VERSION_RE.test(trimmed) && trimmed.length < 60) continue
    if (SHELL_PROMPT_RE.test(trimmed) && trimmed.length < 60) continue

    if (/^\[?[\d;]+[A-Za-z$]/.test(trimmed) && trimmed.length < 40) continue

    if (/^⚡/.test(trimmed)) continue

    result.push(line)
  }

  let compressed = result.join('\n')

  compressed = compressed
    .replace(/\b(a|an|the)\s+/gi, '')
    .replace(/\b(just|really|basically|actually|simply|literally|essentially)\s+/gi, '')
    .replace(/\b(sure|certainly|of course|happy to|absolutely|definitely)\s+/gi, '')
    .replace(/\b(perhaps|maybe|probably|possibly|likely)\s+/gi, '')
    .replace(/\bI\s+(think|believe|would say|would think|guess|suppose|reckon)\s+/gi, 'I ')
    .replace(/\b(Let'?s?)\s+(me|us)\s+/gi, '')
    .replace(/\binformation\b/gi, 'info')
    .replace(/\bconfiguration\b/gi, 'config')
    .replace(/\bdocumentation\b/gi, 'docs')
    .replace(/\brepository\b/gi, 'repo')
    .replace(/\bapplication\b/gi, 'app')
    .replace(/\bimplementation\b/gi, 'impl')
    .replace(/\binitialize\b/gi, 'init')
    .replace(/\btemporary\b/gi, 'temp')
    .replace(/\bapproximately\b/gi, 'approx')
    .replace(/\bprevious\b/gi, 'prev')
    .replace(/\bcurrent\b/gi, 'curr')
    .replace(/\binformation\b/gi, 'info')
    .replace(/\bparameter(s)?\b/gi, 'param$1')
    .replace(/\bargument(s)?\b/gi, 'arg$1')
    .replace(/\bproperty\b/gi, 'prop')
    .replace(/\bvalue(s)?\b/gi, 'val$1')
    .replace(/\bdirectory\b/gi, 'dir')
    .replace(/\bplease\b/gi, '')
    .replace(/\b(thank you|thanks|thx|ty)\b/gi, '')
    .replace(/^(Therefore|Thus|Hence|So),?\s*/gim, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!compressed) return text

  return compressed
}

const COMMON_WORDS = new Set([
  'the','and','for','are','was','but','not','you','all','can','has','had','its','that','this',
  'with','from','they','have','been','were','more','some','which','when','what','your','their',
  'each','will','about','than','them','into','also','other','after','just','only','very','such',
  'been','said','does',
])

function isLikelyRealWord(w: string): boolean {
  if (w.length < 3 || w.length > 20) return false
  if (/^[^aeiouy]{4,}$/i.test(w)) return false
  if (/^[a-z]*([a-z])\1{3,}[a-z]*$/i.test(w)) return false
  return true
}

function findRemovedWords(compressed: string, original: string): string[] {
  const normalized = (s: string) => s.replace(/[^a-zA-Z\s]/g, '').toLowerCase()

  const compNorm = normalized(compressed)
  const origNorm = normalized(original)

  const compWords = [...new Set(compNorm.split(/\s+/).filter(w => w.length > 2))]
  const origWords = [...new Set(origNorm.split(/\s+/).filter(w => w.length > 2))]

  const compSet = new Set(compWords)

  const removed: string[] = []

  for (const w of origWords) {
    if (!compSet.has(w) && !COMMON_WORDS.has(w) && isLikelyRealWord(w)) {
      removed.push(w)
    }
  }

  const scored = removed.map(w => ({
    word: w,
    score: w.length + (w.endsWith('ing') ? 3 : 0) + (w.endsWith('tion') ? 3 : 0) + (w.endsWith('ment') ? 2 : 0) + (w.endsWith('ance') ? 2 : 0) + (w.endsWith('ency') ? 2 : 0),
  }))
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, 15).map(s => s.word)
}
