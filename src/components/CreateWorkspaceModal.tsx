import { useState } from 'react'

interface CreateWorkspaceModalProps {
  open: boolean
  onClose: () => void
  onCreateLocal: (name: string, path: string) => Promise<void>
  onCreateFromGit: (gitUrl: string, name?: string) => Promise<void>
}

export default function CreateWorkspaceModal({ open, onClose, onCreateLocal, onCreateFromGit }: CreateWorkspaceModalProps) {
  const [tab, setTab] = useState<'local' | 'git'>('local')
  const [name, setName] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleCreateLocal() {
    if (!name.trim() || !path.trim()) return
    setLoading(true)
    setError('')
    try {
      await onCreateLocal(name.trim(), path.trim())
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to create workspace')
    }
    setLoading(false)
  }

  async function handleCreateFromGit() {
    if (!gitUrl.trim()) return
    setLoading(true)
    setError('')
    try {
      await onCreateFromGit(gitUrl.trim(), name.trim() || undefined)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to clone repository')
    }
    setLoading(false)
  }

  async function handlePickFolder() {
    if (window.electronAPI) {
      try {
        const selected = await window.electronAPI.selectDirectory()
        if (selected) setPath(selected)
      } catch {}
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal create-workspace-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Create Workspace</h3>

        <div className="create-workspace-tabs">
          <button className={`tab-btn ${tab === 'local' ? 'active' : ''}`} onClick={() => setTab('local')}>
            Local Folder
          </button>
          <button className={`tab-btn ${tab === 'git' ? 'active' : ''}`} onClick={() => setTab('git')}>
            Clone from Git
          </button>
        </div>

        <div className="create-workspace-fields">
          <label>Name:</label>
          <input
            type="text"
            className="text-input"
            placeholder="My Workspace"
            value={name}
            onChange={e => setName(e.target.value)}
          />

          {tab === 'local' ? (
            <>
              <label>Folder:</label>
              <div className="path-picker">
                <input
                  type="text"
                  className="text-input"
                  placeholder="/path/to/project"
                  value={path}
                  onChange={e => setPath(e.target.value)}
                />
                <button className="browse-btn" onClick={handlePickFolder}>Browse</button>
              </div>
            </>
          ) : (
            <>
              <label>Git URL:</label>
              <input
                type="text"
                className="text-input"
                placeholder="https://github.com/user/repo.git"
                value={gitUrl}
                onChange={e => setGitUrl(e.target.value)}
              />
            </>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn modal-btn-ok"
            onClick={tab === 'local' ? handleCreateLocal : handleCreateFromGit}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
