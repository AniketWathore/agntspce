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
}

function getSessionCount(ws: WorkspaceInfo): number {
  if (Array.isArray(ws.terminals)) return ws.terminals.length
  return ws.terminals?.pairs ? ws.terminals.pairs * 2 : 0
}

function getActiveCount(sessions: Record<string, SessionState>): number {
  return Object.values(sessions).filter(s => s.status === 'busy' || s.status === 'waiting').length
}

export default function WorkspaceSidebar({ workspaces, sessions, activeWorkspace, deletedWorkspaces, onSelect, onEdit, onDelete, onRestore, onPermanentDelete, onOpenCreateModal, showModal, closeModal }: Props) {
  const [showTrash, setShowTrash] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const activeCount = getActiveCount(sessions)

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-header">
          <h2>Workspace</h2>
          <div className="sidebar-header-buttons">
            <button className="add-btn" onClick={onOpenCreateModal} title="New workspace">+</button>
          </div>
        </div>

        <div className="sidebar-stats">
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
              <div className="workspace-item-actions" style={{ position: 'relative' }}>
                <button
                  className="action-btn dots-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenId(menuOpenId === ws.id ? null : ws.id)
                  }}
                  title="Options"
                >⋮</button>
                {menuOpenId === ws.id && (
                  <div className="workspace-menu" onClick={e => e.stopPropagation()}>
                    <button
                      className="workspace-menu-item"
                      onClick={() => {
                        setMenuOpenId(null)
                        showModal('Rename workspace:', (name) => {
                          onEdit(ws.id, name, ws.repository?.path || '')
                          closeModal()
                        }, ws.name)
                      }}
                    >Rename</button>
                    <button
                      className="workspace-menu-item danger"
                      onClick={() => {
                        setMenuOpenId(null)
                        if (confirm(`Delete workspace "${ws.name}"?`)) onDelete(ws.id)
                      }}
                    >Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {menuOpenId && (
            <div className="workspace-menu-overlay" onClick={() => setMenuOpenId(null)} />
          )}
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
