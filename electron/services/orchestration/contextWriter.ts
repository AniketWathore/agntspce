import * as fs from 'node:fs'
import * as path from 'node:path'
import { SessionSummarizer } from './sessionSummarizer'
import type { StateManager } from './stateManager'

export interface ContextSection {
  title: string
  body: string
}

const MAX_CONTEXT_BYTES = 5 * 1024
const MAX_OUTPUT_TAIL = 1200

// Per-agent context files (2.2): `.agntspce/context/<agentId>.md`, updated on
// output activity. Every section is capped so a file never exceeds ~5KB — the
// trap from the roadmap (summaries capped, never inject full files).
export class ContextWriter {
  private repoPath: string
  private stateManager: StateManager | null
  private summarizer: SessionSummarizer | null
  private lastWriteByAgent = new Map<string, number>()

  constructor(repoPath: string, stateManager?: StateManager | null) {
    this.repoPath = repoPath
    this.stateManager = stateManager ?? null
    this.summarizer = stateManager ? new SessionSummarizer(stateManager.getDb(), repoPath) : null
  }

  setStateManager(sm: StateManager | null): void {
    this.stateManager = sm
    this.summarizer = sm ? new SessionSummarizer(sm.getDb(), this.repoPath) : null
  }

  getContextDir(): string {
    return path.join(this.repoPath, '.agntspce', 'context')
  }

  getContextPath(agentId: string): string {
    return path.join(this.getContextDir(), `${agentId}.md`)
  }

  private throttled(agentId: string, minIntervalMs: number): boolean {
    const last = this.lastWriteByAgent.get(agentId) || 0
    const now = Date.now()
    if (now - last < minIntervalMs) return true
    this.lastWriteByAgent.set(agentId, now)
    return false
  }

  // Build + write the markdown file for one agent. `tailOutput` is a bounded
  // slice of the session's recent output; `taskId` links to the DB summary.
  updateContext(agentId: string, opts: {
    tailOutput?: string
    taskId?: string | null
    branch?: string | null
    status?: string
    minIntervalMs?: number
  } = {}): boolean {
    if (!this.repoPath) return false
    const minIntervalMs = opts.minIntervalMs ?? 1500
    if (this.throttled(agentId, minIntervalMs)) return false

    try {
      const sections: ContextSection[] = []
      const header: string[] = [`# Agent context: ${agentId}`]

      if (opts.status) header.push(`Status: ${opts.status}`)
      if (opts.branch) header.push(`Branch: ${opts.branch}`)

      if (this.summarizer && opts.taskId) {
        try {
          const summary = this.summarizer.summarizeTask(opts.taskId)
          if (summary.summary) {
            sections.push({ title: 'Task', body: summary.summary })
            if (summary.keyFiles.length > 0) {
              sections.push({ title: 'Key files', body: summary.keyFiles.join('\n') })
            }
          }
        } catch {}
      }

      if (opts.tailOutput) {
        const tail = opts.tailOutput.slice(-MAX_OUTPUT_TAIL)
        if (tail.trim()) {
          sections.push({ title: 'Recent activity', body: tail })
        }
      }

      let content = header.join('\n') + '\n'
      for (const sec of sections) {
        content += `\n## ${sec.title}\n\n${sec.body}\n`
      }

      if (content.length > MAX_CONTEXT_BYTES) {
        content = content.slice(0, MAX_CONTEXT_BYTES) + '\n…[truncated]'
      }

      fs.mkdirSync(this.getContextDir(), { recursive: true })
      fs.writeFileSync(this.getContextPath(agentId), content, 'utf-8')
      return true
    } catch (err: any) {
      console.warn('[contextWriter] updateContext failed:', agentId, err?.message || err)
      return false
    }
  }

  clearContext(agentId: string): void {
    try {
      fs.unlinkSync(this.getContextPath(agentId))
    } catch {}
  }

  readContext(agentId: string): string {
    try {
      return fs.readFileSync(this.getContextPath(agentId), 'utf-8')
    } catch {
      return ''
    }
  }
}
