import { PrioritySemaphore } from './prioritySemaphore'
import { ResourceTracker } from './resourceTracker'

interface SessionRecord {
  id: string
  ptyPid: number
  worktreeId: string
  agentId: string
  startedAt: number
  restartCount: number
  lastHealthCheck: number
  healthy: boolean
}

export class AgentOrchestrator {
  private concurrencyLimiter = new PrioritySemaphore(6)
  private resourceTracker = new ResourceTracker()
  private sessions = new Map<string, SessionRecord>()
  private healthInterval: NodeJS.Timeout | null = null
  private readonly MAX_RESTARTS = 3
  private readonly RESTART_WINDOW_MS = 60000
  private readonly HEALTH_TIMEOUT_MS = 15000
  private readonly HEALTH_CHECK_INTERVAL_MS = 15000
  private io: any

  constructor(io: any) {
    this.io = io
    this.startHealthChecks()
    this.resourceTracker.startMonitoring()
  }

  async acquireSlot(priority = 1, signal?: AbortSignal): Promise<() => void> {
    return this.concurrencyLimiter.acquire(priority, signal)
  }

  registerSession(sessionId: string, ptyPid: number, worktreeId: string, agentId: string): void {
    this.resourceTracker.registerSession(sessionId, ptyPid)
    this.sessions.set(sessionId, {
      id: sessionId,
      ptyPid,
      worktreeId,
      agentId,
      startedAt: Date.now(),
      restartCount: 0,
      lastHealthCheck: Date.now(),
      healthy: true,
    })
  }

  unregisterSession(sessionId: string): void {
    this.resourceTracker.unregisterSession(sessionId)
    this.sessions.delete(sessionId)
  }

  canRestart(sessionId: string): boolean {
    const record = this.sessions.get(sessionId)
    if (!record) return true
    const windowStart = Date.now() - this.RESTART_WINDOW_MS
    return record.restartCount < this.MAX_RESTARTS || record.startedAt < windowStart
  }

  recordRestart(sessionId: string): boolean {
    const record = this.sessions.get(sessionId)
    if (!record) return false
    const windowStart = Date.now() - this.RESTART_WINDOW_MS
    if (record.startedAt < windowStart) {
      record.restartCount = 1
    } else {
      record.restartCount++
    }
    record.startedAt = Date.now()
    return record.restartCount <= this.MAX_RESTARTS
  }

  getConcurrencyLoad(): { active: number, queued: number, max: number } {
    return {
      active: this.concurrencyLimiter.currentLoad,
      queued: this.concurrencyLimiter.queuedCount,
      max: 6,
    }
  }

  getSessionCount(): number {
    return this.sessions.size
  }

  getResourceUsage(sessionId: string) {
    return this.resourceTracker.getUsage(sessionId)
  }

  getAllResourceUsage() {
    return this.resourceTracker.getAllUsage()
  }

  getTotalMemoryMB(): number {
    return this.resourceTracker.getTotalMemoryMB()
  }

  private startHealthChecks(): void {
    if (this.healthInterval) return
    this.healthInterval = setInterval(() => this.runHealthCheck(), this.HEALTH_CHECK_INTERVAL_MS)
  }

  private stopHealthChecks(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval)
      this.healthInterval = null
    }
  }

  private runHealthCheck(): void {
    const now = Date.now()
    for (const [sessionId, record] of this.sessions) {
      if (now - record.lastHealthCheck > this.HEALTH_TIMEOUT_MS * 2) {
        record.healthy = false
        try {
          this.io.emit('session-unhealthy', { sessionId, reason: 'health-check-timeout' })
        } catch {}
      }

      if (this.resourceTracker.isOverMemoryThreshold(sessionId)) {
        record.healthy = false
        try {
          this.io.emit('session-unhealthy', {
            sessionId,
            reason: 'memory-threshold-exceeded',
            usage: this.resourceTracker.getUsage(sessionId),
          })
        } catch {}
      }

      record.lastHealthCheck = now
    }
  }

  markHealthCheck(sessionId: string): void {
    const record = this.sessions.get(sessionId)
    if (record) {
      record.lastHealthCheck = Date.now()
      record.healthy = true
    }
  }

  isHealthy(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.healthy ?? true
  }

  async shutdownAll(): Promise<void> {
    this.stopHealthChecks()
    this.resourceTracker.stopMonitoring()
    this.concurrencyLimiter.reset()
    this.sessions.clear()
    this.resourceTracker.clear()
  }

  async shutdownWorkspace(workspaceId: string, sessionManager: any): Promise<void> {
    const toClose: string[] = []
    for (const [sessionId, record] of this.sessions) {
      const state = sessionManager.getSessionStates()
      if (state[sessionId]?.worktreeId === record.worktreeId) {
        toClose.push(sessionId)
      }
    }
    for (const id of toClose) {
      sessionManager.closeSession(id)
      this.unregisterSession(id)
    }
  }

  reset(): void {
    this.shutdownAll()
    this.resourceTracker.clear()
  }
}
