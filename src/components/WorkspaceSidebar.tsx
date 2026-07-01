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
  showDashboard: boolean
  activeView: 'dashboard' | 'profile' | 'settings' | null
  onSelect: (id: string) => void
  onAdd: (name: string, path: string) => void
  onEdit: (id: string, name: string, path: string) => void
  onRemove: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
  onViewChange: (view: 'dashboard' | 'profile' | 'settings' | null) => void
  showModal: (title: string, onSubmit: (value: string) => void, defaultValue?: string) => void
  closeModal: () => void
}

function getSessionCount(ws: WorkspaceInfo): number {
  if (Array.isArray(ws.terminals)) return ws.terminals.length
  return ws.terminals?.pairs ? ws.terminals.pairs * 2 : 0
}

function getActiveCount(sessions: Record<string, SessionState>): number {
  return Object.values(sessions).filter(s => s.status === 'busy' || s.status === 'waiting').length
}

export default function WorkspaceSidebar({ workspaces, sessions, activeWorkspace, deletedWorkspaces, showDashboard: _sd, activeView, onSelect, onAdd, onRemove: _onRemove, onDelete, onRestore, onPermanentDelete, onViewChange, showModal, closeModal }: Props) {
  const [showTrash, setShowTrash] = useState(false)
  const activeCount = getActiveCount(sessions)

  function handleAdd() {
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
        onAdd(name, path)
        closeModal()
      }
      doCreate()
    })
  }

  function setView(view: 'dashboard' | 'profile' | 'settings' | null) {
    onViewChange(activeView === view ? null : view)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-header">
          <h2>Workspaces</h2>
          <button className="add-btn" onClick={handleAdd}>+</button>
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
                <span className="workspace-icon">{ws.icon || '📁'}</span>
                <span className="workspace-name">{ws.name}</span>
                <span className="workspace-session-count">{getSessionCount(ws)}</span>
              </div>
              <div className="workspace-item-actions">
                <button
                  className="action-btn danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete workspace "${ws.name}"?`)) onDelete(ws.id)
                  }}
                  title="Delete"
                >🗑</button>
              </div>
            </div>
          ))}
        </div>

        {deletedWorkspaces.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-header" onClick={() => setShowTrash(o => !o)}>
              <span className="trash-icon">{showTrash ? '▼' : '▶'}</span>
              <span>Trash ({deletedWorkspaces.length})</span>
            </div>
            {showTrash && deletedWorkspaces.map(dws => (
              <div key={dws.id} className="workspace-item deleted">
                <div className="workspace-item-header">
                  <span className="workspace-icon">🗑</span>
                  <span className="workspace-name">{dws.name}</span>
                </div>
                <div className="workspace-item-actions">
                  <button className="action-btn" onClick={() => onRestore(dws.id)} title="Restore">↩</button>
                  <button className="action-btn danger" onClick={() => {
                    if (confirm(`Permanently delete "${dws.name}"?`)) onPermanentDelete(dws.id)
                  }} title="Permanent delete">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-bottom">
        <button
          className={`sidebar-action-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
          title="Dashboard"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </button>
        <button
          className={`sidebar-action-btn ${activeView === 'profile' ? 'active' : ''}`}
          onClick={() => setView('profile')}
          title="Profile"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/></svg>
        </button>
        <button
          className={`sidebar-action-btn ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
          title="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>
      </div>
    </aside>
  )
}
