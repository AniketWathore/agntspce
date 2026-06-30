import { useState, useEffect, useCallback, useMemo } from 'react'
import Header from './components/Header'
import WorkspaceSidebar from './components/WorkspaceSidebar'
import TerminalArea from './components/TerminalArea'
import ShellSidebar from './components/ShellSidebar'
import InputModal from './components/InputModal'
import AgentModal from './components/AgentModal'
import { useSocket } from './hooks/useSocket'
import type { TerminalOutput, AgentConfig, AgentStartConfig } from './types'
import './App.css'

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
    connected, sessions, workspaces, activeWorkspace,
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

  return (
    <div className="app">
      <Header
        workspaces={workspaces}
        sessions={sessions}
        activeWorkspace={activeWorkspace}
        connected={connected}
        onSwitchWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onNewTerminal={handleNewTerminal}
        onToggleShellSidebar={() => setShellSidebarOpen(o => !o)}
        shellCount={shellSessions.length}
      />
      <div className="app-body">
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
        <main className="main-content">
          <TerminalArea
            sessions={agentSessions}
            onInput={sendTerminalInput}
            onResize={sendTerminalResize}
            onRestart={restartSession}
            onStartAgent={handleStartAgent}
            onShowAgentModal={handleShowAgentModal}
            onNewTerminal={handleNewTerminal}
            writeBuffers={writeBuffers}
            agentConfigs={agentConfigs}
          />
        </main>
        {shellSidebarOpen && (
          <ShellSidebar
            sessions={shellSessions}
            onInput={sendTerminalInput}
            onResize={sendTerminalResize}
            onRestart={restartSession}
            onClose={handleCloseShellSession}
            onNewShell={() => handleNewTerminal('shell')}
            writeBuffers={writeBuffers}
          />
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
