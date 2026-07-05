import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { WorkspaceInfo, SessionState, TerminalOutput, StatusChange, BranchChange, WorkspaceChange, AgentConfig, AgentStartConfig, CompressionEvent, CompressionStats, CompressionDebugRecord } from '../types'

const SERVER_URL = 'http://127.0.0.1:9460'

export interface OrchestratorStats {
  concurrency: { active: number, queued: number, max: number }
  sessionCount: number
  totalMemoryMB: number
  resourceUsage: { sessionId: string, pid: number, cpuPercent: number, memoryMB: number, collectedAt: number }[]
}

interface UseSocketReturn {
  connected: boolean
  sessions: Record<string, SessionState>
  workspaces: WorkspaceInfo[]
  activeWorkspace: WorkspaceInfo | null
  onTerminalOutput: (cb: (data: TerminalOutput) => void) => () => void
  onStatusChange: (cb: (data: StatusChange) => void) => () => void
  onBranchChange: (cb: (data: BranchChange) => void) => () => void
  onWorkspaceChanged: (cb: (data: WorkspaceChange) => void) => () => void
  sendTerminalInput: (sessionId: string, data: string) => void
  sendTerminalResize: (sessionId: string, cols: number, rows: number) => void
  restartSession: (sessionId: string) => void
  switchWorkspace: (workspaceId: string) => void
  createWorkspace: (data: any) => Promise<any>
  deleteWorkspace: (workspaceId: string) => void
  listDeletedWorkspaces: () => Promise<{ id: string; name: string; deletedAt: string }[]>
  restoreWorkspace: (workspaceId: string) => Promise<boolean>
  permanentDeleteWorkspace: (workspaceId: string) => Promise<boolean>
  refreshWorkspaces: () => void
  closeTab: (sessionIds: string[]) => void
  startAgent: (sessionId: string, config: AgentStartConfig) => void
  fetchAgentConfigs: () => Promise<AgentConfig[]>
  createRawSession: (type?: string, workspacePath?: string) => void
  createAgentSession: (type: string, config: any, workspacePath?: string) => void
  emit: (event: string, ...args: any[]) => void
  toggleTokenReduction: (sessionId: string, enabled?: boolean) => void
  onTokenReductionState: (cb: (data: { sessionId: string, enabled: boolean }) => void) => () => void
  onCompressionEvent: (cb: (data: CompressionEvent) => void) => () => void
  compressionStats: CompressionStats
  compressionHistory: CompressionDebugRecord[]
  requestCompressionStats: () => void
  createWorkspaceFromGit: (gitUrl: string, name?: string) => Promise<any>
  updateWorkspaceConfig: (workspaceId: string, updates: any) => Promise<any>
  addWorktree: (workspaceId: string) => Promise<any>
  removeWorktree: (workspaceId: string, worktreeId: string) => Promise<any>
  listWorktrees: (workspaceId: string) => Promise<any[]>
  startParallelTask: (config: any) => Promise<any>
  getOrchestratorStats: () => Promise<OrchestratorStats>
  getSessionUsage: (sessionId: string) => Promise<any>
  getSessionHistory: () => Promise<any[]>
  getTokenUsage: (sessionId?: string) => Promise<any>
  getGitLog: (worktreePath: string, maxCount?: number) => Promise<any>
  getGitDiff: (worktreePath: string, base?: string, head?: string) => Promise<any>
  getGitBranches: (worktreePath: string) => Promise<any>
  getGitWorkingTreeDiff: (worktreePath: string) => Promise<any>
  getGitCommitFiles: (worktreePath: string, commitHash: string) => Promise<any>
  getGitWorkingTreeFiles: (worktreePath: string) => Promise<any>
  getGitFileDiff: (worktreePath: string, filePath: string, base?: string, head?: string) => Promise<any>
  onSessionUnhealthy: (cb: (data: { sessionId: string, reason: string, usage?: any }) => void) => () => void
  setUserSettings: (settings: { autoRestartSessions?: boolean }) => void
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [sessions, setSessions] = useState<Record<string, SessionState>>({})
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceInfo | null>(null)
  const [compressionStats, setCompressionStats] = useState<CompressionStats>({
    totalOriginalChars: 0,
    totalCompressedChars: 0,
    totalOriginalTokens: 0,
    totalCompressedTokens: 0,
    linesCompressed: 0,
  })
  const [compressionHistory, setCompressionHistory] = useState<CompressionDebugRecord[]>([])
  const terminalOutputCbs = useRef<((data: TerminalOutput) => void)[]>([])
  const statusChangeCbs = useRef<((data: StatusChange) => void)[]>([])
  const branchChangeCbs = useRef<((data: BranchChange) => void)[]>([])
  const workspaceChangedCbs = useRef<((data: WorkspaceChange) => void)[]>([])
  const tokenReductionStateCbs = useRef<((data: { sessionId: string, enabled: boolean }) => void)[]>([])
  const compressionEventCbs = useRef<((data: CompressionEvent) => void)[]>([])
  const sessionUnhealthyCbs = useRef<((data: { sessionId: string, reason: string, usage?: any }) => void)[]>([])

  useEffect(() => {
    const socket = io(SERVER_URL)
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('workspace-info', (data: { active: WorkspaceInfo | null; available: WorkspaceInfo[] }) => {
      setActiveWorkspace(data.active)
      setWorkspaces(data.available || [])
    })

    socket.on('sessions', (data: Record<string, SessionState>) => {
      setSessions(data || {})
    })

    socket.on('terminal-output', (data: TerminalOutput) => {
      terminalOutputCbs.current.forEach(cb => cb(data))
    })

    socket.on('status-change', (data: StatusChange) => {
      setSessions(prev => {
        if (!prev[data.sessionId]) return prev
        return { ...prev, [data.sessionId]: { ...prev[data.sessionId], status: data.status as any } }
      })
      statusChangeCbs.current.forEach(cb => cb(data))
    })

    socket.on('branch-change', (data: BranchChange) => {
      setSessions(prev => {
        if (!prev[data.sessionId]) return prev
        return { ...prev, [data.sessionId]: { ...prev[data.sessionId], branch: data.branch } }
      })
      branchChangeCbs.current.forEach(cb => cb(data))
    })

    socket.on('workspace-changed', (data: WorkspaceChange) => {
      setActiveWorkspace(data.workspace)
      setSessions(data.sessions || {})
      workspaceChangedCbs.current.forEach(cb => cb(data))
    })

    socket.on('workspaces-list', (data: WorkspaceInfo[]) => {
      setWorkspaces(data)
    })

    socket.on('session-created', ({ sessionId: _sid, sessions: newSessions }: { sessionId: string, sessions: Record<string, SessionState> }) => {
      setSessions(prev => ({ ...prev, ...newSessions }))
    })

    socket.on('session-exited', ({ sessionId }: { sessionId: string }) => {
      setSessions(prev => {
        if (!prev[sessionId]) return prev
        return { ...prev, [sessionId]: { ...prev[sessionId], status: 'exited' } }
      })
    })

    socket.on('error', (err: any) => {
      console.error('[socket error]', err?.message || err)
    })

    socket.on('backlog', (data: Record<string, string>) => {
      for (const [sessionId, buffered] of Object.entries(data)) {
        if (buffered) {
          terminalOutputCbs.current.forEach(cb => cb({ sessionId, data: buffered }))
        }
      }
    })

    socket.on('session-closed', ({ sessionId }: { sessionId: string }) => {
      setSessions(prev => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
    })

    socket.on('token-reduction-state', (data: { sessionId: string, enabled: boolean }) => {
      tokenReductionStateCbs.current.forEach(cb => cb(data))
    })

    socket.on('compression-event', (event: CompressionEvent) => {
      setCompressionStats(event.cumulative)
      setCompressionHistory(prev => {
        const next = [event.debug, ...prev]
        return next.slice(0, 100)
      })
      compressionEventCbs.current.forEach(cb => cb(event))
    })

    socket.on('compression-stats', (data: { sessionId: string, stats: CompressionStats, history: CompressionDebugRecord[] }) => {
      setCompressionStats(data.stats)
      setCompressionHistory(data.history || [])
    })

    socket.on('session-unhealthy', (data: { sessionId: string, reason: string, usage?: any }) => {
      sessionUnhealthyCbs.current.forEach(cb => cb(data))
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const onTerminalOutput = useCallback((cb: (data: TerminalOutput) => void) => {
    terminalOutputCbs.current.push(cb)
    return () => {
      terminalOutputCbs.current = terminalOutputCbs.current.filter(c => c !== cb)
    }
  }, [])

  const onStatusChange = useCallback((cb: (data: StatusChange) => void) => {
    statusChangeCbs.current.push(cb)
    return () => {
      statusChangeCbs.current = statusChangeCbs.current.filter(c => c !== cb)
    }
  }, [])

  const onBranchChange = useCallback((cb: (data: BranchChange) => void) => {
    branchChangeCbs.current.push(cb)
    return () => {
      branchChangeCbs.current = branchChangeCbs.current.filter(c => c !== cb)
    }
  }, [])

  const onWorkspaceChanged = useCallback((cb: (data: WorkspaceChange) => void) => {
    workspaceChangedCbs.current.push(cb)
    return () => {
      workspaceChangedCbs.current = workspaceChangedCbs.current.filter(c => c !== cb)
    }
  }, [])

  const sendTerminalInput = useCallback((sessionId: string, data: string) => {
    socketRef.current?.emit('terminal-input', { sessionId, data })
  }, [])

  const sendTerminalResize = useCallback((sessionId: string, cols: number, rows: number) => {
    socketRef.current?.emit('terminal-resize', { sessionId, cols, rows })
  }, [])

  const restartSession = useCallback((sessionId: string) => {
    socketRef.current?.emit('restart-session', { sessionId })
  }, [])

  const switchWorkspace = useCallback((workspaceId: string) => {
    socketRef.current?.emit('switch-workspace', { workspaceId })
  }, [])

  const createWorkspace = useCallback((data: any): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('create-workspace', data, (res: any) => resolve(res))
    })
  }, [])

  const deleteWorkspace = useCallback((workspaceId: string) => {
    socketRef.current?.emit('delete-workspace', { workspaceId })
  }, [])

  const listDeletedWorkspaces = useCallback((): Promise<{ id: string; name: string; deletedAt: string }[]> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('list-deleted-workspaces', {}, (res: any) => resolve(res || []))
    })
  }, [])

  const restoreWorkspace = useCallback((workspaceId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('restore-workspace', { workspaceId }, (res: any) => resolve(res?.ok ?? false))
    })
  }, [])

  const permanentDeleteWorkspace = useCallback((workspaceId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('permanent-delete-workspace', { workspaceId }, (res: any) => resolve(res?.ok ?? false))
    })
  }, [])

  const refreshWorkspaces = useCallback(() => {
    socketRef.current?.emit('list-workspaces')
  }, [])

  const closeTab = useCallback((sessionIds: string[]) => {
    socketRef.current?.emit('close-tab', { sessionIds })
  }, [])

  const startAgent = useCallback((sessionId: string, config: AgentStartConfig) => {
    socketRef.current?.emit('start-agent', { sessionId, config })
  }, [])

  const createRawSession = useCallback((type: string = 'shell', workspacePath?: string) => {
    socketRef.current?.emit('create-raw-session', { type, workspacePath })
  }, [])

  const createAgentSession = useCallback((type: string, config: any, workspacePath?: string) => {
    socketRef.current?.emit('create-agent-session', { type, workspacePath, config })
  }, [])

  const fetchAgentConfigs = useCallback(async (): Promise<AgentConfig[]> => {
    try {
      const res = await fetch(`${SERVER_URL}/api/agents`)
      if (!res.ok) throw new Error('Failed to fetch agent configs')
      return await res.json()
    } catch {
      return []
    }
  }, [])

  const addWorktree = useCallback((workspaceId: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('add-worktree', { workspaceId }, (res: any) => resolve(res))
    })
  }, [])

  const removeWorktree = useCallback((workspaceId: string, worktreeId: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('remove-worktree', { workspaceId, worktreeId }, (res: any) => resolve(res))
    })
  }, [])

  const listWorktrees = useCallback((workspaceId: string): Promise<any[]> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('list-worktrees', { workspaceId }, (res: any) => resolve(res || []))
    })
  }, [])

  const startParallelTask = useCallback((config: any): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('start-parallel-task', config, (res: any) => resolve(res))
    })
  }, [])

  const createWorkspaceFromGit = useCallback((gitUrl: string, name?: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('create-workspace-from-git', { gitUrl, name }, (res: any) => resolve(res))
    })
  }, [])

  const updateWorkspaceConfig = useCallback((workspaceId: string, updates: any): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('update-workspace-config', { workspaceId, updates }, (res: any) => resolve(res))
    })
  }, [])

  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args)
  }, [])

  const toggleTokenReduction = useCallback((sessionId: string, enabled?: boolean) => {
    socketRef.current?.emit('toggle-token-reduction', { sessionId, enabled })
  }, [])

  const onTokenReductionState = useCallback((cb: (data: { sessionId: string, enabled: boolean }) => void) => {
    tokenReductionStateCbs.current.push(cb)
    return () => {
      tokenReductionStateCbs.current = tokenReductionStateCbs.current.filter(c => c !== cb)
    }
  }, [])

  const onCompressionEvent = useCallback((cb: (data: CompressionEvent) => void) => {
    compressionEventCbs.current.push(cb)
    return () => {
      compressionEventCbs.current = compressionEventCbs.current.filter(c => c !== cb)
    }
  }, [])

  const requestCompressionStats = useCallback(() => {
    socketRef.current?.emit('get-compression-stats', { sessionId: null })
  }, [])

  const getOrchestratorStats = useCallback((): Promise<OrchestratorStats> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-orchestrator-stats', {}, (res: any) => {
        if (res?.ok) resolve(res)
        else resolve({ concurrency: { active: 0, queued: 0, max: 6 }, sessionCount: 0, totalMemoryMB: 0, resourceUsage: [] })
      })
    })
  }, [])

  const getSessionUsage = useCallback((sessionId: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-session-usage', { sessionId }, (res: any) => resolve(res))
    })
  }, [])

  const getSessionHistory = useCallback((): Promise<any[]> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-session-history', {}, (res: any) => {
        if (res?.ok) resolve(res.history || [])
        else resolve([])
      })
    })
  }, [])

  const getTokenUsage = useCallback((sessionId?: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-token-usage', { sessionId }, (res: any) => {
        if (res?.ok) resolve(res)
        else resolve({ usage: null, totalTokens: 0, totalCost: 0 })
      })
    })
  }, [])

  const getGitLog = useCallback((worktreePath: string, maxCount?: number): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-git-log', { worktreePath, maxCount }, (res: any) => {
        if (res?.ok) resolve(res.log)
        else resolve(null)
      })
    })
  }, [])

  const getGitDiff = useCallback((worktreePath: string, base?: string, head?: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-git-diff', { worktreePath, base, head }, (res: any) => {
        if (res?.ok) resolve(res.diff)
        else resolve(null)
      })
    })
  }, [])

  const getGitBranches = useCallback((worktreePath: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-git-branches', { worktreePath }, (res: any) => {
        if (res?.ok) resolve(res.branches)
        else resolve(null)
      })
    })
  }, [])

  const getGitWorkingTreeDiff = useCallback((worktreePath: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-git-working-tree-diff', { worktreePath }, (res: any) => {
        if (res?.ok) resolve(res.diff)
        else resolve(null)
      })
    })
  }, [])

  const getGitCommitFiles = useCallback((worktreePath: string, commitHash: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-git-commit-files', { worktreePath, commitHash }, (res: any) => {
        if (res?.ok) resolve(res.files)
        else resolve(null)
      })
    })
  }, [])

  const getGitWorkingTreeFiles = useCallback((worktreePath: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-git-working-tree-files', { worktreePath }, (res: any) => {
        if (res?.ok) resolve(res.files)
        else resolve(null)
      })
    })
  }, [])

  const getGitFileDiff = useCallback((worktreePath: string, filePath: string, base?: string, head?: string): Promise<any> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('get-git-file-diff', { worktreePath, filePath, base, head }, (res: any) => {
        if (res?.ok) resolve(res.diff)
        else resolve(null)
      })
    })
  }, [])

  const onSessionUnhealthy = useCallback((cb: (data: { sessionId: string, reason: string, usage?: any }) => void) => {
    sessionUnhealthyCbs.current.push(cb)
    return () => {
      sessionUnhealthyCbs.current = sessionUnhealthyCbs.current.filter(c => c !== cb)
    }
  }, [])

  const setUserSettings = useCallback((settings: { autoRestartSessions?: boolean }) => {
    socketRef.current?.emit('set-user-settings', settings)
  }, [])

  return {
    connected,
    sessions,
    workspaces,
    activeWorkspace,
    onTerminalOutput,
    onStatusChange,
    onBranchChange,
    onWorkspaceChanged,
    sendTerminalInput,
    sendTerminalResize,
    restartSession,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    listDeletedWorkspaces,
    restoreWorkspace,
    permanentDeleteWorkspace,
    refreshWorkspaces,
    closeTab,
    startAgent,
    fetchAgentConfigs,
    createRawSession,
    createAgentSession,
    createWorkspaceFromGit,
    updateWorkspaceConfig,
    addWorktree,
    removeWorktree,
    listWorktrees,
    startParallelTask,
    emit,
    toggleTokenReduction,
    onTokenReductionState,
    onCompressionEvent,
    compressionStats,
    compressionHistory,
    requestCompressionStats,
    getOrchestratorStats,
    getSessionUsage,
    getSessionHistory,
    getTokenUsage,
    getGitLog,
    getGitDiff,
    getGitBranches,
    getGitWorkingTreeDiff,
    getGitCommitFiles,
    getGitWorkingTreeFiles,
    getGitFileDiff,
    onSessionUnhealthy,
    setUserSettings,
  }
}
