import { useState } from 'react'
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
  onAdd: (name: string, path: string) => void
  onEdit: (id: string, name: string, path: string) => void
  onRemove: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
  showModal: (title: string, onSubmit: (value: string) => void, defaultValue?: string) => void
  closeModal: () => void
  onOpenCreateModal: () => void
  onEditConfig: (ws: WorkspaceInfo) => void
}

function getSessionCount(ws: WorkspaceInfo): number {
  if (Array.isArray(ws.terminals)) return ws.terminals.length
  return ws.terminals?.pairs ? ws.terminals.pairs * 2 : 0
}

function getActiveCount(sessions: Record<string, SessionState>): number {
  return Object.values(sessions).filter(s => s.status === 'busy' || s.status === 'waiting').length
}

export default function WorkspaceSidebar({ workspaces, sessions, activeWorkspace, deletedWorkspaces, onSelect, onDelete, onRestore, onPermanentDelete, onOpenCreateModal, onEditConfig }: Props) {
  const [showTrash, setShowTrash] = useState(false)
  const activeCount = getActiveCount(sessions)

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-header">
          <h2>AgntSpce</h2>
          <div className="sidebar-header-buttons">
            <button className="add-btn" onClick={onOpenCreateModal} title="New workspace">+</button>
          </div>
        </div>

        <div className="sidebar-stats">
          <span className="stat">{Object.keys(sessions).length} terminals</span>
          {activeCount > 0 && <span className="stat active">{activeCount} active</span>}
        </div>

        <div className="workspace-list">
          {workspaces.map(ws => (
            <div
              key={ws.id}
              className={`workspace-item ${activeWorkspace?.id === ws.id ? 'active' : ''}`}
              onClick={() => onSelect(ws.id)}
            >
              <div className="workspace-item-header">
                <span className="workspace-name">{ws.name}</span>
                <span className="workspace-session-count">{getSessionCount(ws)}</span>
              </div>
              <div className="workspace-item-actions">
                <button
                  className="action-btn"
                  onClick={(e) => { e.stopPropagation(); onEditConfig(ws) }}
                  title="Configure"
                >
                  Config
                </button>
                <button
                  className="action-btn danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete workspace "${ws.name}"?`)) onDelete(ws.id)
                  }}
                  title="Delete"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>

        {deletedWorkspaces.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-header" onClick={() => setShowTrash(o => !o)}>
              <span className="trash-icon">{showTrash ? '▾' : '▸'}</span>
              <span>Trash ({deletedWorkspaces.length})</span>
            </div>
            {showTrash && deletedWorkspaces.map(dws => (
              <div key={dws.id} className="workspace-item deleted">
                <div className="workspace-item-header">
                  <span className="workspace-name">{dws.name}</span>
                </div>
                <div className="workspace-item-actions">
                  <button className="action-btn" onClick={() => onRestore(dws.id)} title="Restore">Restore</button>
                  <button className="action-btn danger" onClick={() => {
                    if (confirm(`Permanently delete "${dws.name}"?`)) onPermanentDelete(dws.id)
                  }} title="Permanent delete">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
