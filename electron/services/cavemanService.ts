import * as fs from 'fs'
import * as path from 'path'

interface CavemanSessionState {
  enabled: boolean
  level: 'lite' | 'full' | 'ultra'
  outputTokens: number
  estimatedSavedTokens: number
  events: CavemanEvent[]
  startTime: number
}

export interface CavemanEvent {
  timestamp: number
  rawText: string
  expandedText: string
  rawTokens: number
  expandedTokens: number
  savedTokens: number
  level: string
  removed: string[]
}

export interface CavemanStats {
  sessionId: string
  enabled: boolean
  level: string
  outputTokens: number
  estimatedSavedTokens: number
  events: CavemanEvent[]
  startTime: number
  uptime: number
}

const SKILL_MD = `---
name: caveman
description: Ultra-compressed communication mode
---

Respond terse like smart caveman. All technical substance stay. Only fluff die.

## Rules
Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). No tool-call narration, no decorative tables/emoji. Technical terms exact. Code blocks unchanged. Errors quoted exact.

Preserve user's dominant language. No self-reference. Never name or announce the style.

Pattern: [thing] [action] [reason]. [next step].

## Auto-Clarity
Drop caveman when: security warnings, irreversible action confirmations, multi-step sequences where fragment order risks misread, user asks to clarify. Resume after clear part done.

## Boundaries
Code/commits/PRs: write normal. "stop caveman" or "normal mode": revert.
`

export class CavemanService {
  private sessions = new Map<string, CavemanSessionState>()

  getState(sessionId: string): CavemanStats | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return {
      sessionId,
      enabled: s.enabled,
      level: s.level,
      outputTokens: s.outputTokens,
      estimatedSavedTokens: s.estimatedSavedTokens,
      events: s.events,
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
      const existing = this.sessions.get(sessionId)
      this.sessions.set(sessionId, {
        enabled: true,
        level: (level as any) || existing?.level || 'full',
        outputTokens: existing?.outputTokens || 0,
        estimatedSavedTokens: existing?.estimatedSavedTokens || 0,
        events: existing?.events || [],
        startTime: existing?.startTime || Date.now(),
      })
    } else {
      const existing = this.sessions.get(sessionId)
      if (existing) {
        this.sessions.set(sessionId, { ...existing, enabled: false })
      }
    }
  }

  isEnabled(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.enabled ?? false
  }

  getLevel(sessionId: string): string {
    return this.sessions.get(sessionId)?.level || 'full'
  }

  processOutput(sessionId: string, text: string): CavemanEvent | null {
    const state = this.sessions.get(sessionId)
    if (!state || !state.enabled) return null

    const clean = text
      .replace(/\u001b\[\d+(;\d+)*[A-Za-z]/g, '')
      .replace(/\u001b\][\s\S]*?\u0007/g, '')
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .trim()

    if (!clean || clean.length < 10) return null

    const rawTokens = estimateTokens(clean)
    const expanded = expandCavemanText(clean, state.level)
    const expandedTokens = estimateTokens(expanded)
    const savedTokens = expandedTokens - rawTokens

    if (savedTokens <= 0) return null

    const removed = findRemovedWords(clean, expanded)

    const event: CavemanEvent = {
      timestamp: Date.now(),
      rawText: clean,
      expandedText: expanded,
      rawTokens,
      expandedTokens,
      savedTokens,
      level: state.level,
      removed: removed.slice(0, 20),
    }

    state.outputTokens += rawTokens
    state.estimatedSavedTokens += savedTokens
    state.events.push(event)
    if (state.events.length > 200) state.events = state.events.slice(-200)

    this.sessions.set(sessionId, state)
    return event
  }

  writeSkillFile(workspacePath: string): string | null {
    if (!workspacePath) return null
    const skillDir = path.join(workspacePath, '.opencode', 'skills', 'caveman')
    const skillPath = path.join(skillDir, 'SKILL.md')
    try {
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(skillPath, SKILL_MD, 'utf-8')
      return skillPath
    } catch {
      return null
    }
  }

  removeSkillFile(workspacePath: string): void {
    if (!workspacePath) return
    const skillPath = path.join(workspacePath, '.opencode', 'skills', 'caveman', 'SKILL.md')
    try {
      if (fs.existsSync(skillPath)) fs.unlinkSync(skillPath)
    } catch {}
  }

  cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  cleanupAll(): void {
    this.sessions.clear()
  }

  getAggregateStats(): { totalOutputTokens: number, totalSavedTokens: number, sessionsActive: number, uptimeMs: number } {
    let totalOutputTokens = 0
    let totalSavedTokens = 0
    let sessionsActive = 0
    let earliestStart = Date.now()

    for (const [, state] of this.sessions) {
      if (state.enabled) sessionsActive++
      totalOutputTokens += state.outputTokens
      totalSavedTokens += state.estimatedSavedTokens
      if (state.startTime < earliestStart) earliestStart = state.startTime
    }

    return {
      totalOutputTokens,
      totalSavedTokens,
      sessionsActive,
      uptimeMs: Date.now() - earliestStart,
    }
  }

  writeCavemanInstructionFile(workspacePath: string, agentType: string): void {
    if (!workspacePath) return
    switch (agentType) {
      case 'opencode':
        this.writeSkillFile(workspacePath)
        break
    }
  }

  removeCavemanInstructionFile(workspacePath: string, agentType: string): void {
    if (!workspacePath) return
    switch (agentType) {
      case 'opencode':
        this.removeSkillFile(workspacePath)
        break
    }
  }
}

function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function expandCavemanText(text: string, _level: string): string {
  let result = text

  result = result.replace(/\bfix\b/gi, 'fix the issue')
  result = result.replace(/\buse\b/gi, 'use the')
  result = result.replace(/\bcheck\b/gi, 'check the')
  result = result.replace(/\bneed\b/gi, 'need to')
  result = result.replace(/\bwant\b/gi, 'want to')
  result = result.replace(/\btry\b/gi, 'try to')
  result = result.replace(/\badd\b/gi, 'add the')
  result = result.replace(/\bset\b/gi, 'set the')
  result = result.replace(/\brun\b/gi, 'run the')
  result = result.replace(/\bconfig\b/gi, 'configuration')

  result = result.replace(/\b(s|re|ve|ll|d|m)\b/gi, (m) => {
    const map: Record<string, string> = { s: ' is', re: ' are', ve: ' have', ll: ' will', d: ' would', m: ' am' }
    return map[m.toLowerCase()] || m
  })

  result = result.replace(/^(\w)/gm, (m) => {
    const capitalize: string[] = ['bug', 'error', 'fix', 'need', 'use', 'check', 'run', 'add', 'set', 'make', 'create', 'implement', 'update', 'remove', 'delete']
    for (const w of capitalize) {
      if (m.toLowerCase().startsWith(w)) return m
    }
    return 'I ' + m.toLowerCase()
  })

  result = result.replace(/\b(Bug|Error|Fix|Issue)\b/g, 'The $1')

  result = result.replace(/\b(let|make|get|set|run|check|add|update|delete|create)\s+(the\s+)?(\w+)\b/gi,
    'We need to $1 $2$3')

  result = result.replace(/\. (\w)/g, (_, c) => `. You should ${c.toLowerCase()}`)

  result = result.replace(/^(it|this|that)(\s)/gim, 'I think $1$2')

  result = result.replace(/\b(cmd|command)\b/gi, 'the command')
  result = result.replace(/\b(file|dir|path|code|script|func|fn)\b/gi, 'the $1')

  result = result.replace(/\.([A-Z])/g, '. $1')

  result = result.replace(/\b(pls|plz)\b/gi, 'please')
  result = result.replace(/\bthx|ty\b/gi, 'thank you')
  result = result.replace(/\bbtw\b/gi, 'by the way')

  return result
}

function findRemovedWords(raw: string, expanded: string): string[] {
  const rawWords = new Set(raw.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  const expandedWords = expanded.toLowerCase().split(/\s+/).filter(w => w.length > 2)

  const removed: string[] = []
  const expandedSet = new Set(expandedWords)
  for (const w of rawWords) {
    if (!expandedSet.has(w) && w.length > 2) removed.push(w)
  }

  const added: string[] = []
  for (const w of expandedWords) {
    if (!rawWords.has(w) && w.length > 3) added.push(w)
  }

  return [...new Set([...removed, ...added])].slice(0, 20)
}
