import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'node:url'
import * as crypto from 'node:crypto'
import type { Session, SessionConfig, SavedSessionData, Worktree, Workspace } from './types'
import { StatusDetector } from './statusDetector'
import { GitHelper } from './gitHelper'
import { WorktreeHelper } from './worktreeHelper'
import { OutputFilterService, type CommandEvent } from './outputFilter'
import { WorkspaceManager } from './workspaceManager'
import { AgentOrchestrator } from './agentOrchestrator'
import { TokenUsageTracker } from './outputCompressor'
import { CavemanService } from './cavemanService'
import { RingBuffer } from './ringBuffer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
let AGNTSPCE_BIN_DIR = ''
for (const dir of [
  path.resolve(__dirname, '..', '..', 'bin'),
  path.resolve(process.resourcesPath || '', 'bin'),
]) {
  if (fs.existsSync(dir)) {
    AGNTSPCE_BIN_DIR = dir
    break
  }
}

let pty: any = null
try {
  pty = require('node-pty')
} catch (e) {
  console.error('node-pty failed to load:', e)
}

function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/bash'
}

function getShellName(): string {
  const shell = getDefaultShell()
  return shell.split('/').pop() || 'bash'
}

function buildShellArgs(commands: string | string[]): string[] {
  if (process.platform === 'win32') {
    let cmds = Array.isArray(commands) ? commands : [commands]
    cmds = cmds.filter(c => !c.startsWith('cd '))
    const joined = cmds.join('; ').replace(/2>\/dev\/null/g, '2>$null').replace(/\|\| echo unknown/g, '')
    if (!joined.trim()) return ['-NoExit', '-NoProfile']
    return ['-NoExit', '-NoProfile', '-Command', joined]
  }
  const shellName = getShellName()
  const joined = Array.isArray(commands) ? commands.join(' && ') : commands
  const keepOpen = joined && joined.trim() ? `${joined} && exec ${shellName}` : `exec ${shellName}`
  return ['-c', keepOpen]
}

// ─── RTK Integration ────────────────────────────────────────────

// Must match EMBEDDED_SECRET in rtk-develop/src/core/activation.rs
const RTK_HMAC_SECRET = 'agntspce-rtk-integration-v1-do-not-rely-on-this-for-security'
const RTK_TOKEN_TTL_SECS = 86400 // 24 hours — covers realistic session lifetimes

/// Resolve the path to the bundled RTK binary.
/// Priority:
///   1. Bundled alongside the app's own resources (production — `extraResources`)
///   2. Bundled alongside the app's bin directory (dev builds)
///   3. Installed at ~/.local/share/agntspce/rtk/rtk (legacy/manual install)
function getRtkBinaryPath(): string {
  const homeDir = os.homedir()
  const candidates = [
    // Production: bundled via electron-builder extraResources → Resources/rtk/rtk
    path.join(process.resourcesPath || '', 'rtk', 'rtk'),
    // Dev: alongside the app's bin directory
    path.resolve(__dirname, '..', '..', 'bin', 'rtk'),
    // Legacy: manually installed at the data directory
    path.join(homeDir, '.local', 'share', 'agntspce', 'rtk', 'rtk'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return candidates[0] // fallback even if not present — env var still set
}

/// Generate an HMAC-signed session token for the RTK binary.
/// Format: base64url(payload || HMAC-SHA256(secret, payload))
/// payload = `${pid}:${expiry}:${nonce}`
function generateRtkToken(): string {
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + RTK_TOKEN_TTL_SECS
  const nonce = crypto.randomBytes(8).toString('hex')
  const payload = `${process.pid}:${expiry}:${nonce}`
  const sig = crypto.createHmac('sha256', RTK_HMAC_SECRET).update(payload).digest()
  const combined = Buffer.concat([Buffer.from(payload, 'utf-8'), sig])
  return combined.toString('base64url')
}

const OUTBOUND_BUFFER_CAP = 8 * 1024 * 1024

function applyBackpressure(io: any): void {
  try {
    for (const [, socket] of io.sockets.sockets) {
      const transport = (socket as any)?.conn?.transport
      if (transport?.name === 'websocket') {
        const ws = transport.socket as any
        if (ws && ws.bufferedAmount > OUTBOUND_BUFFER_CAP) {
          ws.terminate()
        }
      }
    }
  } catch {}
}

export class SessionManager extends EventEmitter {
  sessions = new Map<string, Session>()
  workspace: Workspace | null = null
  worktrees: Worktree[] = []
  workspaceSessionMaps = new Map<string, Map<string, Session>>()
  private statusDetector: StatusDetector | null = null
  private gitHelper: GitHelper | null = null
  private worktreeHelper = new WorktreeHelper()
  private io: any
  private branchRefreshInterval: NodeJS.Timeout | null = null
  private isWorkspaceSwitching = false
  autoRestartSessions = false
  private agentManager: any = null
  orchestrator: AgentOrchestrator | null = null
  sessionHistory: { id: string, type: string, worktreeId: string, branch: string, status: string, lastActivity: number, closedAt: number, agentId?: string }[] = []
  tokenUsageTracker = new TokenUsageTracker()
  outputFilter = new OutputFilterService()
  cavemanService = new CavemanService()

  constructor(io: any, agentManager?: any, dataDir?: string) {
    super()
    this.io = io
    if (agentManager) this.agentManager = agentManager
    if (dataDir) this.cavemanService.setDataDir(dataDir)
    this.outputFilter.setOnCommandEvent((event) => {
      try {
        this.io.emit('command-filter-event', event)
      } catch {}
    })
    this.cavemanService.onRunComplete((sessionId, run) => {
      try {
        this.io.emit('caveman-run-complete', { sessionId, run })
      } catch {}
    })
  }

  setAgentManager(am: any) { this.agentManager = am }

  setStatusDetector(d: StatusDetector) { this.statusDetector = d }
  setGitHelper(g: GitHelper) { this.gitHelper = g }

  getWorkspace(): Workspace | null {
    return this.workspace
  }

  setWorkspace(workspace: Workspace | null) {
    this.workspace = workspace
    this.worktrees = []
    if (!workspace) return
    this.buildWorktreesFromWorkspace()
    if (workspace.id && !this.workspaceSessionMaps.has(workspace.id)) {
      this.workspaceSessionMaps.set(workspace.id, new Map())
    }
  }

  private buildWorktreesFromWorkspace() {
    if (!this.workspace) return
    this.worktrees = []
    const { repository, worktrees: wtConfig, terminals } = this.workspace

    if (Array.isArray(terminals)) {
      const seen = new Set<string>()
      for (const t of terminals) {
        const key = `${t.repository?.name}-${t.worktree}`
        if (seen.has(key)) continue
        seen.add(key)
        this.worktrees.push({
          id: key,
          worktreeId: t.worktree,
          repositoryName: t.repository?.name,
          repositoryPath: t.repository?.path,
          path: t.worktreePath || path.join(t.repository?.path || '', t.worktree || ''),
        })
      }
    } else if (repository && wtConfig?.enabled) {
      const pairs = terminals?.pairs || 1
      for (let i = 1; i <= pairs; i++) {
        const wtId = wtConfig.namingPattern.replace('{n}', i)
        this.worktrees.push({ id: wtId, path: path.join(repository.path, wtId) })
      }
    }
  }

  async switchWorkspacePreservingSessions(workspace: Workspace) {
    if (!workspace?.id) throw new Error('Workspace missing id')
    const prevId = this.workspace?.id || null
    if (prevId === workspace.id) {
      this.setWorkspace(workspace)
      this.workspaceSessionMaps.set(workspace.id, this.sessions)
      return { sessions: this.getSessionStates(), backlog: {} }
    }
    if (prevId && prevId !== workspace.id) {
      this.workspaceSessionMaps.set(prevId, this.sessions)
    }
    this.setWorkspace(workspace)
    const restored = this.workspaceSessionMaps.get(workspace.id)
    this.sessions = restored || new Map()
    this.workspaceSessionMaps.set(workspace.id, this.sessions)
    await this.initializeSessions({ preserveExisting: true })
    return { sessions: this.getSessionStates(), backlog: this.getUndeliveredOutputAndMarkDelivered() }
  }

  async initializeSessions(options: { preserveExisting?: boolean } = {}) {
    this.isWorkspaceSwitching = true
    if (!options.preserveExisting) {
      this.cleanupAllSessions()
    }
    if (!this.workspace) {
      this.isWorkspaceSwitching = false
      return
    }
    if (!this.autoRestartSessions) {
      this.isWorkspaceSwitching = false
      return
    }

    // Ensure worktree directories exist
    for (const wt of this.worktrees) {
      try {
        await fs.promises.access(wt.path)
      } catch {
        try {
          await fs.promises.mkdir(wt.path, { recursive: true })
        } catch { }
      }
    }

    const promises: Promise<void>[] = []

    if (Array.isArray(this.workspace.terminals)) {
      for (const terminal of this.workspace.terminals) {
        const wtKey = `${terminal.repository?.name}-${terminal.worktree}`
        const wt = this.worktrees.find(w => w.id === wtKey)
        if (!wt) continue
        const sessionId = terminal.id
        if (this.sessions.has(sessionId)) continue

        let args: string[]
        if (terminal.terminalType === 'claude') {
          args = buildShellArgs(`cd "${wt.path}"`)
        } else {
          args = buildShellArgs([
            `cd "${wt.path}"`,
            `echo "=== ${terminal.repository?.name}/${terminal.worktree} ==="`,
            `echo "Directory: ${wt.path}"`,
            `echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"`,
            `echo ""`,
          ])
        }

        promises.push(
          Promise.resolve().then(() => {
            this.createSession(sessionId, {
              command: getDefaultShell(),
              args,
              cwd: wt.path,
              type: terminal.terminalType,
              worktreeId: terminal.worktree,
              repositoryName: terminal.repository?.name,
              repositoryType: terminal.repository?.type,
            })
          })
        )
      }
    } else {
      for (const wt of this.worktrees) {
        const claudeId = `${wt.id}-claude`
        if (!this.sessions.has(claudeId)) {
          promises.push(
            Promise.resolve().then(() => {
              this.createSession(claudeId, {
                command: getDefaultShell(),
                args: buildShellArgs(`cd "${wt.path}"`),
                cwd: wt.path,
                type: 'claude',
                worktreeId: wt.id,
              })
            })
          )
        }
        const serverId = `${wt.id}-server`
        if (!this.sessions.has(serverId)) {
          promises.push(
            Promise.resolve().then(() => {
              this.createSession(serverId, {
                command: getDefaultShell(),
                args: buildShellArgs([
                  `cd "${wt.path}"`,
                  `echo "=== Server Terminal for ${wt.id} ==="`,
                  `echo "Directory: ${wt.path}"`,
                  `echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"`,
                  `echo ""`,
                ]),
                cwd: wt.path,
                type: 'server',
                worktreeId: wt.id,
              })
            })
          )
        }
        if (this.gitHelper) {
          promises.push(
            Promise.resolve().then(() => this.updateGitBranch(wt.id, wt.path))
          )
        }
      }
    }
    await Promise.all(promises)

    if (this.workspace?.id) {
      this.workspaceSessionMaps.set(this.workspace.id, this.sessions)
    }
    this.isWorkspaceSwitching = false
    this.startBranchRefresh()
  }

  createSession(sessionId: string, config: SessionConfig) {
    if (!pty) throw new Error('node-pty unavailable')
    const env: any = { ...process.env, TERM: 'xterm-color' }

    const AGENT_TYPES = ['opencode', 'claude', 'codex', 'gemini', 'aider', 'cursor-agent', 'copilot', 'mastracode', 'droid', 'amp', 'pi']
    if (AGENT_TYPES.includes(config.type)) {
      const binDir = AGNTSPCE_BIN_DIR
      if (fs.existsSync(binDir)) {
        env.AGNTSPCE_ORIGINAL_PATH = env.PATH || ''
        env.PATH = `${binDir}:${env.PATH || ''}`
      }
      env.AGNTSPCE_ENABLED = '1'

      // Inject RTK token and binary path for the Rust RTK integration.
      // AGNTSPCE_RTK_SESSION is verified by the RTK binary's activation gate.
      // AGNTSPCE_RTK_BINARY tells hook scripts where to find the binary.
      env.AGNTSPCE_RTK_SESSION = generateRtkToken()
      env.AGNTSPCE_RTK_BINARY = getRtkBinaryPath()

      // AGNTSPCE_WRAPPER_PATH tells the OpenCode plugin where to find the
      // agntspce wrapper script (used to run rewritten commands).
      const wrapperCandidates = [
        // Bundled via extraResources → Resources/rtk/agntspce (production)
        path.join(process.resourcesPath || '', 'rtk', 'agntspce'),
        // Dev: alongside the app's bin directory
        path.join(binDir, 'agntspce'),
        // User-local install
        path.join(os.homedir(), '.local', 'bin', 'agntspce'),
        // Legacy: manually placed in the RTK data directory
        path.join(os.homedir(), '.local', 'share', 'agntspce', 'rtk', 'agntspce'),
      ]
      for (const candidate of wrapperCandidates) {
        if (fs.existsSync(candidate)) {
          env.AGNTSPCE_WRAPPER_PATH = candidate
          break
        }
      }
      // Prepend the RTK resource directory to PATH so agent subprocesses
      // can find the agntspce command even if PATH gets sanitized.
      const resourcesRtk = path.join(process.resourcesPath || '', 'rtk')
      const prependDirs = [
        resourcesRtk,
        path.join(os.homedir(), '.local', 'bin'),
      ].filter(d =>
        fs.existsSync(d) && !env.PATH?.startsWith(d + ':')
      )
      if (prependDirs.length > 0) {
        env.PATH = `${prependDirs.join(':')}:${env.PATH || ''}`
      }
    }

    if (this.workspace?.envVars) {
      for (const [key, val] of Object.entries(this.workspace.envVars)) {
        env[key] = val
      }
    }
    const ptyProcess = pty.spawn(config.command, config.args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: config.cwd,
      env,
    })

    const session: Session = {
      id: sessionId,
      pty: ptyProcess,
      type: config.type as any,
      worktreeId: config.worktreeId,
      repositoryName: config.repositoryName,
      repositoryType: config.repositoryType,
      status: 'idle',
      branch: 'unknown',
      buffer: new RingBuffer(),
      deliveredBufferLength: 0,
      lastActivity: Date.now(),
      tokenUsage: 0,
      config,
      statusChangedAt: Date.now(),
      pendingStatus: null,
      pendingStatusTimer: null,
      cwdState: { current: config.cwd, previous: null, stack: [] },
      autoStarted: false,
      claudeLaunchState: null,
    }

    ptyProcess.onData((data: string) => {
      session.buffer.write(data)
      session.lastActivity = Date.now()

      // Process through output filter (detects agntspce $ markers, compresses output, returns modified data for the frontend display)
      const modifiedData = this.outputFilter.processOutput(sessionId, data)

      session.tokenUsage = this.tokenUsageTracker.getUsage(sessionId)?.totalTokens || 0
      this.tokenUsageTracker.trackOutput(sessionId, data)
      const isActive = this.sessions.get(sessionId) === session
      if (isActive) {
        applyBackpressure(this.io)
        try {
          // Send modified data to frontend (with compression applied by outputFilter)
          this.io.emit('terminal-output', { sessionId, data: modifiedData })
        } catch { }
        session.deliveredBufferLength = session.buffer.totalBytes
      }
      this.refreshSessionStatus(sessionId)
    })

    ptyProcess.onExit(({ exitCode, signal }: any) => {
      clearInterval(session.processMonitor!)
      session.status = 'exited'
      this.outputFilter.finalizeCommand(sessionId, exitCode ?? 1)
      this.persistSessionBuffer(sessionId)
      const isActive = this.sessions.get(sessionId) === session
      if (isActive) {
        try {
          this.io.emit('session-exited', { sessionId, exitCode, signal })
        } catch { }
      }
      const canRestart = !this.orchestrator || this.orchestrator.canRestart(sessionId)
      if (isActive && config.type === 'claude' && this.autoRestartSessions && !this.isWorkspaceSwitching && canRestart) {
        this.cleanupSessionBuffer(sessionId)
        this.sessions.delete(sessionId)
        this.orchestrator?.recordRestart(sessionId)
        setTimeout(() => {
          this.createSession(sessionId, {
            ...config,
            args: buildShellArgs(`cd "${config.cwd}" && echo "Claude session ended. Type 'claude' to start a new session." && echo ""`),
          })
        }, 500)
      } else {
        this.cleanupSessionBuffer(sessionId)
        this.sessions.delete(sessionId)
      }
    })

    session.workspace = this.workspace?.id || null
    this.sessions.set(sessionId, session)

    if (this.orchestrator) {
      this.orchestrator.registerSession(sessionId, ptyProcess.pid, config.worktreeId, config.type)
    }

    session.processMonitor = setInterval(() => {
      this.refreshSessionStatus(session.id)
    }, 5000)
  }

  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.pty) return false
    try {
      const clean = data.replace(/\n$/, '').trim()
      if (clean && !/^(claude|opencode|gemini|codex)\b/i.test(clean) && !/^--/.test(clean)) {
        this.cavemanService.setPendingPrompt(sessionId, clean)
      }
      session.pty.write(data)
      return true
    } catch { return false }
  }

  resizeSession(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId)
    if (!session?.pty) return
    try { session.pty.resize(cols, rows) } catch { }
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    this.sessionHistory.push({
      id: sessionId,
      type: session.type,
      worktreeId: session.worktreeId,
      branch: session.branch,
      status: session.status,
      lastActivity: session.lastActivity,
      closedAt: Date.now(),
      agentId: session.agentStartConfig?.agentId,
    })
    if (this.sessionHistory.length > 200) this.sessionHistory = this.sessionHistory.slice(-200)
    this.persistSessionBuffer(sessionId)
    try {
      clearInterval(session.processMonitor!)
      if (session.pty) {
        try { session.pty.kill() } catch { }
      }
    } catch { }
    this.outputFilter.finalizeCommand(sessionId)
    this.outputFilter.cleanup(sessionId)
    this.cavemanService.cleanup(sessionId)
    this.sessions.delete(sessionId)
    this.cleanupSessionBuffer(sessionId)
    this.orchestrator?.unregisterSession(sessionId)
    this.statusDetector.reset(sessionId)
    return true
  }

  createRawSession(type: string, workspacePath?: string, existingSessionId?: string): { sessionId: string } | null {
    const sessionId = existingSessionId || `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const cwd = workspacePath || this.workspace?.repository?.path || process.env.HOME || os.homedir() || '/tmp'
    const args = type === 'shell'
      ? buildShellArgs([`cd "${cwd}"`, `echo "Welcome to AgntSpce"`])
      : buildShellArgs(`cd "${cwd}"`)

    try {
      this.createSession(sessionId, {
        command: getDefaultShell(),
        args,
        cwd,
        type,
        worktreeId: '',
        repositoryName: '',
        repositoryType: '',
      })
      const session = this.sessions.get(sessionId)
      if (session && (type === 'claude' || type === 'codex' || type === 'opencode' || type === 'gemini' || type === 'cursor-agent' || type === 'copilot' || type === 'mastracode' || type === 'droid' || type === 'amp' || type === 'pi')) {
        session.status = 'waiting'
        this.io?.emit('status-change', { sessionId, status: 'waiting' })
      }
      return { sessionId }
    } catch (e: any) {
      console.error('createRawSession failed:', type, e?.message || e)
      return null
    }
  }

  restartSession(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    const config = session.config
    this.closeSession(sessionId)
    setTimeout(() => this.createSession(sessionId, config), 300)
  }

  private persistSessionBuffer(sessionId: string) {
    if (!this.workspace?.id) return
    const session = this.sessions.get(sessionId)
    if (!session) return
    const buf = session.buffer.snapshot()
    if (buf) WorkspaceManager.getInstance().saveSessionBuffer(this.workspace.id, sessionId, buf)
  }

  private cleanupSessionBuffer(sessionId: string) {
    if (!this.workspace?.id) return
    WorkspaceManager.getInstance().deleteSessionBuffer(this.workspace.id, sessionId)
  }

  async saveAllSessionBuffers() {
    if (!this.workspace?.id) return
    const snapshots = new Map<string, string>()
    for (const [id, s] of this.sessions) {
      const buf = s.buffer.snapshot()
      if (buf) snapshots.set(id, buf)
    }
    await WorkspaceManager.getInstance().saveAllSessionBuffers(this.workspace.id, snapshots)
  }

  saveAllSessionBuffersSync() {
    if (!this.workspace?.id) return
    const snapshots = new Map<string, string>()
    for (const [id, s] of this.sessions) {
      const buf = s.buffer.snapshot()
      if (buf) snapshots.set(id, buf)
    }
    WorkspaceManager.getInstance().saveAllSessionBuffersSync(this.workspace.id, snapshots)
  }

  async restoreSessionBuffer(sessionId: string) {
    if (!this.workspace?.id) return
    const session = this.sessions.get(sessionId)
    if (!session) return
    const saved = await WorkspaceManager.getInstance().loadSessionBuffer(this.workspace.id, sessionId)
    if (saved) {
      session.buffer.write(saved)
      session.deliveredBufferLength = 0
    }
  }

  getSessionHistory(): { id: string, type: string, worktreeId: string, branch: string, status: string, lastActivity: number, closedAt: number, agentId?: string }[] {
    return this.sessionHistory
  }

  getSessionSaveData(): SavedSessionData[] {
    const data: SavedSessionData[] = []
    for (const [id, s] of this.sessions) {
      const config = s.agentStartConfig
      data.push({
        id,
        type: s.type,
        cwd: s.config?.cwd || '',
        agentConfig: config
          ? {
              agentId: config.agentId,
              mode: config.mode,
              flags: config.flags,
              model: config.model,
              reasoning: config.reasoning,
              verbosity: config.verbosity,
              resumeId: config.resumeId,
            }
          : undefined,
      })
    }
    return data
  }

  async restoreSessions(sessions: SavedSessionData[]): Promise<void> {
    const restorePromises: Promise<void>[] = []
    for (const saved of sessions) {
      if (this.sessions.has(saved.id)) continue
      const cwd = saved.cwd || this.workspace?.repository?.path || process.env.HOME || '/tmp'
      const result = this.createRawSession(saved.type, cwd, saved.id)
      if (result) {
        if (saved.agentConfig) {
          setTimeout(() => {
            try {
              this.startAgentWithConfig(result.sessionId, saved.agentConfig)
            } catch {}
          }, 300)
        }
        restorePromises.push(this.restoreSessionBuffer(result.sessionId))
      }
    }
    await Promise.all(restorePromises)
  }

  createParallelTask(config: { agentId: string, mode: string, flags: string[], prompt: string, worktreeCount: number, model?: string, reasoning?: string, verbosity?: string }): { sessionIds: string[], groupId: string } {
    const groupId = `parallel-${Date.now()}`
    const agentCfg = this.agentManager?.getAgent(config.agentId)
    const supportsWorktree = agentCfg?.capabilities?.supportsWorktree !== false
    const sessionIds: string[] = []
    const prompt = config.prompt || ''

    let count: number
    let usedWorktrees: any[]

    if (supportsWorktree) {
      const availableWts = this.worktrees.filter(wt => {
        const existingType = [...this.sessions.values()].find(s => s.worktreeId === wt.id && s.type === config.agentId)
        return !existingType
      })
      count = Math.min(config.worktreeCount, availableWts.length || 1)
      usedWorktrees = availableWts
    } else {
      count = 1
      usedWorktrees = []
    }

    for (let i = 0; i < count; i++) {
      const cwd = supportsWorktree && usedWorktrees[i]
        ? usedWorktrees[i].path
        : (this.workspace?.repository?.path || process.env.HOME || '/tmp')
      const worktreeId = supportsWorktree && usedWorktrees[i]
        ? usedWorktrees[i].id
        : (this.workspace?.id || 'default')
      const sessionId = `${groupId}-${i}`
      this.createSession(sessionId, {
        command: getDefaultShell(),
        args: buildShellArgs(`cd "${cwd}"`),
        cwd,
        type: config.agentId,
        worktreeId,
      })
      const session = this.sessions.get(sessionId)
      if (session) {
        session.sessionGroupId = groupId
        session.status = 'waiting'
        try { this.io.emit('status-change', { sessionId, status: 'waiting' }) } catch {}
      }
      sessionIds.push(sessionId)
    }

    if (sessionIds.length > 0) {
      setTimeout(() => {
        for (const sid of sessionIds) {
          try {
            this.startAgentWithConfig(sid, {
              agentId: config.agentId,
              mode: config.mode,
              flags: config.flags,
              model: config.model,
              reasoning: config.reasoning,
              verbosity: config.verbosity,
            })
            if (prompt) {
              setTimeout(() => {
                this.writeToSession(sid, prompt + '\n')
              }, 2000)
            }
          } catch {}
        }
      }, 500)
    }

    return { sessionIds, groupId }
  }

  startAgentWithConfig(sessionId: string, config: any) {
    const session = this.sessions.get(sessionId)
    if (!session || !this.agentManager) return
    const validation = this.agentManager.validateConfig(config)
    if (!validation.valid) throw new Error(validation.error)

    if (this.cavemanService.isEnabled(sessionId) && this.workspace?.repository?.path) {
      this.cavemanService.writeSkillFiles(this.workspace.repository.path, config.agentId)
    }

    const command = this.agentManager.buildCommand(config.agentId, config.mode, config)
    this.writeToSession(sessionId, command + '\n')

    session.autoStarted = true
    session.claudeLaunchState = 'launched'
    session.agentStartConfig = config
    try {
      this.io.emit('agent-started', { sessionId, config })
    } catch {}
  }

  toggleCaveman(sessionId: string, enabled: boolean, level?: string): void {
    this.cavemanService.setEnabled(sessionId, enabled, level)

    const session = this.sessions.get(sessionId)
    const agentId = session?.agentStartConfig?.agentId || 'claude'

    if (enabled && this.workspace?.repository?.path) {
      this.cavemanService.writeSkillFiles(this.workspace.repository.path, agentId)
    } else if (this.workspace?.repository?.path) {
      this.cavemanService.removeSkillFiles(this.workspace.repository.path, agentId)
    }
  }

  getCavemanState(sessionId: string) {
    return this.cavemanService.getState(sessionId)
  }

  getAllCavemanStates() {
    return this.cavemanService.getAllStates()
  }

  getCavemanAggregateStats() {
    return this.cavemanService.getAggregateStats()
  }

  getWorktrees(): Worktree[] {
    return this.worktrees
  }

  getSessionStates(): Record<string, any> {
    const states: Record<string, any> = {}
    for (const [id, s] of this.sessions) {
      states[id] = {
        id: s.id,
        type: s.type,
        worktreeId: s.worktreeId,
        repositoryName: s.repositoryName,
        repositoryType: s.repositoryType,
        status: s.status,
        branch: s.branch,
        lastActivity: s.lastActivity,
        sessionGroupId: s.sessionGroupId,
      }
    }
    return states
  }

  getUndeliveredOutputAndMarkDelivered(): Record<string, string> {
    const backlog: Record<string, string> = {}
    for (const [id, s] of this.sessions) {
      const totalWritten = s.buffer.totalBytes
      const deliveredTotal = s.deliveredBufferLength
      if (totalWritten <= deliveredTotal) continue
      const snapshot = s.buffer.snapshot()
      const undeliveredBytes = totalWritten - deliveredTotal
      const undelivered = snapshot.slice(-undeliveredBytes)
      if (undelivered) backlog[id] = undelivered
      s.deliveredBufferLength = totalWritten
    }
    return backlog
  }

  cleanupAllSessions() {
    for (const [id] of this.sessions) this.closeSession(id)
    this.sessions.clear()
    this.orchestrator?.shutdownAll()
  }

  async updateGitBranch(worktreeId: string, cwd: string, force = false) {
    if (!this.gitHelper) return
    const branch = await this.gitHelper.getCurrentBranch(cwd, force)
    for (const [, s] of this.sessions) {
      if (s.worktreeId === worktreeId || s.config?.cwd === cwd) {
        s.branch = branch
        try {
          this.io.emit('branch-change', { sessionId: s.id, branch, worktreeId })
        } catch { }
      }
    }
  }

  private refreshSessionStatus(sessionId: string) {
    if (!this.statusDetector) return
    const session = this.sessions.get(sessionId)
    if (!session || session.status === 'exited') return

    const oldStatus = session.status
    const status = this.statusDetector.detectStatus(sessionId, session.buffer.snapshot())
    if (status !== session.status) {
      session.status = status as any
      session.statusChangedAt = Date.now()
      try {
        this.io.emit('status-change', { sessionId, status })
      } catch { }
    }

    if (status !== oldStatus) {
      if ((oldStatus === 'busy' || oldStatus === 'waiting') && (status === 'idle' || status === 'exited')) {
        this.cavemanService.endRun(sessionId)
        this.outputFilter.finalizeCommand(sessionId)
      } else if (oldStatus === 'idle' && status === 'busy') {
        this.cavemanService.startRun(sessionId)
      }
    }
  }

  private startBranchRefresh() {
    if (this.branchRefreshInterval) clearInterval(this.branchRefreshInterval)
    const refresh = () => {
      for (const wt of this.worktrees) {
        const wtId = wt.worktreeId || wt.id
        this.updateGitBranch(wtId, wt.path)
      }
    }
    refresh()
    this.branchRefreshInterval = setInterval(refresh, 30000)
  }
}
