import type { WorkspaceInfo, SessionState } from '../types'

interface DeletedWs {
  id: string
  name: string
  deletedAt: string
}

interface Props {
  workspaces: WorkspaceInfo[]
  sessions: Record<string, SessionState>
  activeWorkspace: WorkspaceInfo | null
  deletedWorkspaces: DeletedWs[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
  onNewWorkspace: () => void
}

function getSessionCount(ws: WorkspaceInfo): number {
  if (!ws.terminals) return 0
  if (Array.isArray(ws.terminals)) return ws.terminals.length
  return ws.terminals?.pairs ? ws.terminals.pairs * 2 : 0
}

function getActiveCount(sessions: Record<string, SessionState>): number {
  return Object.values(sessions).filter(s => s.status === 'busy' || s.status === 'waiting').length
}

export default function Dashboard({ workspaces, sessions, activeWorkspace, deletedWorkspaces, onSelect, onDelete, onRestore, onPermanentDelete, onNewWorkspace }: Props) {
  const totalSessions = Object.keys(sessions).length
  const activeCount = getActiveCount(sessions)

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="dashboard-stats">
          <span className="dashboard-stat">{workspaces.length} workspaces</span>
          <span className="dashboard-stat">{totalSessions} terminals</span>
          {activeCount > 0 && <span className="dashboard-stat active">{activeCount} active</span>}
        </div>
        <button className="new-workspace-btn" onClick={onNewWorkspace}>+ New Workspace</button>
      </div>

      <div className="dashboard-grid">
        {workspaces.map(ws => {
          const isActive = activeWorkspace?.id === ws.id
          const count = getSessionCount(ws)
          return (
            <div
              key={ws.id}
              className={`dashboard-card ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(ws.id)}
            >
              <div className="dashboard-card-header">
                <span className="dashboard-card-icon">{ws.icon || '📁'}</span>
                <span className="dashboard-card-name">{ws.name}</span>
                {isActive && <span className="dashboard-card-badge">active</span>}
              </div>
              <div className="dashboard-card-stats">
                <div className="card-stat">
                  <span className="card-stat-value">{count}</span>
                  <span className="card-stat-label">sessions</span>
                </div>
                <div className="card-stat">
                  <span className="card-stat-value">{ws.worktrees?.enabled ? ws.worktrees.count || 1 : 0}</span>
                  <span className="card-stat-label">worktrees</span>
                </div>
              </div>
              <div className="dashboard-card-footer">
                <button
                  className="dashboard-card-btn"
                  onClick={(e) => { e.stopPropagation(); onSelect(ws.id) }}
                >
                  {isActive ? 'Switch to' : 'Open'}
                </button>
                <button
                  className="dashboard-card-btn danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete workspace "${ws.name}"?`)) onDelete(ws.id)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {deletedWorkspaces.length > 0 && (
        <div className="dashboard-deleted">
          <h2>Trash ({deletedWorkspaces.length})</h2>
          <div className="dashboard-deleted-list">
            {deletedWorkspaces.map(dws => (
              <div key={dws.id} className="dashboard-deleted-item">
                <span>🗑 {dws.name}</span>
                <div className="dashboard-deleted-actions">
                  <button onClick={() => onRestore(dws.id)} title="Restore">↩ Restore</button>
                  <button className="danger" onClick={() => {
                    if (confirm(`Permanently delete "${dws.name}"?`)) onPermanentDelete(dws.id)
                  }} title="Permanent delete">✕ Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
