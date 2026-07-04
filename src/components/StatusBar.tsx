import type { SessionState, WorkspaceInfo } from '../types'

interface Props {
  sessions: Record<string, SessionState>
  workspaces: WorkspaceInfo[]
  activeWorkspace: WorkspaceInfo | null
}

function getSessionStats(sessions: Record<string, SessionState>) {
  const arr = Object.values(sessions)
  const total = arr.length
  const busy = arr.filter(s => s.status === 'busy' || s.status === 'waiting').length
  const shells = arr.filter(s => s.type === 'shell').length
  return { total, busy, shells }
}

export default function StatusBar({ sessions, workspaces, activeWorkspace }: Props) {
  const stats = getSessionStats(sessions)

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span className="status-bar-item status-bar-branch" title="Current workspace">
          <i className="codicon codicon-git-branch" style={{ fontSize: 14 }}></i>
          {activeWorkspace?.name || 'No workspace'}
        </span>
        <span className="status-bar-item" title="Active sessions">
          <i className="codicon codicon-person" style={{ fontSize: 14 }}></i>
          {stats.busy > 0 ? `${stats.busy}/${stats.total}` : `${stats.total}`}
        </span>
        <span className="status-bar-item" title="Shell terminals">
          <i className="codicon codicon-terminal" style={{ fontSize: 14 }}></i>
          {stats.shells}
        </span>
      </div>
      <div className="status-bar-right">
        <span className="status-bar-item" title="Workspaces">
          <i className="codicon codicon-folder" style={{ fontSize: 14 }}></i>
          {workspaces.length}
        </span>
        <span className="status-bar-item" title="Theme">
          <i className="codicon codicon-color-mode" style={{ fontSize: 14 }}></i>
        </span>
      </div>
    </footer>
  )
}