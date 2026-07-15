import { spawnSync } from 'child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import * as fs from 'node:fs'
import { getRegistry } from './rtk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let agntspceScriptPath: string | null = null

function findAgntspceScript(): string | null {
  if (agntspceScriptPath) return agntspceScriptPath

  const ext = process.platform === 'win32' ? '.cmd' : ''
  const candidates = [
    join(__dirname, '..', '..', 'bin', 'agntspce' + ext),
    join(__dirname, '..', '..', 'bin', 'agntspce'),
    join(process.resourcesPath || '', 'bin', 'agntspce' + ext),
    join(process.resourcesPath || '', 'bin', 'agntspce'),
  ]

  for (const p of candidates) {
    const resolved = resolve(p)
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        agntspceScriptPath = resolved
        return resolved
      }
    } catch {}
  }
  return null
}

export interface RewriteResult {
  command: string
  shouldRewrite: boolean
  verdict: 'allow' | 'passthrough'
}

const registry = getRegistry()

export function rewriteCommand(command: string): RewriteResult {
  const trimmed = command.trim()
  if (!trimmed) return { command, shouldRewrite: false, verdict: 'passthrough' }

  const hasFilter = registry.hasSpecificFilter(trimmed)
  if (hasFilter) {
    return { command: `agntspce run ${trimmed}`, shouldRewrite: true, verdict: 'allow' }
  }
  return { command: trimmed, shouldRewrite: false, verdict: 'passthrough' }
}

export function hasRtkRewrite(command: string): boolean {
  return rewriteCommand(command).shouldRewrite
}

export function isAvailable(): boolean {
  return true
}

export function getRtkBinaryPath(): string | null {
  return findAgntspceScript()
}

export function getVersion(): string {
  return `agntspce v0.1.0 (built-in)`
}
