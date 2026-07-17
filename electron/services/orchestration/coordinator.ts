import * as net from 'node:net'
import * as fs from 'node:fs'
import { StateManager, CoordinatorError, type MessageInfo } from './stateManager'
import { WorktreeLifecycle } from './worktreeLifecycle'
import { MergeGate } from './mergeGate'
import { SessionSummarizer } from './sessionSummarizer'

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

const SWEEP_INTERVAL_MS = 60_000

export class Coordinator {
  private server: net.Server
  private stateManager: StateManager
  private socketPath: string
  private sessions: Map<string, ProxySession> = new Map()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private worktreeLifecycle: WorktreeLifecycle
  private mergeGate: MergeGate
  private sessionSummarizer: SessionSummarizer

  constructor(socketPath: string, stateManager: StateManager) {
    this.socketPath = socketPath
    this.stateManager = stateManager
    this.worktreeLifecycle = new WorktreeLifecycle(stateManager.getRepoPath())
    this.mergeGate = new MergeGate(stateManager.getRepoPath(), this.worktreeLifecycle, this.stateManager)
    this.sessionSummarizer = new SessionSummarizer(stateManager.getDb(), stateManager.getRepoPath())
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
        this.sweepTimer = setInterval(() => this.sweepStaleAgents(), SWEEP_INTERVAL_MS)
        this.sweepTimer.unref()
        resolve()
      })
    })
  }

  close(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    for (const session of this.sessions.values()) {
      session.socket.destroy()
    }
    this.sessions.clear()
    this.server.close(() => {
      try { fs.unlinkSync(this.socketPath) } catch {}
    })
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

          const wt = this.worktreeLifecycle.createWorktree(taskId, this.stateManager.getIntegrationBranchSha())

          const task = this.stateManager.claimTask(taskId, agentId, wt.branchName, wt.worktreePath, wt.branchPoint)
          this.stateManager.transitionTaskStatus(taskId, 'in_progress')

          const installResult = this.worktreeLifecycle.installDependencies(wt.worktreePath)
          if (!installResult.ok) {
            this.stateManager.transitionTaskStatus(taskId, 'setup_failed')
            this.stateManager.postStatusUpdate(taskId, agentId, `Dependencies: ${installResult.error}`)
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
          const mergeResult = this.mergeGate.executeMerge(taskId)
          result = mergeResult
          break
        }

        case 'send_message': {
          if (!checkAgent()) return
          const { toAgentId, broadcast, content } = params as {
            toAgentId?: string
            broadcast?: boolean
            content: string
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
          const msg = this.stateManager.sendMessage(agentId, toId, isBroadcast, content)

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
    }
  }

  private sendResponse(socket: net.Socket, id: string, result: unknown, pendingMessages: MessageInfo[]): void {
    const response: RpcResponse = { id, result, pendingMessages }
    socket.write(JSON.stringify(response) + '\n')
  }

  private sendError(socket: net.Socket, id: string, code: string, message: string, data?: unknown): void {
    const response: RpcResponse = { id, error: { code, message, data }, pendingMessages: [] }
    socket.write(JSON.stringify(response) + '\n')
  }

  private sendToSession(session: ProxySession, response: RpcResponse): void {
    try {
      session.socket.write(JSON.stringify(response) + '\n')
    } catch {}
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
