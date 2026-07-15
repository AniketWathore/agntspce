import * as fs from 'fs'
import * as path from 'path'

export interface CavemanRun {
  id: string
  prompt: string
  startedAt: number
  endedAt: number
  agentResponseTokens: number
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
  sessionsActive: number
  uptimeMs: number
}

interface InternalSession {
  enabled: boolean
  level: string
  runs: CavemanRun[]
  currentRun: CavemanRun | null
  pendingPrompt: string
  startTime: number
}

function skillMdForLevel(level: string): string {
  const lite = `---
name: caveman
description: Lite compression — drop filler, keep sentences.
---

You are in caveman mode (lite). Respond professionally but without fluff.

## Rules
Drop: filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging (perhaps/maybe/I think).
Keep: articles (a/an/the), full sentences, grammar.
Technical terms exact. Code blocks unchanged. Errors quoted exact.

## Persistence
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.

## Boundaries
Code/commits/PRs: write normal. "stop caveman" / "normal mode": revert.
`

  const full = `---
name: caveman
description: Full compression — fragments, no articles, ~65% fewer tokens.
---

Respond terse like smart caveman. All technical substance stay. Only fluff die.

## Rules
Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). No tool-call narration, no decorative tables/emoji. Technical terms exact. Code blocks unchanged. Errors quoted exact.
Preserve user's dominant language. No self-reference.
Pattern: [thing] [action] [reason]. [next step].

## Persistence
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.

## Auto-Clarity
Drop caveman for: security warnings, irreversible actions, user confused. Resume after.

## Boundaries
Code/commits/PRs: write normal. "stop caveman" / "normal mode": revert.
`

  const ultra = `---
name: caveman
description: Ultra compression — telegraphic, ~75% fewer tokens.
---

Speak maximum terse. Only essential technical content. No grammar.

## Rules
Abbreviate (DB/auth/config/req/res/fn/impl). Strip conjunctions (and/or/but). Arrows for causality (X → Y). One word when one word enough. Drop all articles, filler, pleasantries, hedging. No sentences — fragments only. No tool-call narration, no decorative tables/emoji. Technical terms exact. Code blocks unchanged. Errors quoted exact.
Preserve user's dominant language. No self-reference.

## Persistence
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.

## Auto-Clarity
Drop caveman for: security warnings, irreversible actions, user confused. Resume after.

## Boundaries
Code/commits/PRs: write normal. "stop caveman" / "normal mode": revert.
`

  switch (level) {
    case 'lite': return lite
    case 'ultra': return ultra
    default: return full
  }
}

function claudeMdRulesForLevel(level: string): string {
  const lite = `# Caveman Mode — Lite

Respond professionally without fluff.

**Rules:**
- Drop: filler (just/really/basically), pleasantries, hedging
- Keep: articles, full sentences, grammar
- Technical terms exact. Code unchanged.

**Stop caveman:** user says "stop caveman" or "normal mode".
`

  const full = `# Caveman Mode — Active

Respond terse like smart caveman. All technical substance stay. Only fluff die.

**Rules:**
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- No tool-call narration, no decorative tables/emoji.
- Pattern: [thing] [action] [reason]. [next step].
- Active every response. No style drift.

**Stop caveman:** user says "stop caveman" or "normal mode".
`

  const ultra = `# Caveman Mode — Ultra

Speak maximum terse. Only essential technical content.

**Rules:**
- Abbreviate (DB/auth/config/req/res/fn/impl)
- Strip conjunctions, articles, filler
- Fragments only. Arrows for causality (X → Y)
- Technical terms exact. Code unchanged.

**Stop caveman:** user says "stop caveman" or "normal mode".
`

  switch (level) {
    case 'lite': return lite
    case 'ultra': return ultra
    default: return full
  }
}

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
            s.pendingPrompt = ''
            s.runs = [] // clear old runs — fresh session
            s.startTime = Date.now()
            this.sessions.set(sid, s as InternalSession)
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

    if (state.currentRun) {
      const actualPrompt = prompt || this.consumePrompt(sessionId) || state.currentRun.prompt
      if (state.currentRun.prompt === '(pending)') {
        state.currentRun.prompt = actualPrompt.slice(0, 500)
      }
      return
    }

    this.endRun(sessionId)

    const actualPrompt = prompt || this.consumePrompt(sessionId) || '(pending)'
    this.runCounter++
    state.currentRun = {
      id: `run_${this.runCounter}_${Date.now()}`,
      prompt: actualPrompt.slice(0, 500),
      startedAt: Date.now(),
      endedAt: 0,
      agentResponseTokens: 0,
    }
  }

  endRun(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.currentRun) return
    const run = state.currentRun
    run.endedAt = Date.now()

    if (run.prompt === '(pending)') {
      const stored = this.consumePrompt(sessionId)
      if (stored) {
        run.prompt = stored.slice(0, 500)
      }
    }

    state.runs.push(run)
    if (state.runs.length > 100) state.runs = state.runs.slice(-100)
    state.currentRun = null
    this.emitRunComplete(sessionId, run)
    this.saveToDisk()
  }

  writeSkillFiles(workspacePath: string, agentId: string): void {
    if (!workspacePath) return
    switch (agentId) {
      case 'opencode': {
        const dir = path.join(workspacePath, '.opencode', 'skills', 'caveman')
        const p = path.join(dir, 'SKILL.md')
        try {
          const firstSession = this.sessions.values().next().value
          const level = firstSession?.level || 'full'
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(p, skillMdForLevel(level), 'utf-8')
        } catch {}
        break
      }
      case 'claude': {
        const p = path.join(workspacePath, 'CLAUDE.md')
        try {
          const firstSession = this.sessions.values().next().value
          const level = firstSession?.level || 'full'
          let existing = ''
          try { existing = fs.readFileSync(p, 'utf-8') } catch {}
          if (!existing.includes('Caveman Mode')) {
            fs.writeFileSync(p, existing.trim() ? existing + '\n\n' + claudeMdRulesForLevel(level) : claudeMdRulesForLevel(level), 'utf-8')
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
    let sessionsActive = 0
    let earliestStart = Date.now()

    for (const [, state] of this.sessions) {
      if (state.enabled) sessionsActive++
      if (state.startTime < earliestStart) earliestStart = state.startTime
    }

    return {
      sessionsActive,
      uptimeMs: Date.now() - earliestStart,
    }
  }
}
