import { execFileSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { createSchema } from './schema'

export interface AgentRow {
  id: string
  name: string
  agent_type: string
  status: 'active' | 'idle' | 'paused'
  capabilities: string
  registered_at: number
  last_seen: number
  session_summary: string
}

export interface TaskRow {
  id: string
  description: string
  status: 'open' | 'claimed' | 'in_progress' | 'merging' | 'done' | 'escalated' | 'abandoned' | 'setup_failed'
  declared_files: string
  actual_files: string | null
  branch_name: string | null
  worktree_path: string | null
  agent_id: string | null
  created_at: number
  completed_at: number | null
  branch_point: string | null
}

export interface MessageRow {
  id: string
  from_agent_id: string
  to_agent_id: string | null
  broadcast: number
  content: string
  created_at: number
  read_by: string
}

export interface EscalationRow {
  id: string
  reason: string
  details: string
  involved_agent_ids: string
  status: 'open' | 'resolved'
  decision: string | null
  created_at: number
  resolved_at: number | null
}

export interface StatusUpdateRow {
  id: string
  task_id: string
  agent_id: string
  text: string
  created_at: number
}

export interface WorkspaceContextResult {
  agents: { id: string; name: string; type: string; status: string }[]
  tasks: { id: string; description: string; status: string; agentId: string | null }[]
  openEscalations: number
}

export interface TaskOverview {
  id: string
  description: string
  status: string
  declaredFiles: string[]
  actualFiles: string[] | null
  branchName: string | null
  worktreePath: string | null
  branchPoint: string | null
  agentId: string | null
  createdAt: number
  completedAt: number | null
}

export interface AgentInfo {
  id: string
  name: string
  agentType: string
  status: string
  capabilities: string[]
  registeredAt: number
  lastSeen: number
  sessionSummary: string
}

export interface MessageInfo {
  id: string
  fromAgentId: string
  toAgentId: string | null
  broadcast: boolean
  content: string
  createdAt: number
}

export interface EscalationInfo {
  id: string
  reason: string
  details: string
  involvedAgentIds: string[]
  status: string
  decision: string | null
  createdAt: number
  resolvedAt: number | null
}

export interface StatusUpdateInfo {
  id: string
  taskId: string
  agentId: string
  text: string
  createdAt: number
}

const STALE_AGENT_TIMEOUT_MS = 5 * 60 * 1000

export class CoordinatorError extends Error {
  code: string
  data?: unknown

  constructor(code: string, message: string, data?: unknown) {
    super(message)
    this.name = 'CoordinatorError'
    this.code = code
    this.data = data
  }
}

export class StateManager {
  private db: Database.Database
  private workspaceRepoPath: string

  constructor(dbPath: string, workspaceRepoPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.workspaceRepoPath = workspaceRepoPath
    createSchema(this.db)
    this.initSystemAgent()
    this.initIntegrationBranch()
  }

  private initSystemAgent(): void {
    const existing = this.db.prepare("SELECT id FROM agents WHERE name = 'coordinator'").get() as { id: string } | undefined
    if (!existing) {
      const id = 'agntspce-coordinator'
      const now = Date.now()
      this.db.prepare(
        'INSERT INTO agents (id, name, agent_type, status, capabilities, registered_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, 'coordinator', 'system', 'active', JSON.stringify(['coordinator']), now, now)
    }
  }

  getRepoPath(): string {
    return this.workspaceRepoPath
  }

  getDb(): Database.Database {
    return this.db
  }

  getIntegrationBranch(): string {
    const row = this.db.prepare("SELECT value FROM workspace_config WHERE key = 'integration_branch'").get() as { value: string } | undefined
    if (row?.value) return row.value
    return this.initIntegrationBranch()
  }

  getSourceBranch(): string {
    const row = this.db.prepare("SELECT value FROM workspace_config WHERE key = 'source_branch'").get() as { value: string } | undefined
    if (row?.value) return row.value
    return this.detectSourceBranch()
  }

  private detectSourceBranch(): string {
    try {
      const head = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
      this.db.prepare("UPDATE workspace_config SET value = ? WHERE key = 'source_branch'").run(head)
      return head
    } catch {
      return 'main'
    }
  }

  initIntegrationBranch(): string {
    const integrationBranch = 'agntspce-integration'
    try {
      execFileSync('git', ['rev-parse', '--verify', integrationBranch], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 })
    } catch {
      const sourceBranch = this.getSourceBranch()
      try {
        const sourceSha = execFileSync('git', ['rev-parse', sourceBranch], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
        execFileSync('git', ['branch', integrationBranch, sourceSha], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 })
      } catch {}
    }
    this.db.prepare("UPDATE workspace_config SET value = ? WHERE key = 'integration_branch'").run(integrationBranch)
    return integrationBranch
  }

  getIntegrationBranchSha(): string {
    const branch = this.getIntegrationBranch()
    try {
      return execFileSync('git', ['rev-parse', branch], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
    } catch {
      return ''
    }
  }

  configureIntegrationBranch(branch: string): string {
    const sha = execFileSync('git', ['rev-parse', branch], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
    this.db.prepare("UPDATE workspace_config SET value = ? WHERE key = 'integration_branch'").run(branch)

    const existing = execFileSync('git', ['rev-parse', '--verify', branch], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
    if (!existing) {
      execFileSync('git', ['branch', branch, sha], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 })
    }
    return sha
  }

  validateRef(ref: string): string | null {
    try {
      return execFileSync('git', ['rev-parse', '--verify', ref], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
    } catch {
      return null
    }
  }

  isRefCheckedOut(ref: string): boolean {
    try {
      const branches = execFileSync('git', ['branch', '--list', ref], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 })
      return branches.includes('*')
    } catch {
      return false
    }
  }

  getActiveBranch(): string | null {
    try {
      return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
    } catch {
      return null
    }
  }

  getActiveBranchHead(): string {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: this.workspaceRepoPath, encoding: 'utf-8', timeout: 5000 }).trim()
    } catch {
      return ''
    }
  }

  close(): void {
    this.db.close()
  }

  // ── Agent CRUD ──

  registerAgent(name: string, agentType: string, capabilities: string[]): AgentInfo {
    const id = uuid()
    const now = Date.now()
    const stmt = this.db.prepare(
      'INSERT INTO agents (id, name, agent_type, status, capabilities, registered_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    stmt.run(id, name, agentType, 'active', JSON.stringify(capabilities), now, now)
    return this.getAgent(id)!
  }

  getAgent(id: string): AgentInfo | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
    if (!row) return null
    return this.rowToAgent(row)
  }

  updateAgentStatus(id: string, status: 'active' | 'idle' | 'paused'): void {
    this.db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, id)
  }

  updateLastSeen(id: string): void {
    this.db.prepare('UPDATE agents SET last_seen = ? WHERE id = ?').run(Date.now(), id)
  }

  updateSessionSummary(id: string, summary: string): void {
    this.db.prepare('UPDATE agents SET session_summary = ? WHERE id = ?').run(summary, id)
  }

  listAgents(): AgentInfo[] {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY registered_at ASC').all() as AgentRow[]
    return rows.map(r => this.rowToAgent(r))
  }

  getActiveAgents(): AgentInfo[] {
    const rows = this.db.prepare("SELECT * FROM agents WHERE status IN ('active', 'idle') ORDER BY registered_at ASC").all() as AgentRow[]
    return rows.map(r => this.rowToAgent(r))
  }

  private rowToAgent(row: AgentRow): AgentInfo {
    return {
      id: row.id,
      name: row.name,
      agentType: row.agent_type,
      status: row.status,
      capabilities: JSON.parse(row.capabilities),
      registeredAt: row.registered_at,
      lastSeen: row.last_seen,
      sessionSummary: row.session_summary,
    }
  }

  // ── Task CRUD ──

  createTask(description: string, declaredFiles: string[]): TaskOverview {
    const id = uuid()
    const now = Date.now()
    const stmt = this.db.prepare(
      'INSERT INTO tasks (id, description, status, declared_files, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run(id, description, 'open', JSON.stringify(declaredFiles), now)
    return this.getTask(id)!
  }

  getTask(id: string): TaskOverview | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    if (!row) return null
    return this.rowToTask(row)
  }

  listTasks(): TaskOverview[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as TaskRow[]
    return rows.map(r => this.rowToTask(r))
  }

  getActiveTasks(): TaskOverview[] {
    const rows = this.db.prepare("SELECT * FROM tasks WHERE status IN ('claimed', 'in_progress', 'merging', 'setup_failed') ORDER BY created_at ASC").all() as TaskRow[]
    return rows.map(r => this.rowToTask(r))
  }

  claimTask(taskId: string, agentId: string, branchName: string, worktreePath: string, branchPoint: string): TaskOverview {
    const task = this.getTask(taskId)
    if (!task) throw new CoordinatorError('NOT_FOUND', `Task ${taskId} not found`)
    if (task.status !== 'open') throw new CoordinatorError('INVALID_STATE', `Task ${taskId} is not open (status: ${task.status})`)

    const overlap = this.checkFileOverlap(task.declaredFiles, taskId)
    if (overlap.overlaps) {
      throw new CoordinatorError('OVERLAP', `File overlap: ${overlap.conflictingFiles.join(', ')} is claimed by another active task`, {
        conflictingFiles: overlap.conflictingFiles,
        conflictingTaskIds: overlap.conflictingTaskIds,
      })
    }

    this.db.prepare(
      'UPDATE tasks SET status = ?, agent_id = ?, branch_name = ?, worktree_path = ?, branch_point = ? WHERE id = ?'
    ).run('claimed', agentId, branchName, worktreePath, branchPoint, taskId)

    return this.getTask(taskId)!
  }

  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    'open': ['in_progress', 'setup_failed', 'abandoned'],
    'claimed': ['in_progress', 'setup_failed', 'abandoned'],
    'setup_failed': ['in_progress', 'abandoned'],
    'in_progress': ['merging', 'abandoned'],
    'merging': ['done', 'escalated', 'abandoned'],
    'done': [],
    'escalated': ['abandoned'],
    'abandoned': [],
  }

  transitionTaskStatus(taskId: string, newStatus: TaskRow['status']): void {
    const task = this.getTask(taskId)
    if (!task) throw new CoordinatorError('NOT_FOUND', `Task ${taskId} not found`)

    const allowed = StateManager.VALID_TRANSITIONS[task.status]
    if (!allowed || !allowed.includes(newStatus)) {
      throw new CoordinatorError('INVALID_STATE',
        `Cannot transition task ${taskId} from '${task.status}' to '${newStatus}'`)
    }

    if (newStatus === 'done') {
      this.db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?').run(newStatus, Date.now(), taskId)
    } else {
      this.db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(newStatus, taskId)
    }
  }

  updateTaskActualFiles(taskId: string, files: string[]): void {
    this.db.prepare('UPDATE tasks SET actual_files = ? WHERE id = ?').run(JSON.stringify(files), taskId)
  }

  releaseTask(taskId: string): void {
    this.db.prepare(
      "UPDATE tasks SET agent_id = NULL WHERE id = ? AND status IN ('claimed', 'in_progress', 'setup_failed')"
    ).run(taskId)
  }

  private rowToTask(row: TaskRow): TaskOverview {
    return {
      id: row.id,
      description: row.description,
      status: row.status,
      declaredFiles: JSON.parse(row.declared_files),
      actualFiles: row.actual_files ? JSON.parse(row.actual_files) : null,
      branchName: row.branch_name,
      worktreePath: row.worktree_path,
      branchPoint: row.branch_point,
      agentId: row.agent_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }
  }

  // ── File Overlap Checking ──

  checkFileOverlap(declaredFiles: string[], excludeTaskId?: string): {
    overlaps: boolean
    conflictingFiles: string[]
    conflictingTaskIds: string[]
  } {
    const activeTasks = this.getActiveTasks()
    const declaredSet = new Set(declaredFiles)
    const conflicts: string[] = []
    const conflictTaskIds = new Set<string>()

    for (const t of activeTasks) {
      if (excludeTaskId && t.id === excludeTaskId) continue
      for (const f of [...t.declaredFiles, ...(t.actualFiles || [])]) {
        if (declaredSet.has(f)) {
          conflicts.push(f)
          conflictTaskIds.add(t.id)
        }
      }
    }

    return {
      overlaps: conflicts.length > 0,
      conflictingFiles: [...new Set(conflicts)],
      conflictingTaskIds: [...conflictTaskIds],
    }
  }

  getActiveTaskFiles(excludeTaskId?: string): string[] {
    const activeTasks = this.getActiveTasks()
    const files = new Set<string>()
    for (const t of activeTasks) {
      if (excludeTaskId && t.id === excludeTaskId) continue
      for (const f of t.declaredFiles) files.add(f)
      if (t.actualFiles) {
        for (const f of t.actualFiles) files.add(f)
      }
    }
    return [...files]
  }

  // ── Message CRUD ──

  sendMessage(fromAgentId: string, toAgentId: string | null, broadcast: boolean, content: string): MessageInfo {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO messages (id, from_agent_id, to_agent_id, broadcast, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, fromAgentId, toAgentId, broadcast ? 1 : 0, content, now)
    return {
      id,
      fromAgentId,
      toAgentId,
      broadcast,
      content,
      createdAt: now,
    }
  }

  getPendingMessages(agentId: string): MessageInfo[] {
    const rows = this.db.prepare(
      `SELECT * FROM messages WHERE (to_agent_id = ? OR broadcast = 1) AND json_extract(read_by, '$."' || ? || '"') IS NULL ORDER BY created_at ASC`
    ).all(agentId, agentId) as MessageRow[]
    return rows.map(r => ({
      id: r.id,
      fromAgentId: r.from_agent_id,
      toAgentId: r.to_agent_id,
      broadcast: r.broadcast === 1,
      content: r.content,
      createdAt: r.created_at,
    }))
  }

  markMessagesRead(agentId: string): void {
    const now = Date.now().toString()
    const messages = this.db.prepare(
      `SELECT id, read_by FROM messages WHERE (to_agent_id = ? OR broadcast = 1) AND json_extract(read_by, '$."' || ? || '"') IS NULL`
    ).all(agentId, agentId) as { id: string; read_by: string }[]
    const updateStmt = this.db.prepare('UPDATE messages SET read_by = ? WHERE id = ?')
    for (const msg of messages) {
      const readBy: Record<string, string> = JSON.parse(msg.read_by)
      readBy[agentId] = now
      updateStmt.run(JSON.stringify(readBy), msg.id)
    }
  }

  // ── Escalations ──

  createEscalation(reason: string, details: string, involvedAgentIds: string[]): EscalationInfo {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO escalations (id, reason, details, involved_agent_ids, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, reason, details, JSON.stringify(involvedAgentIds), 'open', now)

    for (const agentId of involvedAgentIds) {
      this.updateAgentStatus(agentId, 'paused')
    }

    return this.getEscalation(id)!
  }

  getEscalation(id: string): EscalationInfo | null {
    const row = this.db.prepare('SELECT * FROM escalations WHERE id = ?').get(id) as EscalationRow | undefined
    if (!row) return null
    return this.rowToEscalation(row)
  }

  resolveEscalation(id: string, decision: string): void {
    const escalation = this.getEscalation(id)
    if (!escalation) throw new CoordinatorError('NOT_FOUND', `Escalation ${id} not found`)
    this.db.prepare('UPDATE escalations SET status = ?, decision = ?, resolved_at = ? WHERE id = ?')
      .run('resolved', decision, Date.now(), id)

    for (const agentId of escalation.involvedAgentIds) {
      this.updateAgentStatus(agentId, 'active')
    }
  }

  listEscalations(): EscalationInfo[] {
    const rows = this.db.prepare('SELECT * FROM escalations ORDER BY created_at DESC').all() as EscalationRow[]
    return rows.map(r => this.rowToEscalation(r))
  }

  getOpenEscalations(): EscalationInfo[] {
    const rows = this.db.prepare("SELECT * FROM escalations WHERE status = 'open' ORDER BY created_at ASC").all() as EscalationRow[]
    return rows.map(r => this.rowToEscalation(r))
  }

  private rowToEscalation(row: EscalationRow): EscalationInfo {
    return {
      id: row.id,
      reason: row.reason,
      details: row.details,
      involvedAgentIds: JSON.parse(row.involved_agent_ids),
      status: row.status,
      decision: row.decision,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }
  }

  // ── Status Updates ──

  postStatusUpdate(taskId: string, agentId: string, text: string): StatusUpdateInfo {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(
      'INSERT INTO status_updates (id, task_id, agent_id, text, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, taskId, agentId, text, now)
    return { id, taskId, agentId, text, createdAt: now }
  }

  getTaskStatusUpdates(taskId: string): StatusUpdateInfo[] {
    const rows = this.db.prepare(
      'SELECT * FROM status_updates WHERE task_id = ? ORDER BY created_at ASC'
    ).all(taskId) as StatusUpdateRow[]
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      text: r.text,
      createdAt: r.created_at,
    }))
  }

  // ── Workspace Context ──

  getWorkspaceContext(forAgentId?: string): WorkspaceContextResult & { pendingMessages: MessageInfo[] } {
    const agents = this.getActiveAgents().map(a => ({
      id: a.id,
      name: a.name,
      type: a.agentType,
      status: a.status,
    }))
    const tasks = this.listTasks().map(t => ({
      id: t.id,
      description: t.description.length > 80 ? t.description.slice(0, 80) + '...' : t.description,
      status: t.status,
      agentId: t.agentId,
    }))
    const openEscalations = this.getOpenEscalations().length
    const pendingMessages = forAgentId ? this.getPendingMessages(forAgentId) : []

    return { agents, tasks, openEscalations, pendingMessages }
  }

  // ── Stale Agent Sweep ──

  sweepStaleAgents(timeoutMs: number = STALE_AGENT_TIMEOUT_MS): string[] {
    const cutoff = Date.now() - timeoutMs
    const staleRows = this.db.prepare(
      "SELECT id FROM agents WHERE status IN ('active', 'idle') AND last_seen < ?"
    ).all(cutoff) as { id: string }[]

    const staleIds = staleRows.map(r => r.id)
    if (staleIds.length === 0) return []

    const markIdle = this.db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?")

    const transaction = this.db.transaction(() => {
      for (const id of staleIds) {
        markIdle.run(id)
        const tasks = this.db.prepare(
          "SELECT id FROM tasks WHERE agent_id = ? AND status IN ('claimed', 'in_progress', 'setup_failed')"
        ).all(id) as { id: string }[]
        for (const t of tasks) {
          this.transitionTaskStatus(t.id, 'abandoned')
          this.db.prepare('UPDATE tasks SET agent_id = NULL WHERE id = ?').run(t.id)
        }
      }
    })
    transaction()

    return staleIds
  }
}
