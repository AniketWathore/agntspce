import { useState } from 'react'
import type { Workspace } from '../App'
import './WorkspaceSidebar.css'

type Props = {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelect: (id: string) => void
  onAddWorkspace: () => void
  onEdit: (id: string, name: string, path: string) => void
  onRemove: (id: string) => void
}

export default function WorkspaceSidebar({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onAddWorkspace,
  onEdit,
  onRemove,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPath, setEditPath] = useState('')

  function startEdit(w: Workspace) {
    setEditingId(w.id)
    setEditName(w.name)
    setEditPath(w.path)
  }

  function saveEdit() {
    if (editingId && editName.trim() && editPath.trim()) {
      onEdit(editingId, editName.trim(), editPath.trim())
    }
    setEditingId(null)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Workspaces</h2>
        <button className="btn btn-primary btn-xs" onClick={onAddWorkspace}>
          Add Workspace
        </button>
      </div>

      <div className="sidebar-list">
        {workspaces.length === 0 ? (
          <div className="sidebar-empty">
            <p>No workspaces yet</p>
            <button className="btn btn-primary btn-sm" onClick={onAddWorkspace} style={{ marginTop: 12 }}>
              + Add Workspace
            </button>
          </div>
        ) : (
          workspaces.map(w => (
            <div
              key={w.id}
              className={`sidebar-item ${w.id === activeWorkspaceId ? 'active' : ''}`}
              onClick={() => onSelect(w.id)}
            >
              {editingId === w.id ? (
                <div className="sidebar-edit-form" onClick={e => e.stopPropagation()}>
                  <input
                    className="sidebar-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                    autoFocus
                  />
                  <input
                    className="sidebar-input"
                    value={editPath}
                    onChange={e => setEditPath(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  />
                  <div className="sidebar-form-actions">
                    <button className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="sidebar-item-content">
                    <span className="sidebar-item-name">{w.name}</span>
                    <span className="sidebar-item-path">{w.path}</span>
                  </div>
                  <div className="sidebar-item-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-icon-sm" onClick={() => startEdit(w)} title="Edit" aria-label={`Edit ${w.name}`}>✎</button>
                    <button className="btn btn-icon-sm" onClick={() => onRemove(w.id)} title="Remove" aria-label={`Remove ${w.name}`}>✕</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
