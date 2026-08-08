import * as net from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { StateManager, CoordinatorError, type MessageInfo } from './stateManager'
import { WorktreeLifecycle } from './worktreeLifecycle'
import { MergeGate } from './mergeGate'
import { SessionSummarizer } from './sessionSummarizer'
import { FileWatcher, type FileConflictEvent } from './fileWatcher'
import { StructuredLogger } from './logger'
import { loadOrchestrationConfig, type OrchestrationConfig } from './config'

export interface RpcRequest {
  id: string
  method: string
  params: Record<string, unknown>
}

export interface RpcError {
  code: string
  message: string
  data?: unknown
}

export interface RpcResponse {
  id: string
  result?: unknown
  error?: RpcError
  pendingMessages: MessageInfo[]
}

export interface ProxySession {
  socket: net.Socket
  agentId: string
  buffer: string
}

const IDEMPOTENCY_TTL_MS = 60_000

export class Coordinator {
  private server: net.Server
  private stateManager: StateManager
  private socketPath: string
  private sessions: Map<string, ProxySession> = new Map()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private worktreeLifecycle: WorktreeLifecycle
  private mergeGate: MergeGate
  private sessionSummarizer: SessionSummarizer
  private fileWatcher: FileWatcher | null = null
  private logger: StructuredLogger
  private config: OrchestrationConfig
  // 5.2 idempotency: key = `${agentId}|${method}|${idempotencyKey}`.
  // Duplicate requests (e.g. React StrictMode double-fire) replay the cached
  // response instead of executing twice.
  private idempotencyCache: Map<string, { response: RpcResponse; expiresAt: number }> = new Map()
  private activeIdempotencyKey: string | null = null

  constructor(socketPath: string, stateManager: StateManager, config?: OrchestrationConfig) {
    this.socketPath = socketPath
    this.stateManager = stateManager
    this.config = config || loadOrchestrationConfig(stateManager.getRepoPath())
    this.worktreeLifecycle = new WorktreeLifecycle(stateManager.getRepoPath())
    this.mergeGate = new MergeGate(stateManager.getRepoPath(), this.worktreeLifecycle, this.stateManager)
    this.sessionSummarizer = new SessionSummarizer(stateManager.getDb(), stateManager.getRepoPath())
    this.logger = new StructuredLogger({
      logDir: path.join(stateManager.getRepoPath(), '.agntspce', 'logs'),
      level: this.config.logLevel,
    })
    this.server = net.createServer((socket) => this.handleConnection(socket))
    this.server.unref()
  }

  private getAgentIdForSocket(socket: net.Socket): string | null {
    for (const [agentId, session] of this.sessions) {
      if (session.socket === socket) return agentId
    }
    return null
  }

  async listen(): Promise<void> {
    try {
      await fs.promises.unlink(this.socketPath)
    } catch {}

    return new Promise((resolve) => {
      this.server.listen(this.socketPath, () => {
        this.sweepTimer = setInterval(() => {
          this.sweepStaleAgents()
          this.sweepWorktrees()
        }, this.config.sweepIntervalMs)
        this.sweepTimer.unref()
        this.startFileWatcher()
        this.logger.info('coordinator', 'listen', { socketPath: this.socketPath })
        resolve()
      })
    })
  }

  // 3.2 live file watcher: worktree edits that step on another agent's claim
  // trigger a broadcast notification to every involved agent.
  private startFileWatcher(): void {
    const repoPath = this.stateManager.getRepoPath()
    const worktreeBase = path.join(repoPath, '.agntspce', 'worktrees')
    if (!fs.existsSync(worktreeBase)) return
    this.fileWatcher = new FileWatcher({
      stateManager: this.stateManager,
      repoPath,
      worktreeBase,
      onConflict: (event) => this.handleFileConflict(event),
    })
    this.fileWatcher.start()
  }

  // 3.3 circuit breaker: record a task failure; once it crosses the threshold
  // (3), release the task back to `open` and broadcast so any other agent can
  // pick it up. Returns true when the task was redispatched.
  private recordTaskFailureAndMaybeRedispatch(taskId: string, reason: string): boolean {
    const count = this.stateManager.recordTaskFailure(taskId)
    this.stateManager.postStatusUpdate(taskId, '', `Attempt ${count} failed: ${reason}`)
    if (count < this.config.circuitBreakerThreshold) {
      this.logger.warn('task', 'failure', { taskId, count, reason })
      return false
    }
    const released = this.stateManager.redispatchTask(taskId)
    if (!released) return false
    this.logger.warn('task', 'circuit-breaker', { taskId, count, reason })
    this.stateManager.postStatusUpdate(taskId, '', `Circuit breaker opened after ${count} failures — task released for redispatch`)
    this.stateManager.resetTaskFailures(taskId)
    const releasedTask = this.stateManager.getTask(taskId)
    for (const [aid, session] of this.sessions) {
      if (releasedTask?.agentId && aid === releasedTask.agentId) continue
      this.sendToSession(session, {
        id: '',
        result: {
          type: 'new_message',
          message: `[circuit-breaker] Task ${taskId.slice(0, 8)} failed ${count}× and is now available. Another agent may claim it.`,
        },
        pendingMessages: this.stateManager.getPendingMessages(aid),
      })
    }
    return true
  }

  private handleFileConflict(event: FileConflictEvent): void {    const targets = new Set<string>([event.editorAgentId, ...event.conflictingAgentIds])
    for (const agentId of targets) {
      const session = this.sessions.get(agentId)
      if (!session) continue
      const involved = [...targets].filter(a => a !== agentId).join(', ')
      const content = `[file-conflict] Agent ${event.editorAgentId.slice(0, 8)} is editing ${event.file}, which overlaps your claimed scope. Coordinate with: ${involved || 'nobody'} before merging.`
      this.stateManager.sendMessage('agntspce-coordinator', agentId, false, content, false)
      this.sendToSession(session, {
        id: '',
        result: { type: 'new_message', message: content },
        pendingMessages: this.stateManager.getPendingMessages(agentId),
      })
    }
  }

  close(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    this.fileWatcher?.close()
    this.fileWatcher = null
    for (const session of this.sessions.values()) {
      session.socket.destroy()
    }
    this.sessions.clear()
    this.server.close(() => {
      try { fs.unlinkSync(this.socketPath) } catch {}
    })
    this.logger.info('coordinator', 'close', {})
    this.logger.close()
  }

  getStateManager(): StateManager {
    return this.stateManager
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = ''

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const request: RpcRequest = JSON.parse(trimmed)
          this.handleRequest(socket, request)
        } catch (e) {
          this.sendError(socket, '', 'PARSE_ERROR', `Invalid JSON: ${e}`)
        }
      }
    })

    socket.on('error', () => this.handleDisconnect(socket))
    socket.on('close', () => this.handleDisconnect(socket))
  }

  private handleDisconnect(socket: net.Socket): void {
    const agentId = this.getAgentIdForSocket(socket)
    if (agentId) {
      this.sessions.delete(agentId)
    }
  }

  private async handleRequest(socket: net.Socket, request: RpcRequest): Promise<void> {
    const { id, method, params } = request
    let agentId = this.getAgentIdForSocket(socket) || ''

    const idempotencyKey = (params?.idempotencyKey as string | undefined) || ''
    const dedupKey = idempotencyKey ? `${agentId}|${method}|${idempotencyKey}` : null

    // 5.2 idempotency: replay a cached response for duplicate requests so a
    // double-fired RPC (StrictMode gotcha) never executes its side effects twice.
    if (dedupKey) {
      const cached = this.idempotencyCache.get(dedupKey)
      if (cached && cached.expiresAt > Date.now()) {
        socket.write(JSON.stringify(cached.response) + '\n')
        return
      }
    }

    this.activeIdempotencyKey = dedupKey

    try {
      let result: unknown
      let pendingMessages: MessageInfo[] = []

      const ensureAgent = (): 'ok' | 'not_registered' | 'paused' => {
        if (!agentId) return 'not_registered'
        const agent = this.stateManager.getAgent(agentId)
        if (agent?.status === 'paused') return 'paused'
        return 'ok'
      }

      const checkAgent = (): boolean => {
        const status = ensureAgent()
        if (status === 'not_registered') {
          this.sendError(socket, id, 'NOT_REGISTERED', 'Agent not registered. Call register_agent first.')
          return false
        }
        if (status === 'paused') {
          this.sendError(socket, id, 'PAUSED', 'Agent is paused due to an escalation. Wait for human resolution.')
          return false
        }
        return true
      }

      switch (method) {
        case 'register_agent': {
          const { name, agentType, capabilities } = params as { name: string; agentType: string; capabilities: string[] }
          const agent = this.stateManager.registerAgent(name, agentType, capabilities || [])
          agentId = agent.id
          this.sessions.set(agent.id, { socket, agentId: agent.id, buffer: '' })
          result = { agentId: agent.id }
          break
        }

        case 'get_workspace_context': {
          if (!checkAgent()) return
          const ctx = this.stateManager.getWorkspaceContext(agentId)
          result = { agents: ctx.agents, tasks: ctx.tasks, openEscalations: ctx.openEscalations }
          pendingMessages = ctx.pendingMessages
          break
        }

        case 'create_task': {
          if (!checkAgent()) return
          const { description, declaredFiles } = params as { description: string; declaredFiles: string[] }
          const task = this.stateManager.createTask(description, declaredFiles || [])
          const overlap = this.stateManager.checkFileOverlap(task.declaredFiles, task.id)
          result = {
            task,
            overlapWarning: overlap.overlaps
              ? { conflictingFiles: overlap.conflictingFiles, conflictingTaskIds: overlap.conflictingTaskIds }
              : undefined,
          }
          break
        }

        case 'list_tasks': {
          if (!checkAgent()) return
          const tasks = this.stateManager.listTasks()
          result = { tasks: tasks.map(t => ({
            id: t.id,
            description: t.description,
            status: t.status,
            agentId: t.agentId,
            declaredFiles: t.declaredFiles,
            branchName: t.branchName,
          })) }
          break
        }

        case 'claim_task': {
          if (!checkAgent()) return
          const { taskId } = params as { taskId: string }

          const existingTask = this.stateManager.getTask(taskId)
          if (!existingTask) {
            this.sendError(socket, id, 'NOT_FOUND', `Task ${taskId} not found`)
            return
          }
          if (existingTask.status !== 'open') {
            this.sendError(socket, id, 'INVALID_STATE', `Task ${taskId} is not open (status: ${existingTask.status})`)
            return
          }

          // 5.4 worktree flag: with `useWorktrees: false` the task works directly
          // in the repo working tree on a task branch (no git worktree). Useful
          // for tiny repos / sandboxes where isolation overhead isn't worth it.
          let branchName: string
          let worktreePath: string
          let branchPoint: string
          if (this.config.useWorktrees) {
            const wt = this.worktreeLifecycle.createWorktree(taskId, this.stateManager.getIntegrationBranchSha())
            branchName = wt.branchName
            worktreePath = wt.worktreePath
            branchPoint = wt.branchPoint
          } else {
            branchName = `worktree/${taskId}`
            worktreePath = this.stateManager.getRepoPath()
            branchPoint = this.stateManager.getIntegrationBranchSha()
            this.worktreeLifecycle.createInRepoBranch(taskId, branchPoint)
          }
          this.stateManager.recordWorktree({
            id: taskId,
            branchName,
            worktreePath,
            sourceRef: branchPoint,
            taskId,
          })

          const task = this.stateManager.claimTask(taskId, agentId, branchName, worktreePath, branchPoint)
          this.stateManager.transitionTaskStatus(taskId, 'in_progress')
          this.logger.info('task', 'claim', { taskId, agentId, branch: branchName, worktree: worktreePath })

          const installResult = this.worktreeLifecycle.installDependencies(worktreePath)
          if (!installResult.ok) {
            this.stateManager.transitionTaskStatus(taskId, 'setup_failed')
            this.stateManager.postStatusUpdate(taskId, agentId, `Dependencies: ${installResult.error}`)
            this.recordTaskFailureAndMaybeRedispatch(taskId, `dependency install failed: ${installResult.error}`)
            result = {
              task: {
                id: task.id,
                description: task.description,
                status: 'setup_failed',
                branchName: task.branchName,
                worktreePath: task.worktreePath,
                branchPoint: task.branchPoint,
              },
              setupError: installResult.error,
            }
          } else {
            this.stateManager.postStatusUpdate(taskId, agentId, 'Dependencies installed')
            result = {
              task: {
                id: task.id,
                description: task.description,
                status: 'in_progress',
                branchName: task.branchName,
                worktreePath: task.worktreePath,
                branchPoint: task.branchPoint,
              },
            }
          }
          break
        }

        case 'post_status': {
          if (!checkAgent()) return
          const { taskId, statusText } = params as { taskId: string; statusText: string }
          const update = this.stateManager.postStatusUpdate(taskId, agentId, statusText)
          result = { statusUpdate: update }
          break
        }

        case 'mark_task_done': {
          if (!checkAgent()) return
          const { taskId } = params as { taskId: string }
          const t = this.stateManager.getTask(taskId)
          if (!t) {
            this.sendError(socket, id, 'NOT_FOUND', `Task ${taskId} not found`)
            return
          }
          if (t.agentId !== agentId) {
            this.sendError(socket, id, 'FORBIDDEN', `Task ${taskId} is owned by another agent. Only the task owner can mark it done.`)
            return
          }
          this.stateManager.transitionTaskStatus(taskId, 'merging')
          result = { taskId, status: 'merging' }
          break
        }

        case 'retry_task_setup': {
          if (!checkAgent()) return
          const { taskId } = params as { taskId: string }
          const rt = this.stateManager.getTask(taskId)
          if (!rt) {
            this.sendError(socket, id, 'NOT_FOUND', `Task ${taskId} not found`)
            return
          }
          if (rt.agentId !== agentId) {
            this.sendError(socket, id, 'FORBIDDEN', 'Only the task owner can retry setup')
            return
          }
          if (rt.status !== 'setup_failed') {
            this.sendError(socket, id, 'INVALID_STATE', `Task is '${rt.status}', expected 'setup_failed'`)
            return
          }
          const installResult = this.worktreeLifecycle.installDependencies(rt.worktreePath!)
          if (!installResult.ok) {
            this.stateManager.postStatusUpdate(taskId, agentId, `Setup retry failed: ${installResult.error}`)
            this.recordTaskFailureAndMaybeRedispatch(taskId, `setup retry failed: ${installResult.error}`)
            result = { ok: false, setupError: installResult.error }
          } else {
            this.stateManager.transitionTaskStatus(taskId, 'in_progress')
            this.stateManager.postStatusUpdate(taskId, agentId, 'Setup retry succeeded')
            result = { ok: true, status: 'in_progress' }
          }
          break
        }

        case 'abandon_task': {
          if (!checkAgent()) return
          const { taskId } = params as { taskId: string }
          const at = this.stateManager.getTask(taskId)
          if (!at) {
            this.sendError(socket, id, 'NOT_FOUND', `Task ${taskId} not found`)
            return
          }
          if (at.agentId !== agentId) {
            this.sendError(socket, id, 'FORBIDDEN', 'Only the task owner can abandon a task')
            return
          }
          this.stateManager.transitionTaskStatus(taskId, 'abandoned')
          this.stateManager.postStatusUpdate(taskId, agentId, 'Task abandoned by owner')
          result = { taskId, status: 'abandoned' }
          break
        }

        case 'check_merge_status': {
          if (!checkAgent()) return
          const { taskId } = params as { taskId: string }
          const status = this.mergeGate.checkMergeStatus(taskId, agentId)
          result = status
          break
        }

        case 'merge_branch': {
          if (!checkAgent()) return
          const { taskId } = params as { taskId: string }
          // Ownership check — only task owner can merge
          const t = this.stateManager.getTask(taskId)
          if (!t) {
            this.sendError(socket, id, 'NOT_FOUND', `Task ${taskId} not found`)
            return
          }
          if (t.agentId !== agentId) {
            this.sendError(socket, id, 'FORBIDDEN', `Task ${taskId} is owned by another agent. Only the task owner can merge.`)
            return
          }
          const status = this.mergeGate.checkMergeStatus(taskId, agentId)
          if (!status.canMerge) {
            this.sendError(socket, id, 'INVALID_STATE', status.reason || 'Cannot merge')
            return
          }
          if (this.stateManager.hasOpenGate(taskId)) {
            this.sendError(socket, id, 'GATE_BLOCKED', 'Task has an open decision gate. A human must approve before merging.')
            return
          }
          const mergeResult = this.mergeGate.executeMerge(taskId)
          this.logger.info('merge', mergeResult.ok ? 'success' : mergeResult.gateId ? 'gate-blocked' : 'failed', {
            taskId,
            agentId,
            reason: mergeResult.error?.slice(0, 200) || undefined,
            gateId: mergeResult.gateId || undefined,
          })
          // 5.4 gate auto-mode: an overlap-created gate is auto-approved and the
          // merge retried immediately instead of waiting on a human.
          if (!mergeResult.ok && mergeResult.gateId && this.config.gateAutoApprove) {
            try {
              this.stateManager.resolveGate(mergeResult.gateId, 'approved')
              this.stateManager.postStatusUpdate(taskId, '', `Gate auto-approved (gateAutoApprove): ${mergeResult.error}`)
              const retry = this.mergeGate.executeMerge(taskId)
              if (retry.ok) {
                this.stateManager.resetTaskFailures(taskId)
                this.logger.info('merge', 'success-after-auto-gate', { taskId, agentId })
                mergeResult.ok = true
                mergeResult.error = undefined
                mergeResult.gateId = undefined
              }
            } catch {}
          }
          if (!mergeResult.ok && mergeResult.error && !mergeResult.gateId) {
            // A gate-blocked merge (gateId set) is awaiting human decision, not
            // a task failure — don't feed the circuit breaker.
            this.recordTaskFailureAndMaybeRedispatch(taskId, mergeResult.error)
          } else if (mergeResult.ok) {
            this.stateManager.resetTaskFailures(taskId)
            // 5.4 no-worktree mode: return the working tree to the integration
            // branch and drop the now-merged task branch.
            if (!this.config.useWorktrees) {
              try {
                this.worktreeLifecycle.cleanupInRepoTaskBranch(taskId, this.stateManager.getIntegrationBranch())
              } catch {}
            }
            // 4.4: refresh the task summary (feeds Phase 2 recently-completed
            // preamble section) and broadcast it to every agent.
            try {
              const summary = this.sessionSummarizer.summarizeTask(taskId)
              const completionMsg = `[completion] ${summary.summary}`
              this.stateManager.sendMessage('agntspce-coordinator', null, true, completionMsg)
              for (const [aid, session] of this.sessions) {
                if (aid === this.stateManager.getTask(taskId)?.agentId) continue
                this.sendToSession(session, {
                  id: '',
                  result: { type: 'new_message', message: completionMsg },
                  pendingMessages: this.stateManager.getPendingMessages(aid),
                })
              }
            } catch {}
          }
          result = mergeResult
          break
        }

        case 'request_gate': {
          if (!checkAgent()) return
          const { taskId, reason } = params as { taskId: string; reason: string }
          const g = this.stateManager.getTask(taskId)
          if (!g) {
            this.sendError(socket, id, 'NOT_FOUND', `Task ${taskId} not found`)
            return
          }
          // 5.4 gate auto-mode: when configured, gates never block — they are
          // auto-approved so merge retries can proceed without a human.
          if (this.config.gateAutoApprove) {
            const gate = this.stateManager.createGate(taskId, reason || 'Risky merge — awaiting human decision')
            const approved = this.stateManager.resolveGate(gate.id, 'approved')
            this.stateManager.postStatusUpdate(taskId, agentId, `Gate auto-approved (gateAutoApprove): ${approved.reason}`)
            result = { gate: approved }
            break
          }
          const gate = this.stateManager.createGate(taskId, reason || 'Risky merge — awaiting human decision')
          this.stateManager.postStatusUpdate(taskId, agentId, `Gate requested: ${gate.reason}`)
          result = { gate }
          break
        }

        case 'resolve_gate': {
          const { gateId, decision } = params as { gateId: string; decision: string }
          const gate = this.stateManager.resolveGate(gateId, decision)
          if (gate.status === 'rejected') {
            const released = this.stateManager.redispatchTask(gate.taskId)
            if (released) {
              this.stateManager.postStatusUpdate(gate.taskId, '', `Gate rejected — task released for another agent`)
              for (const [aid, session] of this.sessions) {
                this.sendToSession(session, {
                  id: '',
                  result: {
                    type: 'new_message',
                    message: `[gate] Task ${gate.taskId.slice(0, 8)} was rejected by human gate and is available again.`,
                  },
                  pendingMessages: this.stateManager.getPendingMessages(aid),
                })
              }
            }
          } else {
            this.stateManager.postStatusUpdate(gate.taskId, '', `Gate approved — merge may proceed`)
          }
          result = { gate }
          break
        }

        case 'list_gates': {
          const gates = this.stateManager.listGates()
          result = { gates }
          break
        }

        case 'send_message': {
          if (!checkAgent()) return
          const { toAgentId, broadcast, content, deliverNow } = params as {
            toAgentId?: string
            broadcast?: boolean
            content: string
            deliverNow?: boolean
          }
          const isBroadcast = broadcast === true
          let toId: string | null = null
          if (!isBroadcast) {
            if (!toAgentId) {
              this.sendError(socket, id, 'INVALID_REQUEST', 'Either toAgentId or broadcast must be specified')
              return
            }
            toId = toAgentId
          }
          // 3.1: directed messages queue and are delivered only when the
          // receiver is idle (has no in-progress task). Broadcasts always
          // deliver immediately. `deliverNow: true` forces immediate delivery.
          const deliverOnlyWhenIdle = !isBroadcast && deliverNow !== true
          const msg = this.stateManager.sendMessage(agentId, toId, isBroadcast, content, deliverOnlyWhenIdle)

          if (isBroadcast) {
            for (const [aid, session] of this.sessions) {
              if (aid !== agentId) {
                this.sendToSession(session, {
                  id: '',
                  result: { type: 'new_message', message: msg },
                  pendingMessages: [],
                })
              }
            }
          }

          result = { message: msg }
          break
        }

        case 'check_messages': {
          if (!checkAgent()) return
          const messages = this.stateManager.getPendingMessages(agentId)
          pendingMessages = messages
          result = { messages: messages.map(m => ({
            id: m.id,
            fromAgentId: m.fromAgentId,
            toAgentId: m.toAgentId,
            broadcast: m.broadcast,
            content: m.content,
            createdAt: m.createdAt,
          })) }
          break
        }

        case 'escalate_to_human': {
          if (!checkAgent()) return
          const { reason, details, involvedAgentIds } = params as {
            reason: string
            details?: string
            involvedAgentIds?: string[]
          }
          // The caller is always included in the pause set. An agent that raises an
          // escalation should not continue working — it has signalled it cannot
          // proceed without human input. Agents named in `involvedAgentIds` are
          // paused in addition to the caller.
          const involved = [...new Set([...(involvedAgentIds || []), agentId])]
          const escalation = this.stateManager.createEscalation(reason, details || '', involved)
          result = {
            escalation: {
              id: escalation.id,
              reason: escalation.reason,
              status: escalation.status,
              involvedAgentIds: escalation.involvedAgentIds,
            },
          }
          break
        }

        case 'resolve_escalation': {
          const { escalationId, decision } = params as { escalationId: string; decision: string }
          this.stateManager.resolveEscalation(escalationId, decision)
          result = { escalationId, status: 'resolved', decision }
          break
        }

        case 'list_escalations': {
          const escalations = this.stateManager.listEscalations()
          result = { escalations }
          break
        }

        case 'get_task_summary': {
          if (!checkAgent()) return
          const { taskId } = params as { taskId: string }
          try {
            result = this.sessionSummarizer.summarizeTask(taskId)
          } catch (e) {
            this.sendError(socket, id, 'NOT_FOUND', `Task ${taskId} not found`)
            return
          }
          break
        }

        case 'get_agent_summary': {
          if (!checkAgent()) return
          const { agentId: targetAgentId } = params as { agentId?: string }
          const resolvedId = targetAgentId || agentId
          try {
            result = this.sessionSummarizer.summarizeAgent(resolvedId)
          } catch (e) {
            this.sendError(socket, id, 'NOT_FOUND', `Agent ${resolvedId} not found`)
            return
          }
          break
        }

        case 'deregister_agent': {
          if (agentId) {
            this.sessions.delete(agentId)
            this.stateManager.updateAgentStatus(agentId, 'idle')
          }
          result = { ok: true }
          break
        }

        default:
          this.sendError(socket, id, 'UNKNOWN_METHOD', `Unknown method: ${method}`)
          return
      }

      if (!agentId && method !== 'register_agent') {
        this.sendError(socket, id, 'NOT_REGISTERED', 'Agent not registered')
        return
      }

      if (agentId && method !== 'register_agent') {
        this.stateManager.updateLastSeen(agentId)
      }

      if (method !== 'register_agent' && agentId) {
        pendingMessages = this.stateManager.getPendingMessages(agentId)
      }

      this.sendResponse(socket, id, result, pendingMessages)
    } catch (e) {
      if (e instanceof CoordinatorError) {
        this.sendError(socket, id, e.code, e.message, e.data)
      } else {
        this.sendError(socket, id, 'INTERNAL_ERROR', (e as Error).message)
      }
    } finally {
      this.activeIdempotencyKey = null
    }
  }

  private cacheResponse(response: RpcResponse): void {
    if (this.activeIdempotencyKey) {
      this.idempotencyCache.set(this.activeIdempotencyKey, {
        response,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      })
    }
  }

  private sendResponse(socket: net.Socket, id: string, result: unknown, pendingMessages: MessageInfo[]): void {
    const response: RpcResponse = { id, result, pendingMessages }
    this.cacheResponse(response)
    socket.write(JSON.stringify(response) + '\n')
  }

  private sendError(socket: net.Socket, id: string, code: string, message: string, data?: unknown): void {
    const response: RpcResponse = { id, error: { code, message, data }, pendingMessages: [] }
    this.cacheResponse(response)
    socket.write(JSON.stringify(response) + '\n')
  }

  private sendToSession(session: ProxySession, response: RpcResponse): void {
    try {
      session.socket.write(JSON.stringify(response) + '\n')
    } catch {}
  }

  // 5.1 crash recovery: on boot, drop scratch worktrees and any task worktrees
  // whose task is no longer active (done/abandoned/missing). Runs again on the
  // periodic sweep so crash debris is cleaned up without a restart.
  private sweepWorktrees(): void {
    const integrationBranch = this.stateManager.getIntegrationBranch()
    try {
      this.worktreeLifecycle.cleanupScratchWorktrees()
      const activeIds = new Set(this.stateManager.getActiveTasks().map(t => t.id))
      const removed = this.worktreeLifecycle.sweepOrphanWorktrees(activeIds, integrationBranch)
      if (removed > 0) this.logger.warn('coordinator', 'orphan-worktrees-swept', { removed })
    } catch (e) {
      this.logger.error('coordinator', 'worktree-sweep-error', { error: (e as Error).message })
    }
  }

  private sweepStaleAgents(): void {
    const staleIds = this.stateManager.sweepStaleAgents()
    for (const id of staleIds) {
      const session = this.sessions.get(id)
      if (session) {
        this.sendToSession(session, {
          id: '',
          error: { code: 'STALE', message: 'Agent marked stale due to inactivity. Tasks have been released.' },
          pendingMessages: [],
        })
        session.socket.destroy()
        this.sessions.delete(id)
      }
    }
  }
}
