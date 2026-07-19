import { execFile } from 'child_process'

export interface SessionResourceUsage {
  sessionId: string
  pid: number
  cpuPercent: number
  memoryMB: number
  collectedAt: number
}

export interface ResourceThresholds {
  maxMemoryMB: number
  maxCpuPercent: number
  maxSessions: number
}

const DEFAULT_THRESHOLDS: ResourceThresholds = {
  maxMemoryMB: 1024,
  maxCpuPercent: 90,
  maxSessions: 12,
}

export class ResourceTracker {
  private thresholds: ResourceThresholds
  private usageCache = new Map<string, SessionResourceUsage>()
  private intervalId: NodeJS.Timeout | null = null
  private pidToSessionId = new Map<number, string>()

  constructor(thresholds?: Partial<ResourceThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  }

  registerSession(sessionId: string, pid: number): void {
    this.pidToSessionId.set(pid, sessionId)
  }

  unregisterSession(sessionId: string): void {
    for (const [pid, sid] of this.pidToSessionId) {
      if (sid === sessionId) {
        this.pidToSessionId.delete(pid)
        break
      }
    }
    this.usageCache.delete(sessionId)
  }

  startMonitoring(intervalMs = 10000): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.collect(), intervalMs)
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async collect(): Promise<void> {
    const pids = [...this.pidToSessionId.keys()]
    if (pids.length === 0) return

    try {
      const { stdout } = await execFile('ps', ['-eo', 'pid=,pcpu=,rss=', '-p', pids.join(',')], {
        timeout: 3000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })

      for (const line of stdout.trim().split('\n')) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 3) continue
        const pid = parseInt(parts[0])
        const cpu = parseFloat(parts[1])
        const rssKB = parseInt(parts[2])
        const sessionId = this.pidToSessionId.get(pid)
        if (!sessionId) continue

        this.usageCache.set(sessionId, {
          sessionId,
          pid,
          cpuPercent: cpu,
          memoryMB: Math.round(rssKB / 1024),
          collectedAt: Date.now(),
        })
      }
    } catch {}
  }

  getUsage(sessionId: string): SessionResourceUsage | undefined {
    return this.usageCache.get(sessionId)
  }

  getAllUsage(): SessionResourceUsage[] {
    return [...this.usageCache.values()]
  }

  isOverMemoryThreshold(sessionId: string): boolean {
    const usage = this.usageCache.get(sessionId)
    return usage ? usage.memoryMB > this.thresholds.maxMemoryMB : false
  }

  isOverCpuThreshold(sessionId: string): boolean {
    const usage = this.usageCache.get(sessionId)
    return usage ? usage.cpuPercent > this.thresholds.maxCpuPercent : false
  }

  getTotalMemoryMB(): number {
    let total = 0
    for (const usage of this.usageCache.values()) total += usage.memoryMB
    return total
  }

  get thresholds_(): ResourceThresholds {
    return this.thresholds
  }

  clear(): void {
    this.stopMonitoring()
    this.usageCache.clear()
    this.pidToSessionId.clear()
  }
}
