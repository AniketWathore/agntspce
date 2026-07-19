import { estimateTokens } from './utils'

export interface TrackRecord {
  timestamp: string
  originalCmd: string
  filteredCmd: string
  inputTokens: number
  outputTokens: number
  savedTokens: number
  savingsPct: number
  execTimeMs: number
  projectPath: string
}

export interface GainSummary {
  totalCommands: number
  totalInput: number
  totalOutput: number
  totalSaved: number
  avgSavingsPct: number
  totalTimeMs: number
  avgTimeMs: number
  byCommand: [string, number, number, number, number][]
  byDay: [string, number][]
}

export class Tracker {
  private records: TrackRecord[] = []

  record(
    originalCmd: string,
    filteredCmd: string,
    inputTokens: number,
    outputTokens: number,
    execTimeMs: number,
    projectPath?: string,
  ): void {
    const saved = Math.max(0, inputTokens - outputTokens)
    const pct = inputTokens > 0 ? (saved / inputTokens) * 100 : 0
    this.records.push({
      timestamp: new Date().toISOString(),
      originalCmd,
      filteredCmd,
      inputTokens,
      outputTokens,
      savedTokens: saved,
      savingsPct: pct,
      execTimeMs,
      projectPath: projectPath || '',
    })
    if (this.records.length > 10000) this.records = this.records.slice(-5000)
  }

  getSummary(): GainSummary {
    const total = this.records.length
    const totalInput = this.records.reduce((s, r) => s + r.inputTokens, 0)
    const totalOutput = this.records.reduce((s, r) => s + r.outputTokens, 0)
    const totalSaved = this.records.reduce((s, r) => s + r.savedTokens, 0)
    const totalTimeMs = this.records.reduce((s, r) => s + r.execTimeMs, 0)
    const avgSavingsPct = totalInput > 0 ? (totalSaved / totalInput) * 100 : 0
    const avgTimeMs = total > 0 ? totalTimeMs / total : 0

    const byCmd = new Map<string, { count: number; saved: number; pctSum: number; timeSum: number }>()
    for (const r of this.records) {
      const key = r.filteredCmd
      const e = byCmd.get(key) || { count: 0, saved: 0, pctSum: 0, timeSum: 0 }
      e.count++
      e.saved += r.savedTokens
      e.pctSum += r.savingsPct
      e.timeSum += r.execTimeMs
      byCmd.set(key, e)
    }
    const byCommand: [string, number, number, number, number][] = [...byCmd.entries()]
      .sort((a, b) => b[1].saved - a[1].saved)
      .slice(0, 10)
      .map(([cmd, e]) => [cmd, e.count, e.saved, e.count > 0 ? e.pctSum / e.count : 0, Math.round(e.timeSum / e.count)])

    const days = new Map<string, number>()
    for (const r of this.records) {
      const day = r.timestamp.slice(0, 10)
      days.set(day, (days.get(day) || 0) + r.savedTokens)
    }
    const byDay: [string, number][] = [...days.entries()].slice(-30)

    return {
      totalCommands: total,
      totalInput,
      totalOutput,
      totalSaved,
      avgSavingsPct,
      totalTimeMs,
      avgTimeMs: Math.round(avgTimeMs),
      byCommand,
      byDay,
    }
  }

  getAllRecords(): TrackRecord[] {
    return [...this.records]
  }

  reset(): void {
    this.records = []
  }
}

export class TimedExecution {
  private startTime: number

  constructor() {
    this.startTime = Date.now()
  }

  static start(): TimedExecution {
    return new TimedExecution()
  }

  track(
    originalCmd: string,
    filteredCmd: string,
    input: string,
    output: string,
    tracker?: Tracker,
    projectPath?: string,
  ): void {
    const elapsed = Date.now() - this.startTime
    const inputTokens = estimateTokens(input)
    const outputTokens = estimateTokens(output)
    if (tracker) {
      tracker.record(originalCmd, filteredCmd, inputTokens, outputTokens, elapsed, projectPath)
    }
  }

  trackPassthrough(originalCmd: string, filteredCmd: string, tracker?: Tracker): void {
    const elapsed = Date.now() - this.startTime
    if (tracker) {
      tracker.record(originalCmd, filteredCmd, 0, 0, elapsed)
    }
  }
}
