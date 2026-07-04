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

function FolderIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.38a1.5 1.5 0 0 1 1.06.44L8.5 4.5H12A1.5 1.5 0 0 1 13.5 6v.5H5a1.5 1.5 0 0 0-1.44 1.03l-.97 3.27A.5.5 0 0 0 3.07 11h-.57A1.5 1.5 0 0 1 1 9.5V4.5z" fill="#DCB67A"/>
        <path d="M5.07 6H14.5A1.5 1.5 0 0 1 16 7.5v4.94a1.5 1.5 0 0 1-1.5 1.5H3.14a1.5 1.5 0 0 1-1.44-1.97l.93-3.1A1.5 1.5 0 0 1 4.07 7.5H5.1L5.07 6z" fill="#DCB67A" opacity="0.7"/>
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M1.5 3.5a1 1 0 0 1 1-1h3.172a1 1 0 0 1 .707.293L7.5 3.5H13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.5z" fill="#DCB67A"/>
    </svg>
  )
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
                <FolderIcon open={activeWorkspace?.id === ws.id} />
                <span className="workspace-name">{ws.name}</span>
                {getSessionCount(ws) > 0 && <span className="workspace-session-count">{getSessionCount(ws)}</span>}
              </div>
              <div className={`workspace-item-actions${menuOpenId === ws.id ? ' show' : ''}`}>
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
