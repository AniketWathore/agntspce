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
  lastAccess?: string
}

export interface SessionState {
  id: string
  type: 'claude' | 'codex' | 'opencode' | 'gemini' | 'cursor' | 'copilot' | 'mastra' | 'droid' | 'amp' | 'pi' | 'server' | 'shell'
  worktreeId: string
  repositoryName?: string
  repositoryType?: string
  status: 'idle' | 'busy' | 'waiting' | 'exited'
  branch: string
  lastActivity: number
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

export interface AgentConfig {
  id: string
  name: string
  icon: string
  description: string
  modes: AgentMode[]
  flags: AgentFlag[]
  defaultMode: string
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

export interface CompressionStats {
  totalOriginalChars: number
  totalCompressedChars: number
  totalOriginalTokens: number
  totalCompressedTokens: number
  linesCompressed: number
}

export interface CompressionDebugDetail {
  word: string
  kept: boolean
  reason?: string
}

export interface CompressionDebugRecord {
  original: string
  compressed: string
  details: CompressionDebugDetail[]
  originalChars: number
  compressedChars: number
  originalTokens: number
  compressedTokens: number
  reduction: number
}

export interface CompressionEvent {
  sessionId: string
  stats: {
    originalChars: number
    compressedChars: number
    originalTokens: number
    compressedTokens: number
    reduction: number
    charsSaved: number
    tokensSaved: number
  }
  cumulative: CompressionStats
  debug: CompressionDebugRecord
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
    }
  }
}
