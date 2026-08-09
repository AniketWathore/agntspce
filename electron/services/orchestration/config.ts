import * as fs from 'node:fs'
import * as path from 'node:path'

// 5.4 config: tunable knobs for the orchestration subsystem, read from
// `config.json` in the workspace root (or the app CWD). Every value has a
// sane default so the system boots zero-config.
export interface OrchestrationConfig {
  maxConcurrentSessions: number
  staleAgentTimeoutMs: number
  useWorktrees: boolean
  gateAutoApprove: boolean
  circuitBreakerThreshold: number
  sweepIntervalMs: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  maxConcurrentSessions: 8,
  staleAgentTimeoutMs: 5 * 60 * 1000,
  useWorktrees: true,
  gateAutoApprove: false,
  circuitBreakerThreshold: 3,
  sweepIntervalMs: 60_000,
  logLevel: 'info',
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asLogLevel(value: unknown, fallback: OrchestrationConfig['logLevel']): OrchestrationConfig['logLevel'] {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : fallback
}

export function loadOrchestrationConfig(baseDir?: string): OrchestrationConfig {
  const candidates = [
    baseDir ? path.join(baseDir, 'config.json') : null,
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), '.agntspce', 'config.json'),
  ].filter((p): p is string => !!p)

  for (const configFile of candidates) {
    try {
      if (!fs.existsSync(configFile)) continue
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
      const o = raw?.orchestration
      if (!o || typeof o !== 'object') return DEFAULT_ORCHESTRATION_CONFIG
      return {
        maxConcurrentSessions: asNumber(o.maxConcurrentSessions, DEFAULT_ORCHESTRATION_CONFIG.maxConcurrentSessions),
        staleAgentTimeoutMs: asNumber(o.staleAgentTimeoutMs, DEFAULT_ORCHESTRATION_CONFIG.staleAgentTimeoutMs),
        useWorktrees: asBoolean(o.useWorktrees, DEFAULT_ORCHESTRATION_CONFIG.useWorktrees),
        gateAutoApprove: asBoolean(o.gateAutoApprove, DEFAULT_ORCHESTRATION_CONFIG.gateAutoApprove),
        circuitBreakerThreshold: asNumber(o.circuitBreakerThreshold, DEFAULT_ORCHESTRATION_CONFIG.circuitBreakerThreshold),
        sweepIntervalMs: asNumber(o.sweepIntervalMs, DEFAULT_ORCHESTRATION_CONFIG.sweepIntervalMs),
        logLevel: asLogLevel(o.logLevel, DEFAULT_ORCHESTRATION_CONFIG.logLevel),
      }
    } catch {}
  }
  return DEFAULT_ORCHESTRATION_CONFIG
}
