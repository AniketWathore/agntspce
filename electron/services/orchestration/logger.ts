import * as fs from 'node:fs'
import * as path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

// 5.3 structured logging: JSON-lines log for the orchestration subsystem. Every
// entry carries a timestamp, level, component, and the raw event fields so the
// stats panel or any tooling can aggregate without parsing prose.
export class StructuredLogger {
  private logDir: string
  private filePath: string
  private threshold: LogLevel
  private stream: fs.WriteStream | null = null

  constructor(opts: { logDir: string; level?: LogLevel }) {
    this.logDir = opts.logDir
    this.threshold = opts.level || 'info'
    this.filePath = path.join(this.logDir, 'orchestration.log')
    try {
      fs.mkdirSync(this.logDir, { recursive: true })
      this.stream = fs.createWriteStream(this.filePath, { flags: 'a' })
      this.stream.on('error', () => {})
    } catch {}
  }

  setLevel(level: LogLevel): void {
    this.threshold = level
  }

  log(level: LogLevel, component: string, event: string, fields: Record<string, unknown> = {}): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.threshold]) return
    const entry = {
      ts: new Date().toISOString(),
      level,
      component,
      event,
      ...fields,
    }
    if (this.stream) {
      this.stream.write(JSON.stringify(entry) + '\n')
    }
    // Mirror warn/error to stderr so they surface in dev logs too.
    if (level === 'warn' || level === 'error') {
      console.error(`[${component}] ${event}`, fields)
    }
  }

  info(component: string, event: string, fields: Record<string, unknown> = {}): void {
    this.log('info', component, event, fields)
  }

  warn(component: string, event: string, fields: Record<string, unknown> = {}): void {
    this.log('warn', component, event, fields)
  }

  error(component: string, event: string, fields: Record<string, unknown> = {}): void {
    this.log('error', component, event, fields)
  }

  close(): void {
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
  }
}
