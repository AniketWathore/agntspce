import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import WorkspaceSidebar from './components/WorkspaceSidebar'
import TerminalArea from './components/TerminalArea'
import ChatSidebar from './components/ChatSidebar'
import InputModal from './components/InputModal'
import AgentModal from './components/AgentModal'
import Dashboard from './components/Dashboard'
import Profile from './components/Profile'
import Settings from './components/Settings'
import { useSocket } from './hooks/useSocket'
import type { TerminalOutput, AgentConfig, AgentStartConfig } from './types'
import type { LayoutPreset } from './components/TerminalArea'
import './App.css'

const AGENTS_LIST: { id: string; name: string; icon: string }[] = [
  { id: 'claude', name: 'Claude Code', icon: '🤖' },
  { id: 'opencode', name: 'Opencode', icon: '🔧' },
  { id: 'codex', name: 'Codex', icon: '⚡' },
  { id: 'gemini', name: 'Gemini', icon: '✨' },
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
  } = useSocket()
  const [writeBuffers, setWriteBuffers] = useState<Record<string, string>>({})
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([])
  const [agentModalSession, setAgentModalSession] = useState<string | null>(null)
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>('auto')
  const [focusMode, setFocusMode] = useState(false)
  const [deletedWorkspaces, setDeletedWorkspaces] = useState<{ id: string; name: string; deletedAt: string }[]>([])
  const [activeView, setActiveView] = useState<'dashboard' | 'profile' | 'settings' | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('agent-workspace-theme') as 'dark' | 'light') || 'dark'
  })
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true)
  const appBodyRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(() => Math.round(window.innerWidth * 0.12))
  const [chatWidth, setChatWidth] = useState(() => Math.round(window.innerWidth * 0.15))
  const [bottomShellOpen, setBottomShellOpen] = useState(false)
  const dragging = useRef<'left' | 'right' | null>(null)

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
      setWriteBuffers(prev => ({
        ...prev,
        [data.sessionId]: (prev[data.sessionId] || '') + data.data,
      }))
    })
    return unsub
  }, [onTerminalOutput])

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

  function editWorkspace(_id: string, _name: string, _path: string) { }

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

  const agentSessions = useMemo(
    () => Object.values(sessions).filter(s => s.type === 'claude' || s.type === 'codex' || s.type === 'opencode' || s.type === 'gemini').slice(0, 12),
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
    showModal('Workspace name:', (name) => {
      const doCreate = async () => {
        let path = ''
        try {
          if (window.electronAPI) {
            try {
              path = await window.electronAPI.getDefaultPath() || ''
            } catch {}
            const selected = await window.electronAPI.selectDirectory()
            if (selected) path = selected
          } else {
            path = ''
            const fallback = prompt('Workspace directory:', '')
            if (fallback && fallback.trim()) path = fallback.trim()
          }
        } catch (e) {
          console.error('Error selecting workspace directory:', e)
        }
        addWorkspace(name, path)
        setModal(null)
      }
      doCreate()
    })
  }

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

  function handleCloseShellSession(sessionId: string) {
    closeTab([sessionId])
  }

  function handleSelectAgent(agentId: string) {
    if (agentId === 'claude' || agentId === 'opencode') {
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
        case 'save-workspace': alert('Workspace saved'); break
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
        case 'set-layout': setLayoutPreset(data); break
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
        const chatMax = Math.round(totalW * 0.15)

        if (dragging.current === 'left') {
          const dx = ev.clientX - startX
          let newW = Math.max(120, startLeft + dx)
          if (chatSidebarOpen) {
            newW = Math.min(newW, leftMax, totalW - chatWidth - 200)
          } else {
            newW = Math.min(newW, leftMax)
          }
          setLeftWidth(newW)
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
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
  }

  function iconPath(name: string): string {
    if (name === 'settings') {
      return theme === 'dark' ? '/img/settings-white.png' : '/img/setting.png'
    }
    return `/img/${name}${theme === 'dark' ? '-white' : ''}.png`
  }

  function setView(view: 'dashboard' | 'profile' | 'settings' | null) {
    setActiveView(activeView === view ? null : view)
  }

  return (
    <div className="app">
      <div className="app-body" ref={appBodyRef}>
        <div className="activity-bar">
          <div className="activity-bar-top">
            <div className="activity-logo" title="AgntSpce">
              <img src="/img/logo-icon.png" alt="AgntSpce" className="activity-logo-img" />
            </div>
            <button
              className={`activity-bar-btn ${workspaceSidebarOpen ? 'active' : ''}`}
              onClick={handleToggleWorkspaceSidebar}
              title="Workspaces"
            >
              <img src={iconPath('workspace')} alt="Workspaces" className="activity-bar-icon" />
            </button>
          </div>
          <div className="activity-bar-bottom">
            <button
              className={`activity-bar-btn ${bottomShellOpen ? 'active' : ''}`}
              onClick={handleToggleBottomShell}
              title="Terminal"
            >
              <img src={iconPath('terminal')} alt="Terminal" className="activity-bar-icon" />
            </button>
            <button
              className={`activity-bar-btn ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setView('dashboard')}
              title="Dashboard"
            >
              <img src="/img/dashboard.png" alt="Dashboard" className="activity-bar-icon" />
            </button>
            <button
              className={`activity-bar-btn ${activeView === 'profile' ? 'active' : ''}`}
              onClick={() => setView('profile')}
              title="Profile"
            >
              <img src={iconPath('profile')} alt="Profile" className="activity-bar-icon" />
            </button>
            <button
              className={`activity-bar-btn ${activeView === 'settings' ? 'active' : ''}`}
              onClick={() => setView('settings')}
              title="Settings"
            >
              <img src={iconPath('settings')} alt="Settings" className="activity-bar-icon" />
            </button>
          </div>
        </div>
        {workspaceSidebarOpen && (
          <>
            <div className="panel-left" style={{ width: leftWidth, minWidth: leftWidth }}>
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
              />
            </div>
            <div className="resizer" onMouseDown={onResizerMouseDown('left')} />
          </>
        )}
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
            />
          ) : activeView === 'profile' ? (
            <Profile onClose={() => setActiveView(null)} />
          ) : activeView === 'settings' ? (
            <Settings theme={theme} onThemeChange={setTheme} onClose={() => setActiveView(null)} />
          ) : (
            <TerminalArea
              sessions={agentSessions}
              shellSessions={shellSessions}
              onInput={sendTerminalInput}
              onResize={sendTerminalResize}
              onRestart={restartSession}
              onStartAgent={handleStartAgent}
              onShowAgentModal={handleShowAgentModal}
              onNewAgent={() => handleNewTerminal('claude')}
              onSelectAgent={handleSelectAgent}
              onNewShell={handleNewShell}
              onCloseTab={handleCloseAgentTab}
              onActiveSessionChange={setActiveSessionId}
              activeSessionId={activeSessionId}
              writeBuffers={writeBuffers}
              agentConfigs={agentConfigs}
              layoutPreset={layoutPreset}
              focusMode={focusMode}
              agentsList={AGENTS_LIST}
              bottomShellOpen={bottomShellOpen}
              onToggleShell={handleToggleBottomShell}
              chatSidebarOpen={chatSidebarOpen}
              onToggleChatSidebar={handleToggleChatSidebar}
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
    </div>
  )
}

export default App
