import type { WorkspaceInfo, SessionState } from '../types'

interface Props {
  workspaces: WorkspaceInfo[]
  sessions: Record<string, SessionState>
  activeWorkspace: WorkspaceInfo | null
  connected: boolean
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onNewTerminal: (type?: string) => void
  onToggleShellSidebar: () => void
  shellCount: number
}

export default function Header({ workspaces, sessions, activeWorkspace, connected, onSwitchWorkspace, onCreateWorkspace, onNewTerminal, onToggleShellSidebar, shellCount }: Props) {
  const sessionCount = Object.keys(sessions).length
  const busyCount = Object.values(sessions).filter(s => s.status === 'busy').length

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-title">Agent Workspace</h1>
        {activeWorkspace && <span className="active-workspace-name">{activeWorkspace.name}</span>}
      </div>

      <div className="header-center">
        <div className="workspace-selector">
          <select
            value={activeWorkspace?.id || ''}
            onChange={(e) => {
              if (e.target.value) onSwitchWorkspace(e.target.value)
            }}
          >
            <option value="">Select workspace...</option>
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="header-right">
        <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
        <span className="session-stats">
          {sessionCount} sessions
          {busyCount > 0 && <span className="busy-count"> · {busyCount} busy</span>}
        </span>
        <div className="header-buttons">
          <button className="new-workspace-btn" onClick={onCreateWorkspace}>+ New Workspace</button>
          <button className="new-terminal-btn" onClick={() => onNewTerminal('claude')}>+ Agent</button>
          <button className={`shell-toggle-btn${shellCount > 0 ? ' has-shells' : ''}`} onClick={onToggleShellSidebar} title="Toggle shell terminals">
            &gt;_ {shellCount > 0 && <span className="shell-count">{shellCount}</span>}
          </button>
        </div>
      </div>
    </header>
  )
}
