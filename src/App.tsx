import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import WorkspaceSidebar from './components/WorkspaceSidebar'
import TerminalArea from './components/TerminalArea'
import ChatSidebar from './components/ChatSidebar'
import InputModal from './components/InputModal'
import AgentModal from './components/AgentModal'
import CreateWorkspaceModal from './components/CreateWorkspaceModal'
import Dashboard from './components/Dashboard'
import Profile from './components/Profile'
import Settings from './components/Settings'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import OutputFilterDebug from './components/OutputFilterDebug'
import CommanderPanel from './components/CommanderPanel'
import NotificationPanel from './components/NotificationPanel'
import HistoryPanel from './components/HistoryPanel'
import type { Notification } from './components/NotificationPanel'
import type { HistoryEntry } from './components/HistoryPanel'

import { useSocket } from './hooks/useSocket'
import PRPanel from './components/PRPanel'
import type { TerminalOutput, AgentConfig, AgentStartConfig, SessionState } from './types'
import '@vscode/codicons/dist/codicon.css'
import './App.css'

const AGENTS_LIST: { id: string; name: string; icon: string }[] = [
  { id: 'claude', name: 'Claude Code', icon: '🤖' },
  { id: 'opencode', name: 'Opencode', icon: '🔧' },
  { id: 'codex', name: 'Codex', icon: '⚡' },
  { id: 'gemini', name: 'Gemini', icon: '✨' },
  { id: 'cursor-agent', name: 'Cursor Agent', icon: '🖥️' },
  { id: 'copilot', name: 'Copilot', icon: '🐙' },
  { id: 'mastracode', name: 'Mastra Code', icon: '🔷' },
  { id: 'droid', name: 'Droid', icon: '🤖' },
  { id: 'amp', name: 'Amp', icon: '⚡' },
  { id: 'pi', name: 'Pi', icon: '🥧' },
]

const FALLBACK_AGENTS: AgentConfig[] = [
  {
    id: 'claude', name: 'Claude Code', icon: '🤖', description: 'Anthropic Claude Code CLI',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'continue', name: 'Continue', description: 'Resume conversation' }, { id: 'resume', name: 'Resume', description: 'Restore interrupted session' }],
    flags: [{ id: 'skipPermissions', flag: '--dangerously-skip-permissions', label: '🚀 YOLO Mode', description: 'YOLO Mode (skip permissions)', category: 'permissions', default: true }],
    defaultMode: 'fresh',
  },
  {
    id: 'opencode', name: 'Opencode', icon: '🔧', description: 'AI-powered coding agent CLI',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'continue', name: 'Continue', description: 'Continue last session' }],
    flags: [],
    defaultMode: 'fresh',
  },
  {
    id: 'codex', name: 'Codex', icon: '⚡', description: 'OpenAI Codex CLI',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'continue', name: 'Continue', description: 'Continue most recent session' }, { id: 'resume', name: 'Resume', description: 'Resume interrupted session' }],
    flags: [{ id: 'yolo', flag: '--dangerously-bypass-approvals-and-sandbox', label: '🚀 YOLO Mode', description: 'No approvals + no sandboxing', category: 'sandbox', default: true }],
    defaultMode: 'fresh',
  },
  {
    id: 'gemini', name: 'Gemini', icon: '✨', description: 'Google Gemini CLI',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }],
    flags: [],
    defaultMode: 'fresh',
  },
  {
    id: 'cursor-agent', name: 'Cursor Agent', icon: '🖥️', description: 'Cursor AI coding agent',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'continue', name: 'Continue', description: 'Continue last session' }],
    flags: [],
    defaultMode: 'fresh',
  },
  {
    id: 'copilot', name: 'Copilot', icon: '🐙', description: 'GitHub Copilot CLI',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'explain', name: 'Explain', description: 'Explain code' }, { id: 'suggest', name: 'Suggest', description: 'Suggest code' }],
    flags: [],
    defaultMode: 'fresh',
  },
  {
    id: 'mastracode', name: 'Mastra Code', icon: '🔷', description: 'Mastra Code AI agent',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'continue', name: 'Continue', description: 'Continue last session' }],
    flags: [],
    defaultMode: 'fresh',
  },
  {
    id: 'droid', name: 'Droid', icon: '🤖', description: 'Factory AI Droid coding agent',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'continue', name: 'Continue', description: 'Continue last session' }],
    flags: [],
    defaultMode: 'fresh',
  },
  {
    id: 'amp', name: 'Amp', icon: '⚡', description: 'Amplified Amp coding agent',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'agent', name: 'Agent', description: 'Run in agent mode' }],
    flags: [],
    defaultMode: 'fresh',
  },
  {
    id: 'pi', name: 'Pi', icon: '🥧', description: 'Pi coding agent',
    modes: [{ id: 'fresh', name: 'Fresh', description: 'Start new session' }, { id: 'continue', name: 'Continue', description: 'Continue last session' }],
    flags: [],
    defaultMode: 'fresh',
  },
]

interface ModalState {
  open: boolean
  title: string
  defaultValue?: string
  onSubmit: (value: string) => void
}

function App() {
  const {
    sessions, workspaces, activeWorkspace,
    onTerminalOutput, sendTerminalInput, sendTerminalResize,
    restartSession, switchWorkspace, createWorkspace,
    deleteWorkspace, listDeletedWorkspaces, restoreWorkspace, permanentDeleteWorkspace,
    closeTab, startAgent, fetchAgentConfigs, createRawSession, createAgentSession,
    createWorkspaceFromGit,
    getSessionHistory, getGitLog, getGitDiff, getGitWorkingTreeDiff, getGitCommitFiles, getGitWorkingTreeFiles, getGitFileDiff,
    setUserSettings, updateWorkspaceConfig, refreshWorkspaces,
    filterStats, filterHistory, onFilterEvent,
    emit,
  } = useSocket()
  const writeBuffersRef = useRef<Record<string, string>>({})
  const MAX_BUFFER_BYTES = 65536
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([])
  const [agentModalSession, setAgentModalSession] = useState<string | null>(null)
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [deletedWorkspaces, setDeletedWorkspaces] = useState<{ id: string; name: string; deletedAt: string }[]>([])
  const [activeView, setActiveView] = useState<'dashboard' | 'profile' | 'settings' | 'git-review' | 'debug' | 'output-filter' | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('agent-workspace-theme') as 'dark' | 'light') || 'dark'
  })
  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false)
  const [commanderOpen, setCommanderOpen] = useState(false)
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [sessionHistory, setSessionHistory] = useState<HistoryEntry[]>([])
  const [fontSize, setFontSize] = useState(() => {
    try { return parseInt(localStorage.getItem('agent-workspace-font-size') || '13') } catch { return 13 }
  })
  const [fontFamily, setFontFamily] = useState(() => {
    try { return localStorage.getItem('agent-workspace-font-family') || "'JetBrains Mono', 'Fira Code', Menlo, monospace'" } catch { return "'JetBrains Mono', 'Fira Code', Menlo, monospace'" }
  })
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true)
  const appBodyRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(() => Math.round(window.innerWidth * 0.12))
  const leftWidthRef = useRef(leftWidth)
  const [chatWidth, setChatWidth] = useState(() => Math.round(window.innerWidth * 0.20))
  const [bottomShellOpen, setBottomShellOpen] = useState(false)
  const dragging = useRef<'left' | 'right' | null>(null)
  const closingLeft = useRef(false)

  useEffect(() => { leftWidthRef.current = leftWidth }, [leftWidth])

  useEffect(() => {
    fetchAgentConfigs().then(configs => {
      if (configs.length > 0) setAgentConfigs(configs)
      else setAgentConfigs(FALLBACK_AGENTS)
    }).catch(() => setAgentConfigs(FALLBACK_AGENTS))
  }, [])

  const refreshDeleted = useCallback(() => {
    listDeletedWorkspaces().then(setDeletedWorkspaces)
  }, [listDeletedWorkspaces])

  useEffect(() => { refreshDeleted() }, [])

  useEffect(() => {
    localStorage.setItem('agent-workspace-theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('agent-workspace-font-size', String(fontSize))
    document.documentElement.style.setProperty('--terminal-font-size', `${fontSize}px`)
  }, [fontSize])

  useEffect(() => {
    localStorage.setItem('agent-workspace-font-family', fontFamily)
    document.documentElement.style.setProperty('--terminal-font-family', fontFamily)
  }, [fontFamily])

  useEffect(() => {
    getSessionHistory().then(h => setSessionHistory(h))
  }, [sessions])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  useEffect(() => {
    if (appBodyRef.current) {
      const totalW = appBodyRef.current.getBoundingClientRect().width
      setLeftWidth(Math.round(totalW * 0.12))
    }
  }, [])

  const showModal = useCallback((title: string, onSubmit: (value: string) => void, defaultValue?: string) => {
    setModal({ open: true, title, onSubmit, defaultValue })
  }, [])

  const closeModal = useCallback(() => {
    setModal(null)
  }, [])

  function handleModalSubmit(value: string) {
    modal?.onSubmit(value)
  }

  function handleStartAgent(sessionId: string, config: AgentStartConfig) {
    startAgent(sessionId, config)
  }

  function handleShowAgentModal(sessionId: string) {
    setAgentModalSession(sessionId)
  }

  useEffect(() => {
    const unsub = onTerminalOutput((data: TerminalOutput) => {
      const current = (writeBuffersRef.current[data.sessionId] || '') + data.data
      writeBuffersRef.current[data.sessionId] = current.length > MAX_BUFFER_BYTES
        ? current.slice(-MAX_BUFFER_BYTES)
        : current
    })
    return unsub
  }, [onTerminalOutput])

  const prevSessionRef = useRef<Record<string, SessionState>>({})
  const firstMountRef = useRef(true)
  const notifDebounceRef = useRef<Record<string, number>>({})
  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false
      prevSessionRef.current = sessions
      return
    }
    const prev = prevSessionRef.current
    const newNots: Notification[] = []
    const now = Date.now()

    for (const [id, s] of Object.entries(sessions)) {
      const prevS = prev[id]
      if (!prevS) continue
      if (prevS.status !== s.status) {
        if (prevS.status === 'busy' && s.status === 'idle') {
          const key = `complete-${id}`
          if ((notifDebounceRef.current[key] || 0) + 2000 > now) continue
          notifDebounceRef.current[key] = now
          newNots.push({ id: `not-complete-${id}-${now}`, type: 'session-complete', title: 'Task complete', detail: `${s.type} session ${id.slice(-8)} finished`, timestamp: now, read: false })
        }
      }
    }

    for (const id of Object.keys(prev)) {
      if (!sessions[id]) {
        const key = `exit-${id}`
        if ((notifDebounceRef.current[key] || 0) + 2000 > now) continue
        notifDebounceRef.current[key] = now
        newNots.push({ id: `not-exited-${id}-${now}`, type: 'session-exited', title: 'Session closed', detail: `${prev[id].type} session ${id.slice(-8)} ended`, timestamp: now, read: false })
        delete writeBuffersRef.current[id]
      }
    }

    if (newNots.length > 0) {
      setNotifications(prev => [...newNots, ...prev].slice(0, 100))
    }

    prevSessionRef.current = sessions
  }, [sessions])

  useEffect(() => {
    if (activeWorkspace?.id && activeWorkspaceId !== activeWorkspace.id) {
      setActiveWorkspaceId(activeWorkspace.id)
    }
  }, [activeWorkspace])

  function addWorkspace(name: string, path: string) {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    createWorkspace({
      id,
      name,
      workspaceType: 'single-repo',
      repository: { path, type: 'generic' },
      worktrees: { enabled: false, count: 0, namingPattern: 'work{n}', autoCreate: false },
    }).then((res: any) => {
      if (res?.ok) {
        switchWorkspace(id)
      }
    })
  }

  function editWorkspace(id: string, name: string, _path: string) {
    updateWorkspaceConfig(id, { name }).then(() => refreshWorkspaces())
  }

  function removeWorkspace(id: string) {
    const wsSessions = Object.entries(sessions)
      .filter(([, s]) => s.repositoryName === id || s.id.startsWith(id))
      .map(([sid]) => sid)
    if (wsSessions.length > 0) closeTab(wsSessions)
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(workspaces.length > 1 ? workspaces.find(w => w.id !== id)?.id ?? null : null)
    }
  }

  const wsPath = activeWorkspace?.repository?.path

  const agentTypes = new Set(['claude', 'codex', 'opencode', 'gemini', 'cursor-agent', 'copilot', 'mastracode', 'droid', 'amp', 'pi'])
  const agentSessions = useMemo(
    () => Object.values(sessions).filter(s => agentTypes.has(s.type)).slice(0, 12),
    [sessions]
  )
  const shellSessions = useMemo(
    () => Object.values(sessions).filter(s => s.type === 'shell'),
    [sessions]
  )

  const handleNewTerminal = useCallback((type?: string) => {
    createRawSession(type, wsPath)
  }, [createRawSession, wsPath])

  function handleCreateWorkspace() {
    setCreateWorkspaceModalOpen(true)
  }

  async function handleCreateWorkspaceLocal(name: string, path: string) {
    addWorkspace(name, path)
  }

  async function handleCreateWorkspaceFromGit(gitUrl: string, name?: string) {
    const res = await createWorkspaceFromGit(gitUrl, name)
    if (res?.ok) {
      switchWorkspace(res.workspace.id)
    } else {
      throw new Error(res?.error || 'Failed to clone repository')
    }
  }


  function dismissNotification(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  function dismissAllNotifications() {
    setNotifications([])
  }

  function handleRestoreHistory(entry: HistoryEntry) {
    createRawSession(entry.type, entry.worktreeId !== 'default' ? undefined : undefined)
    setHistoryPanelOpen(false)
  }

  const commanderCommands = useMemo(() => [
    { id: 'new-agent', category: 'Terminals', label: 'New Agent Session', description: 'Create a new AI agent terminal', shortcut: '⌘⇧A', action: () => { createRawSession('claude') } },
    { id: 'new-shell', category: 'Terminals', label: 'New Shell Terminal', description: 'Open a shell terminal', shortcut: '⌘⇧S', action: () => { handleNewShell() } },
    { id: 'new-workspace', category: 'Workspaces', label: 'Create Workspace', description: 'Create a new workspace', shortcut: '⌘⇧N', action: () => { setCreateWorkspaceModalOpen(true) } },
    { id: 'focus-mode', category: 'View', label: 'Toggle Focus Mode', description: 'Dim inactive terminals', shortcut: '⌘⇧F', action: () => { setFocusMode(o => !o) } },
    { id: 'toggle-chat', category: 'View', label: 'Toggle Chat Sidebar', description: 'Show/hide the chat panel', shortcut: '⌘B', action: () => { handleToggleChatSidebar() } },
    { id: 'toggle-workspace-sidebar', category: 'View', label: 'Toggle Workspace Sidebar', description: 'Show/hide workspace list', shortcut: '⌘⇧B', action: () => { handleToggleWorkspaceSidebar() } },
    { id: 'toggle-shell', category: 'View', label: 'Toggle Shell Panel', description: 'Show/hide the bottom shell panel', action: () => { handleToggleBottomShell() } },
    { id: 'show-dashboard', category: 'View', label: 'Show Dashboard', description: 'View workspace stats and activity', action: () => { setActiveView('dashboard') } },
    { id: 'show-settings', category: 'View', label: 'Show Settings', description: 'Configure preferences', action: () => { setActiveView('settings') } },
    { id: 'show-history', category: 'View', label: 'Show Session History', description: 'View past sessions', action: () => { getSessionHistory().then(h => { setSessionHistory(h); setHistoryPanelOpen(true) }) } },
    { id: 'clear-notifications', category: 'Notifications', label: 'Clear Notifications', description: 'Dismiss all notifications', action: () => { dismissAllNotifications() } },
  ], [createRawSession, handleNewShell, setFocusMode, handleToggleChatSidebar, handleToggleWorkspaceSidebar, handleToggleBottomShell, setActiveView, getSessionHistory, setSessionHistory])


  function handleSelectWorkspace(id: string) {
    switchWorkspace(id)
    setWorkspaceSidebarOpen(true)
    if (appBodyRef.current) {
      const totalW = appBodyRef.current.getBoundingClientRect().width
      setLeftWidth(Math.round(totalW * 0.12))
    }
  }

  function handleDeleteWorkspace(id: string) {
    deleteWorkspace(id)
    removeWorkspace(id)
    setTimeout(refreshDeleted, 500)
  }

  function handleRestoreWorkspace(id: string) {
    restoreWorkspace(id).then(ok => {
      if (ok) refreshDeleted()
    })
  }

  function handlePermanentDelete(id: string) {
    permanentDeleteWorkspace(id).then(() => refreshDeleted())
  }

  function handleSelectAgent(agentId: string) {
    if (agentTypes.has(agentId)) {
      const defaultConfig = { agentId, mode: 'fresh', flags: [] }
      createAgentSession(agentId, defaultConfig, wsPath)
    } else {
      handleNewTerminal(agentId)
    }
  }

  useEffect(() => {
    if (!activeSessionId && agentSessions.length > 0) {
      setActiveSessionId(agentSessions[0].id)
    }
  }, [agentSessions.length])

  function handleCloseAgentTab(sessionId: string) {
    closeTab([sessionId])
    if (activeSessionId === sessionId) {
      const remaining = agentSessions.filter(s => s.id !== sessionId)
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null)
    }
  }

  function handleNewShell() {
    handleNewTerminal('shell')
    setBottomShellOpen(true)
  }

  function handleToggleChatSidebar() {
    setChatSidebarOpen(o => {
      if (!o && appBodyRef.current) {
        const totalW = appBodyRef.current.getBoundingClientRect().width
        setChatWidth(Math.round(totalW * 0.15))
      }
      return !o
    })
  }

  function handleToggleWorkspaceSidebar() {
    setWorkspaceSidebarOpen(o => {
      if (!o && appBodyRef.current) {
        const totalW = appBodyRef.current.getBoundingClientRect().width
        setLeftWidth(Math.round(totalW * 0.12))
      }
      return !o
    })
  }

  function handleToggleBottomShell() {
    if (!bottomShellOpen && shellSessions.length === 0) {
      handleNewTerminal('shell')
    }
    setBottomShellOpen(o => !o)
  }

  useEffect(() => {
    const unsub = window.electronAPI?.onMenuAction?.((action, data) => {
      switch (action) {
        case 'new-agent': handleNewTerminal('claude'); break
        case 'new-shell': handleNewShell(); break
        case 'new-workspace': handleCreateWorkspace(); break
        case 'save-workspace': emit('save-workspace'); break
        case 'save-workspace-as': {
          window.electronAPI?.exportWorkspace().then(path => {
            if (path) alert(`Workspace exported to ${path}`)
          })
          break
        }
        case 'load-workspace': {
          window.electronAPI?.importWorkspace().then(result => {
            if (result?.workspace) {
              handleSelectWorkspace(result.workspace.id)
            }
          })
          break
        }
        case 'duplicate-workspace': {
          const name = prompt('New workspace name:')
          if (name?.trim()) {
            window.electronAPI?.duplicateWorkspace(name.trim()).then(dup => {
              if (dup) handleSelectWorkspace(dup.id)
            })
          }
          break
        }
        case 'switch-workspace': handleSelectWorkspace(data); break
        case 'toggle-shell-sidebar': handleToggleChatSidebar(); break
        case 'toggle-workspace-sidebar': handleToggleWorkspaceSidebar(); break
        case 'toggle-focus': setFocusMode(o => !o); break
        case 'show-shortcuts': alert(
          '⌘N — New Window\n⌘⇧N — New Workspace\n⌘⇧A — New Agent\n⌘⇧S — New Shell\n' +
          '⌘O — Load Workspace\n⌘S — Save\n⌘W — Close Window\n' +
          '⌘Tab / ⌘⇧Tab — Cycle Tabs\n⌘1-9 — Go to Tab\n' +
          '⌘B — Chat Sidebar\n⌘⇧B — Workspace Sidebar'
        ); break
        case 'show-about': alert('AgntSpce v1.0\nElectron + React + TypeScript'); break
      }
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return

      if (e.key === 'k') {
        e.preventDefault()
        setCommanderOpen(o => !o)
        return
      }

      if (e.key === 'F' && e.shiftKey) {
        e.preventDefault()
        setFocusMode(o => !o)
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        const idx = agentSessions.findIndex(s => s.id === activeSessionId)
        if (idx < 0) {
          if (agentSessions.length > 0) setActiveSessionId(agentSessions[0].id)
          return
        }
        const dir = e.shiftKey ? -1 : 1
        const next = (idx + dir + agentSessions.length) % agentSessions.length
        setActiveSessionId(agentSessions[next].id)
        return
      }

      const num = parseInt(e.key)
      if (num >= 1 && num <= 9 && num <= agentSessions.length) {
        e.preventDefault()
        setActiveSessionId(agentSessions[num - 1].id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeSessionId, agentSessions])

  function onResizerMouseDown(side: 'left' | 'right') {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = side
      const startX = e.clientX
      const startLeft = leftWidth
      const startChat = chatWidth

      function onMove(ev: MouseEvent) {
        if (!appBodyRef.current) return
        const bodyRect = appBodyRef.current.getBoundingClientRect()
        const totalW = bodyRect.width
        const chatMin = Math.round(totalW * 0.10)
        const leftMax = Math.round(totalW * 0.12)
        const chatMax = Math.round(totalW * 0.20)

        if (dragging.current === 'left') {
          const dx = ev.clientX - startX
          let newW = Math.max(20, startLeft + dx)
          if (chatSidebarOpen) {
            newW = Math.min(newW, leftMax, totalW - chatWidth - 200)
          } else {
            newW = Math.min(newW, leftMax)
          }

          if (newW < Math.round(totalW * 0.04)) {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            dragging.current = null
            closingLeft.current = true
            setLeftWidth(0)
            setTimeout(() => {
              closingLeft.current = false
              setWorkspaceSidebarOpen(false)
            }, 80)
            return
          }

          setLeftWidth(newW)
          leftWidthRef.current = newW
        } else if (dragging.current === 'right') {
          const dx = startX - ev.clientX
          let newW = Math.max(chatMin, startChat + dx)
          newW = Math.min(newW, chatMax, totalW - leftWidth - 180)
          setChatWidth(newW)
        }
      }

      function onUp() {
        dragging.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        if (appBodyRef.current && leftWidthRef.current < Math.round(appBodyRef.current.getBoundingClientRect().width * 0.08)) {
          closingLeft.current = true
          setLeftWidth(0)
          setTimeout(() => {
            closingLeft.current = false
            setWorkspaceSidebarOpen(false)
          }, 80)
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
  }

  function setView(view: 'dashboard' | 'profile' | 'settings' | null) {
    setActiveView(activeView === view ? null : view)
  }

  const isMac = navigator.platform?.startsWith('Mac')

  return (
    <div className="app">
      <TitleBar
        unreadCount={notifications.filter(n => !n.read).length}
        notificationPanelOpen={notificationPanelOpen}
        onNotificationClick={() => setNotificationPanelOpen(o => !o)}
      />
      <div className="app-body" ref={appBodyRef}>
          <div className="activity-bar">
            <div className="activity-bar-top">
              <div className="activity-logo" title="AgntSpce">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#22C55E">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"/>
                </svg>
              </div>
              <button
                className={`activity-bar-btn ${workspaceSidebarOpen ? 'active' : ''}`}
                onClick={() => { handleToggleWorkspaceSidebar(); setActiveView(null) }}
                title="Explorer (Workspaces)"
              >
                <i className="codicon codicon-files" style={{ fontSize: 24 }}></i>
              </button>
            </div>
            <div className="activity-bar-bottom">
              <button
                className={`activity-bar-btn ${bottomShellOpen ? 'active' : ''}`}
                onClick={() => { if (!bottomShellOpen && shellSessions.length === 0) handleNewTerminal('shell'); setBottomShellOpen(true); setActiveView(null) }}
                title="Terminal"
              >
                <i className="codicon codicon-terminal" style={{ fontSize: 24 }}></i>
              </button>
              <button
                className={`activity-bar-btn ${activeView === 'dashboard' ? 'active' : ''}`}
                onClick={() => setView('dashboard')}
                title="Dashboard"
              >
                <i className="codicon codicon-dashboard" style={{ fontSize: 24 }}></i>
              </button>
              <button
                className="activity-bar-btn"
                onClick={() => { getSessionHistory().then(h => { setSessionHistory(h); setHistoryPanelOpen(true) }) }}
                title="Session History"
              >
                <i className="codicon codicon-history" style={{ fontSize: 24 }}></i>
              </button>
              <button
                className={`activity-bar-btn ${activeView === 'output-filter' ? 'active' : ''}`}
                onClick={() => setActiveView(prev => prev === 'output-filter' ? null : 'output-filter')}
                title="Output Filter Debug"
              >
                <i className="codicon codicon-output" style={{ fontSize: 24 }}></i>
              </button>
              <button
                className={`activity-bar-btn ${activeView === 'git-review' ? 'active' : ''}`}
                onClick={() => setActiveView(activeView === 'git-review' ? null : 'git-review')}
                title="Git Review"
              >
                <i className="codicon codicon-source-control" style={{ fontSize: 24 }}></i>
              </button>
              <button
                className={`activity-bar-btn ${activeView === 'profile' ? 'active' : ''}`}
                onClick={() => setView('profile')}
                title="Profile"
              >
                <i className="codicon codicon-account" style={{ fontSize: 24 }}></i>
              </button>
              <button
                className={`activity-bar-btn ${activeView === 'settings' ? 'active' : ''}`}
                onClick={() => setView('settings')}
                title="Settings"
              >
                <i className="codicon codicon-settings-gear" style={{ fontSize: 24 }}></i>
              </button>
            </div>
          </div>
        <div className={`panel-left${closingLeft.current ? ' closing' : ''}`} style={{ width: workspaceSidebarOpen ? leftWidth : 0, minWidth: workspaceSidebarOpen ? leftWidth : 0 }}>
          {workspaceSidebarOpen && (
            <WorkspaceSidebar
              workspaces={workspaces}
              sessions={sessions}
              activeWorkspace={activeWorkspace}
              deletedWorkspaces={deletedWorkspaces}
              onSelect={handleSelectWorkspace}
              onAdd={addWorkspace}
              onEdit={editWorkspace}
              onRemove={removeWorkspace}
              onDelete={handleDeleteWorkspace}
              onRestore={handleRestoreWorkspace}
              onPermanentDelete={handlePermanentDelete}
              showModal={showModal}
              closeModal={closeModal}
              onOpenCreateModal={handleCreateWorkspace}
            />
          )}
        </div>
        {workspaceSidebarOpen && <div className="resizer" onMouseDown={onResizerMouseDown('left')} />}
        <main className="main-content">
          {activeView === 'dashboard' ? (
            <Dashboard
              workspaces={workspaces}
              sessions={sessions}
              activeWorkspace={activeWorkspace}
              deletedWorkspaces={deletedWorkspaces}
              onSelect={(id) => { switchWorkspace(id); setActiveView(null) }}
              onDelete={handleDeleteWorkspace}
              onRestore={handleRestoreWorkspace}
              onPermanentDelete={handlePermanentDelete}
              onNewWorkspace={handleCreateWorkspace}
              onClose={() => setActiveView(null)}
            />
          ) : activeView === 'output-filter' ? (
            <OutputFilterDebug
              filterStats={filterStats}
              filterHistory={filterHistory}
              onFilterEvent={onFilterEvent}
              onClose={() => setActiveView(null)}
            />
          ) : activeView === 'git-review' ? (
            <PRPanel
              worktreePath={activeWorkspace?.repository?.path || ''}
              onClose={() => setActiveView(null)}
              onSelectDiff={() => {}}
              fetchLog={getGitLog}
              fetchDiff={getGitDiff}
              fetchWorkingTreeDiff={getGitWorkingTreeDiff}
              fetchCommitFiles={getGitCommitFiles}
              fetchWorkingTreeFiles={getGitWorkingTreeFiles}
              fetchFileDiff={getGitFileDiff}
            />
          ) : activeView === 'profile' ? (
            <Profile onClose={() => setActiveView(null)} />
          ) : activeView === 'settings' ? (
            <Settings theme={theme} onThemeChange={setTheme} onFontSizeChange={setFontSize} onFontFamilyChange={setFontFamily} onPrefsChange={(prefs) => { setUserSettings({ autoRestartSessions: prefs.autoStart }) }} onClose={() => setActiveView(null)} />
          ) : (
            <TerminalArea
              sessions={agentSessions}
              shellSessions={shellSessions}
              onInput={sendTerminalInput}
              onResize={sendTerminalResize}
              onRestart={restartSession}
              onStartAgent={handleStartAgent}
              onShowAgentModal={handleShowAgentModal}
              onNewAgent={() => {}}
              onSelectAgent={handleSelectAgent}
              onNewShell={handleNewShell}
              onCloseTab={handleCloseAgentTab}
              onActiveSessionChange={setActiveSessionId}
              activeSessionId={activeSessionId}
              writeBuffersRef={writeBuffersRef}
              agentConfigs={agentConfigs}
              focusMode={focusMode}
              agentsList={AGENTS_LIST}
              bottomShellOpen={bottomShellOpen}
              onToggleShell={handleToggleBottomShell}
              chatSidebarOpen={chatSidebarOpen}
              onToggleChatSidebar={handleToggleChatSidebar}
              onTerminalOutput={onTerminalOutput}
            />
          )}
        </main>
        {chatSidebarOpen && (
          <>
            <div className="resizer" onMouseDown={onResizerMouseDown('right')} />
            <div className="panel-right" style={{ width: chatWidth, minWidth: chatWidth }}>
              <ChatSidebar
                onClose={() => setChatSidebarOpen(false)}
              />
            </div>
          </>
        )}
      </div>
      <CreateWorkspaceModal
        open={createWorkspaceModalOpen}
        onClose={() => setCreateWorkspaceModalOpen(false)}
        onCreateLocal={handleCreateWorkspaceLocal}
        onCreateFromGit={handleCreateWorkspaceFromGit}
      />
      <InputModal
        open={modal?.open || false}
        title={modal?.title || ''}
        defaultValue={modal?.defaultValue}
        onSubmit={handleModalSubmit}
        onCancel={closeModal}
      />
      <AgentModal
        open={agentModalSession !== null}
        sessionId={agentModalSession}
        agentConfigs={agentConfigs}
        onStart={handleStartAgent}
        onClose={() => setAgentModalSession(null)}
      />
      {commanderOpen && (
        <CommanderPanel commands={commanderCommands} onClose={() => setCommanderOpen(false)} />
      )}
      {notificationPanelOpen && (
        <NotificationPanel
          notifications={notifications}
          onDismiss={dismissNotification}
          onDismissAll={dismissAllNotifications}
          onClose={() => setNotificationPanelOpen(false)}
        />
      )}
      {historyPanelOpen && (
        <HistoryPanel
          history={sessionHistory}
          onRestore={handleRestoreHistory}
          onClose={() => setHistoryPanelOpen(false)}
        />
      )}
      <StatusBar
        sessions={sessions}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        notificationPanelOpen={notificationPanelOpen}
        onNotificationClick={() => setNotificationPanelOpen(o => !o)}
        unreadCount={notifications.filter(n => !n.read).length}
      />
    </div>
  )
}

export default App
