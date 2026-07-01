import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import type { WorkspaceInfo, SessionState, TerminalOutput, StatusChange, BranchChange, WorkspaceChange, AgentConfig, AgentStartConfig } from '../types'

const SERVER_URL = 'http://127.0.0.1:9460'

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
  emit: (event: string, ...args: any[]) => void
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [sessions, setSessions] = useState<Record<string, SessionState>>({})
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceInfo | null>(null)
  const terminalOutputCbs = useRef<((data: TerminalOutput) => void)[]>([])
  const statusChangeCbs = useRef<((data: StatusChange) => void)[]>([])
  const branchChangeCbs = useRef<((data: BranchChange) => void)[]>([])
  const workspaceChangedCbs = useRef<((data: WorkspaceChange) => void)[]>([])

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

  const fetchAgentConfigs = useCallback(async (): Promise<AgentConfig[]> => {
    try {
      const res = await fetch(`${SERVER_URL}/api/agents`)
      if (!res.ok) throw new Error('Failed to fetch agent configs')
      return await res.json()
    } catch {
      return []
    }
  }, [])

  const emit = useCallback((event: string, ...args: any[]) => {
    socketRef.current?.emit(event, ...args)
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
    emit,
  }
}
