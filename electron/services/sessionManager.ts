import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { Session, SessionConfig, SavedSessionData, Worktree, Workspace } from './types'
import { StatusDetector } from './statusDetector'
import { GitHelper } from './gitHelper'
import { WorktreeHelper } from './worktreeHelper'
import { TokenReductionService } from './tokenReduction'
import { WorkspaceManager } from './workspaceManager'

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
    const joined = Array.isArray(commands) ? commands.join('; ') : commands
    return ['-NoExit', '-NoProfile', '-Command', joined]
  }
  const shellName = getShellName()
  const joined = Array.isArray(commands) ? commands.join(' && ') : commands
  const keepOpen = joined && joined.trim() ? `${joined} && exec ${shellName}` : `exec ${shellName}`
  return ['-c', keepOpen]
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
  private maxBufferSize = 100000
  private agentManager: any = null
  tokenReduction = new TokenReductionService()

  constructor(io: any, agentManager?: any) {
    super()
    this.io = io
    if (agentManager) this.agentManager = agentManager
    this.tokenReduction.setOnCompression((event) => {
      try {
        this.io.emit('compression-event', event)
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
      buffer: '',
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
      session.buffer += data
      session.lastActivity = Date.now()
      if (session.deliveredBufferLength > session.buffer.length) {
        session.deliveredBufferLength = session.buffer.length
      }
      const isActive = this.sessions.get(sessionId) === session
      if (isActive) {
        try {
          this.io.emit('terminal-output', { sessionId, data })
        } catch { }
        session.deliveredBufferLength = session.buffer.length
      }
      if (session.buffer.length > this.maxBufferSize) {
        session.buffer = session.buffer.slice(-Math.floor(this.maxBufferSize / 2))
        if (session.deliveredBufferLength > session.buffer.length) {
          session.deliveredBufferLength = session.buffer.length
        }
      }
      this.refreshSessionStatus(sessionId)
    })

    ptyProcess.onExit(({ exitCode, signal }: any) => {
      clearInterval(session.processMonitor!)
      session.status = 'exited'
      this.persistSessionBuffer(sessionId)
      const isActive = this.sessions.get(sessionId) === session
      if (isActive) {
        try {
          this.io.emit('session-exited', { sessionId, exitCode, signal })
        } catch { }
      }
      if (isActive && config.type === 'claude' && !this.isWorkspaceSwitching) {
        this.cleanupSessionBuffer(sessionId)
        this.sessions.delete(sessionId)
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

    session.processMonitor = setInterval(() => {
      this.refreshSessionStatus(session.id)
    }, 5000)
  }

  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.pty) return false
    try {
      const processed = this.tokenReduction.processInput(sessionId, data)
      session.pty.write(processed)
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
    this.persistSessionBuffer(sessionId)
    try {
      clearInterval(session.processMonitor!)
      if (session.pty) {
        try { session.pty.kill() } catch { }
      }
    } catch { }
    this.tokenReduction.cleanup(sessionId)
    this.sessions.delete(sessionId)
    this.cleanupSessionBuffer(sessionId)
    return true
  }

  createRawSession(type: string, workspacePath?: string): { sessionId: string } | null {
    const sessionId = `raw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
      if (session && (type === 'claude' || type === 'codex' || type === 'opencode' || type === 'gemini')) {
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
    if (!session?.buffer) return
    WorkspaceManager.getInstance().saveSessionBuffer(this.workspace.id, sessionId, session.buffer)
  }

  private cleanupSessionBuffer(sessionId: string) {
    if (!this.workspace?.id) return
    WorkspaceManager.getInstance().deleteSessionBuffer(this.workspace.id, sessionId)
  }

  async saveAllSessionBuffers() {
    if (!this.workspace?.id) return
    await WorkspaceManager.getInstance().saveAllSessionBuffers(this.workspace.id, this.sessions)
  }

  async restoreSessionBuffer(sessionId: string) {
    if (!this.workspace?.id) return
    const session = this.sessions.get(sessionId)
    if (!session) return
    const saved = await WorkspaceManager.getInstance().loadSessionBuffer(this.workspace.id, sessionId)
    if (saved) {
      session.buffer = saved
      session.deliveredBufferLength = 0
    }
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
      const cwd = saved.cwd || this.workspace?.repository?.path || process.env.HOME || '/tmp'
      let sessionId: string | null = null
      if (saved.type === 'shell') {
        const result = this.createRawSession('shell', cwd)
        if (result) sessionId = result.sessionId
      } else {
        const result = this.createRawSession(saved.type, cwd)
        if (result) {
          sessionId = result.sessionId
          if (saved.agentConfig) {
            const sid = result.sessionId
            setTimeout(() => {
              try {
                this.startAgentWithConfig(sid, saved.agentConfig)
              } catch {}
            }, 300)
          }
        }
      }
      if (sessionId) {
        restorePromises.push(this.restoreSessionBuffer(sessionId))
      }
    }
    await Promise.all(restorePromises)
  }

  createParallelTask(config: { agentId: string, mode: string, flags: string[], prompt: string, worktreeCount: number, model?: string, reasoning?: string, verbosity?: string }): { sessionIds: string[], groupId: string } {
    const groupId = `parallel-${Date.now()}`
    const availableWts = this.worktrees.filter(wt => {
      const existingType = [...this.sessions.values()].find(s => s.worktreeId === wt.id && s.type === config.agentId)
      return !existingType
    })
    const count = Math.min(config.worktreeCount, availableWts.length || 1)
    const sessionIds: string[] = []
    const prompt = config.prompt || ''

    for (let i = 0; i < count; i++) {
      const wt = availableWts[i] || availableWts[0]
      if (!wt) continue
      const sessionId = `${groupId}-${i}`
      const cwd = wt.path || this.workspace?.repository?.path || process.env.HOME || '/tmp'
      this.createSession(sessionId, {
        command: getDefaultShell(),
        args: buildShellArgs(`cd "${cwd}"`),
        cwd,
        type: config.agentId,
        worktreeId: wt.id,
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
    const command = this.agentManager.buildCommand(config.agentId, config.mode, config)
    this.writeToSession(sessionId, command + '\n')
    session.autoStarted = true
    session.claudeLaunchState = 'launched'
    session.agentStartConfig = config
    try {
      this.io.emit('agent-started', { sessionId, config })
    } catch {}
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
      const undelivered = s.buffer.slice(s.deliveredBufferLength)
      if (undelivered) {
        backlog[id] = undelivered
        s.deliveredBufferLength = s.buffer.length
      }
    }
    return backlog
  }

  cleanupAllSessions() {
    for (const [id] of this.sessions) this.closeSession(id)
    this.sessions.clear()
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
    const status = this.statusDetector.detectStatus(sessionId, session.buffer)
    if (status !== session.status) {
      session.status = status as any
      session.statusChangedAt = Date.now()
      try {
        this.io.emit('status-change', { sessionId, status })
      } catch { }
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
