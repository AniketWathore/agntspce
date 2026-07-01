import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import WorkspaceSidebar from './components/WorkspaceSidebar'
import TerminalArea from './components/TerminalArea'
import ShellSidebar from './components/ShellSidebar'
import InputModal from './components/InputModal'
import AgentModal from './components/AgentModal'
import AgentPicker from './components/AgentPicker'
import { useSocket } from './hooks/useSocket'
import type { TerminalOutput, AgentConfig, AgentStartConfig } from './types'
import type { LayoutPreset } from './components/TerminalArea'
import './App.css'

const AGENTS_LIST: { id: string, name: string, icon: string }[] = [
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
    deleteWorkspace, closeTab, startAgent, fetchAgentConfigs, createRawSession,
  } = useSocket()
  const [writeBuffers, setWriteBuffers] = useState<Record<string, string>>({})
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([])
  const [agentModalSession, setAgentModalSession] = useState<string | null>(null)
  const [shellSidebarOpen, setShellSidebarOpen] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>('auto')
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(true)
  const appBodyRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(320)
  const dragging = useRef<'left' | 'right' | null>(null)

  useEffect(() => {
    fetchAgentConfigs().then(configs => {
      if (configs.length > 0) setAgentConfigs(configs)
      else setAgentConfigs(FALLBACK_AGENTS)
    }).catch(() => setAgentConfigs(FALLBACK_AGENTS))
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
        let path = '/tmp'
        try {
          if (window.electronAPI) {
            const selected = await window.electronAPI.selectDirectory()
            if (selected) path = selected
          } else {
            const fallback = prompt('Workspace directory:', path)
            if (fallback && fallback.trim()) path = fallback.trim()
          }
        } catch {}
        addWorkspace(name, path)
        setModal(null)
      }
      doCreate()
    })
  }

  function handleSelectWorkspace(id: string) {
    switchWorkspace(id)
  }

  function handleDeleteWorkspace(id: string) {
    deleteWorkspace(id)
    removeWorkspace(id)
  }

  function handleCloseShellSession(sessionId: string) {
    closeTab([sessionId])
  }

  function handleSelectAgent(agentId: string) {
    setShowAgentPicker(false)
    handleNewTerminal(agentId)
  }

  function handleAgentPickerBtnClick() {
    setShowAgentPicker(o => !o)
  }

  // Auto-set active session when a new one is created
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
    if (shellSessions.length === 0) {
      handleNewTerminal('shell')
    }
    setShellSidebarOpen(o => !o)
  }

  function handleToggleWorkspaceSidebar() {
    setWorkspaceSidebarOpen(o => !o)
  }

  // Native menu IPC
  useEffect(() => {
    const unsub = window.electronAPI?.onMenuAction?.((action, data) => {
      switch (action) {
        case 'new-agent': handleAgentPickerBtnClick(); break
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
        case 'toggle-shell-sidebar': setShellSidebarOpen(o => !o); break
        case 'toggle-workspace-sidebar': handleToggleWorkspaceSidebar(); break
        case 'set-layout': setLayoutPreset(data); break
        case 'show-shortcuts': alert(
          '⌘N — New Window\n⌘⇧N — New Workspace\n⌘⇧A — New Agent\n⌘⇧S — New Shell\n' +
          '⌘O — Load Workspace\n⌘S — Save\n⌘W — Close Window\n' +
          '⌘Tab / ⌘⇧Tab — Cycle Tabs\n⌘1-9 — Go to Tab\n' +
          '⌘B — Shell Sidebar\n⌘⇧B — Workspace Sidebar'
        ); break
        case 'show-about': alert('Agent Workspace v1.0\nElectron + React + TypeScript'); break
      }
    })
    return () => unsub?.()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return

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

  // Resize drag handlers
  function onResizerMouseDown(side: 'left' | 'right') {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = side
      const startX = e.clientX
      const startLeft = leftWidth
      const startRight = rightWidth

      function onMove(ev: MouseEvent) {
        if (!appBodyRef.current) return
        const bodyRect = appBodyRef.current.getBoundingClientRect()
        const totalW = bodyRect.width
        const maxPanel = totalW * 0.2

        if (dragging.current === 'left') {
          const dx = ev.clientX - startX
          let newW = Math.max(180, startLeft + dx)
          if (shellSidebarOpen) {
            newW = Math.min(newW, maxPanel, totalW - rightWidth - 200)
          } else {
            newW = Math.min(newW, maxPanel)
          }
          setLeftWidth(newW)
        } else if (dragging.current === 'right') {
          const dx = startX - ev.clientX
          let newW = Math.max(200, startRight + dx)
          newW = Math.min(newW, maxPanel, totalW - leftWidth - 180)
          setRightWidth(newW)
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

  return (
    <div className="app">
      <div className="app-body" ref={appBodyRef}>
        {workspaceSidebarOpen && (
          <>
            <div className="panel-left" style={{ width: leftWidth, minWidth: leftWidth }}>
              <WorkspaceSidebar
                workspaces={workspaces}
                sessions={sessions}
                activeWorkspace={activeWorkspace}
                onSelect={handleSelectWorkspace}
                onAdd={addWorkspace}
                onEdit={editWorkspace}
                onRemove={removeWorkspace}
                onDelete={handleDeleteWorkspace}
                showModal={showModal}
                closeModal={closeModal}
              />
            </div>
            <div className="resizer" onMouseDown={onResizerMouseDown('left')} />
          </>
        )}
        <main className="main-content">
          <TerminalArea
            sessions={agentSessions}
            onInput={sendTerminalInput}
            onResize={sendTerminalResize}
            onRestart={restartSession}
            onStartAgent={handleStartAgent}
            onShowAgentModal={handleShowAgentModal}
            onNewAgent={() => setShowAgentPicker(true)}
            onNewShell={handleNewShell}
            onCloseTab={handleCloseAgentTab}
            onActiveSessionChange={setActiveSessionId}
            activeSessionId={activeSessionId}
            writeBuffers={writeBuffers}
            agentConfigs={agentConfigs}
            layoutPreset={layoutPreset}
          />
        </main>
        {shellSidebarOpen && (
          <>
            <div className="resizer" onMouseDown={onResizerMouseDown('right')} />
            <div className="panel-right" style={{ width: rightWidth, minWidth: rightWidth }}>
              <ShellSidebar
                sessions={shellSessions}
                onInput={sendTerminalInput}
                onResize={sendTerminalResize}
                onRestart={restartSession}
                onClose={handleCloseShellSession}
                onNewShell={() => handleNewTerminal('shell')}
                writeBuffers={writeBuffers}
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
      {showAgentPicker && (
        <AgentPicker
          agents={AGENTS_LIST}
          onSelect={handleSelectAgent}
          onClose={() => setShowAgentPicker(false)}
        />
      )}
    </div>
  )
}

export default App
