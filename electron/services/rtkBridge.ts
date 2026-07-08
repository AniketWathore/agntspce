import { execFileSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import * as fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let rtkBinaryPath: string | null = null

function findRtkBinary(): string {
  if (rtkBinaryPath) return rtkBinaryPath

  const candidates = [
    join(__dirname, '..', '..', '..', 'references', 'rtk-develop', 'target', 'release', 'agntspce'),
    join(process.resourcesPath || '', 'agntspce'),
    join(__dirname, '..', '..', 'bin', 'agntspce'),
    '/Users/prashik/Aniket/CodingAgents/references/rtk-develop/target/release/agntspce',
  ]

  for (const p of candidates) {
    const resolved = resolve(p)
    try {
      if (fs.existsSync(resolved)) {
        fs.accessSync(resolved, fs.constants.X_OK)
        rtkBinaryPath = resolved
        return resolved
      }
    } catch {}
  }
  throw new Error('agntspce binary not found - please build with: cd references/rtk-develop && cargo build --release')
}

export function getRtkBinaryPath(): string {
  return findRtkBinary()
}

export function isAvailable(): boolean {
  try {
    findRtkBinary()
    return true
  } catch {
    return false
  }
}

export interface RewriteResult {
  command: string
  shouldRewrite: boolean
  verdict?: 'allow' | 'ask' | 'deny' | 'passthrough'
}

export function rewriteCommand(command: string): RewriteResult {
  try {
    const binary = findRtkBinary()
    const result = execFileSync(binary, ['rewrite', command], {
      encoding: 'utf-8',
      timeout: 3000,
    })
    const output = result.trim()
    if (output && output !== command) {
      return { command: output, shouldRewrite: true, verdict: 'allow' }
    }
    return { command, shouldRewrite: false, verdict: 'passthrough' }
  } catch (e: any) {
    if (e?.status === 3 && e.stdout) {
      const output = e.stdout.toString().trim()
      if (output && output !== command) {
        return { command: output, shouldRewrite: true, verdict: 'ask' }
      }
    }
    if (e?.status === 2) {
      return { command, shouldRewrite: false, verdict: 'deny' }
    }
    return { command, shouldRewrite: false, verdict: 'passthrough' }
  }
}

export function hasRtkRewrite(command: string): boolean {
  const result = rewriteCommand(command)
  return result.shouldRewrite
}

export interface ProxyResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function proxyCommand(command: string, args: string[], cwd?: string): ProxyResult {
  try {
    const binary = findRtkBinary()
    const result = spawnSync(binary, ['proxy', command, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    })
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.status ?? 1,
    }
  } catch (e: any) {
    return {
      stdout: '',
      stderr: e.message || String(e),
      exitCode: 1,
    }
  }
}

export function getVersion(): string {
  try {
    const binary = findRtkBinary()
    const result = execFileSync(binary, ['--version'], { encoding: 'utf-8', timeout: 2000 })
    return result.trim()
  } catch {
    return 'agntspce (unavailable)'
  }
}
