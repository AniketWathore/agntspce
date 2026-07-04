export interface Session {
  id: string
  pty?: any
  type: 'claude' | 'codex' | 'opencode' | 'gemini' | 'cursor' | 'copilot' | 'mastra' | 'droid' | 'amp' | 'pi' | 'server' | 'shell'
  worktreeId: string
  repositoryName?: string
  repositoryType?: string
  status: 'idle' | 'busy' | 'waiting' | 'exited'
  branch: string
  buffer: string
  deliveredBufferLength: number
  lastActivity: number
  tokenUsage: number
  config: SessionConfig
  statusChangedAt: number
  pendingStatus: string | null
  pendingStatusTimer: NodeJS.Timeout | null
  cwdState: CwdState
  autoStarted: boolean
  claudeLaunchState: string | null
  agentStartConfig?: any
  inactivityTimer?: NodeJS.Timeout | null
  processMonitor?: NodeJS.Timeout | null
  workspace?: string | null
}

export interface SessionConfig {
  command: string
  args: string[]
  cwd: string
  type: string
  worktreeId: string
  repositoryName?: string
  repositoryType?: string
  timeoutMs?: number
}

export interface CwdState {
  current: string
  previous: string | null
  stack: string[]
}

export interface Workspace {
  id: string
  name: string
  workspaceType: 'single-repo' | 'mixed-repo'
  icon?: string
  description?: string
  access?: 'private' | 'team' | 'public'
  repository?: {
    path: string
    type: string
    masterBranch?: string
    remote?: string
  }
  worktrees?: {
    enabled: boolean
    count: number
    namingPattern: string
    autoCreate: boolean
  }
  terminals?: any
  projectType?: string
  lastAccess?: string
}

export interface Worktree {
  id: string
  worktreeId?: string
  path: string
  repositoryName?: string
  repositoryPath?: string
}

export interface GitBranchInfo {
  branch: string
  status?: {
    clean: boolean
    modified: number
    added: number
    deleted: number
    untracked: number
    total: number
  }
}

export interface SavedSessionData {
  id: string
  type: string
  cwd: string
  agentConfig?: {
    agentId: string
    mode: string
    flags: string[]
  }
}

export interface WorkspaceExport {
  version: string
  workspace: Workspace
  sessions: SavedSessionData[]
}

export interface TerminalConfig {
  sessionId: string
  type: string
  worktreeId: string
  cwd: string
  repositoryName?: string
  repositoryType?: string
}

export interface UserSettings {
  autoScroll?: boolean
  hideBranchPrefixes?: boolean
  colorizeBranches?: boolean
  skipPermissions?: boolean
  autoStart?: boolean
  autoStartMode?: string
  autoStartDelay?: number
  sessionRecovery?: boolean
  recoveryMode?: string
  theme?: string
  skin?: string
}
