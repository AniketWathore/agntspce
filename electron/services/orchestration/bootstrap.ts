import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createHash } from 'node:crypto'
import { StateManager } from './stateManager'
import { Coordinator } from './coordinator'

export interface DiscoveryInfo {
  pid: number
  socketPath: string
  dbPath: string
  workspaceRoot: string
  startedAt: number
}

function hashWorkspaceRoot(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 12)
}

export function getSocketPath(workspaceRoot: string): string {
  const hash = hashWorkspaceRoot(workspaceRoot)
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\agntspce-${hash}`
  }
  return path.join(os.tmpdir(), `agntspce-${hash}.sock`)
}

export function getDbPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agntspce', 'coordinator.db')
}

export function getDiscoveryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agntspce', 'coordinator.json')
}

export function getWorkspaceRoot(startPath?: string): string | null {
  let dir = startPath ? path.resolve(startPath) : process.cwd()
  while (true) {
    if (fs.existsSync(path.join(dir, '.git')) ||
        fs.existsSync(path.join(dir, '.agntspce')) ||
        fs.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function readDiscovery(workspaceRoot: string): DiscoveryInfo | null {
  const discoveryPath = getDiscoveryPath(workspaceRoot)
  try {
    const raw = fs.readFileSync(discoveryPath, 'utf-8')
    return JSON.parse(raw) as DiscoveryInfo
  } catch {
    return null
  }
}

export function writeDiscovery(info: DiscoveryInfo): void {
  const discoveryPath = getDiscoveryPath(info.workspaceRoot)
  fs.mkdirSync(path.dirname(discoveryPath), { recursive: true })
  fs.writeFileSync(discoveryPath, JSON.stringify(info, null, 2), 'utf-8')
}

export function clearDiscovery(workspaceRoot: string): void {
  try {
    fs.unlinkSync(getDiscoveryPath(workspaceRoot))
  } catch {}
}

export function isCoordinatorAlive(discovery: DiscoveryInfo): boolean {
  try {
    process.kill(discovery.pid, 0)
    return true
  } catch {
    return false
  }
}

export interface EnsureCoordinatorOptions {
  workspaceRoot?: string
  stateManager?: StateManager
  socketPath?: string
}

export interface EnsureCoordinatorResult {
  coordinator: Coordinator | null
  stateManager: StateManager | null
  workspaceRoot: string | null
  status: 'started' | 'already_running' | 'no_workspace' | 'error'
  error?: string
  ready: Promise<void>
}

export async function ensureCoordinator(options?: EnsureCoordinatorOptions): Promise<EnsureCoordinatorResult> {
  const workspaceRoot = options?.workspaceRoot || getWorkspaceRoot()
  if (!workspaceRoot) {
    return { coordinator: null, stateManager: null, workspaceRoot: null, status: 'no_workspace', ready: Promise.resolve() }
  }

  const dbPath = getDbPath(workspaceRoot)
  const socketPath = options?.socketPath || getSocketPath(workspaceRoot)

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const existing = readDiscovery(workspaceRoot)
  if (existing) {
    if (isCoordinatorAlive(existing)) {
      return { coordinator: null, stateManager: null, workspaceRoot, status: 'already_running', ready: Promise.resolve() }
    }
    clearDiscovery(workspaceRoot)
  }

  if (process.platform !== 'win32') {
    try { fs.unlinkSync(socketPath) } catch {}
  }

  try {
    const stateManager = options?.stateManager || new StateManager(dbPath, workspaceRoot)
    const coordinator = new Coordinator(socketPath, stateManager)
    await coordinator.listen()

    writeDiscovery({
      pid: process.pid,
      socketPath,
      dbPath,
      workspaceRoot,
      startedAt: Date.now(),
    })

    if (process.platform !== 'win32') {
      try { fs.chmodSync(socketPath, 0o600) } catch {}
    }

    return { coordinator, stateManager, workspaceRoot, status: 'started', ready: Promise.resolve() }
  } catch (err: any) {
    return { coordinator: null, stateManager: null, workspaceRoot: null, status: 'error', error: err.message, ready: Promise.resolve() }
  }
}
