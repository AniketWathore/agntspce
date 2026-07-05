export interface WorkspaceInfo {
  id: string
  name: string
  workspaceType?: string
  icon?: string
  description?: string
  repository?: {
    path: string
    type: string
    masterBranch?: string
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
  gitUrl?: string
  envVars?: Record<string, string>
  setupScript?: string
  teardownScript?: string
}

export interface SessionState {
  id: string
  type: 'claude' | 'codex' | 'opencode' | 'gemini' | 'cursor-agent' | 'copilot' | 'mastracode' | 'droid' | 'amp' | 'pi' | 'server' | 'shell'
  worktreeId: string
  repositoryName?: string
  repositoryType?: string
  status: 'idle' | 'busy' | 'waiting' | 'exited'
  branch: string
  lastActivity: number
  sessionGroupId?: string
}

export interface TerminalOutput {
  sessionId: string
  data: string
}

export interface StatusChange {
  sessionId: string
  status: string
}

export interface BranchChange {
  sessionId: string
  branch: string
  worktreeId: string
}

export interface WorkspaceChange {
  workspace: WorkspaceInfo
  sessions: Record<string, SessionState>
}

export interface AgentMode {
  id: string
  name: string
  description: string
}

export interface AgentFlag {
  id: string
  flag: string
  description: string
  label: string
  category: string
  default: boolean
}

export interface AgentCapabilities {
  supportsWorktree: boolean
  requiresGitRepo: boolean
  supportsParallel: boolean
}

export interface AgentConfig {
  id: string
  name: string
  icon: string
  description: string
  modes: AgentMode[]
  flags: AgentFlag[]
  defaultMode: string
  models?: string[]
  defaultModel?: string
  reasoningLevels?: string[]
  defaultReasoning?: string
  verbosityLevels?: string[]
  defaultVerbosity?: string
  capabilities?: AgentCapabilities
}

export interface AgentStartConfig {
  agentId: string
  mode: string
  flags: string[]
  model?: string
  reasoning?: string
  verbosity?: string
  resumeId?: string
}

export interface FilterEvent {
  sessionId: string
  original: string
  filtered: string
  originalBytes: number
  filteredBytes: number
  originalTokens: number
  filteredTokens: number
  reduction: number
  rulesApplied: string[]
}

export interface FilterStats {
  totalOriginalBytes: number
  totalFilteredBytes: number
  totalOriginalTokens: number
  totalFilteredTokens: number
  eventsProcessed: number
}

declare global {
  interface Window {
    electronAPI?: {
      selectDirectory: () => Promise<string | null>
      getDefaultPath: () => Promise<string>
      getServerPort: () => Promise<number>
      exportWorkspace: () => Promise<string | null>
      importWorkspace: () => Promise<{ workspace: any; path: string } | null>
      duplicateWorkspace: (newName: string) => Promise<any>
      onMenuAction: (callback: (action: string, data?: any) => void) => () => void
      windowMinimize: () => Promise<void>
      windowMaximize: () => Promise<void>
      windowClose: () => Promise<void>
      windowIsMaximized: () => Promise<boolean>
    }
  }
}
