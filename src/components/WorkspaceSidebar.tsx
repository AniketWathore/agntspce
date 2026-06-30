import type { WorkspaceInfo, SessionState } from '../types'

interface Props {
  workspaces: WorkspaceInfo[]
  sessions: Record<string, SessionState>
  activeWorkspace: WorkspaceInfo | null
  onSelect: (id: string) => void
  onAdd: (name: string, path: string) => void
  onEdit: (id: string, name: string, path: string) => void
  onRemove: (id: string) => void
  onDelete: (id: string) => void
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

export default function WorkspaceSidebar({ workspaces, sessions, activeWorkspace, onSelect, onAdd, onRemove, onDelete, showModal, closeModal }: Props) {
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

  return (
    <aside className="sidebar">
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
                className="action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                }}
                title="Rename"
              >✏️</button>
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

      <div className="sidebar-footer">
        {activeWorkspace && (
          <button className="remove-btn" onClick={() => {
            if (confirm(`Remove workspace "${activeWorkspace.name}" from view?`)) onRemove(activeWorkspace.id)
          }}>Remove Active</button>
        )}
      </div>
    </aside>
  )
}
