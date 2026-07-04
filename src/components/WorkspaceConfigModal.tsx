import { useState, useEffect } from 'react'
import type { WorkspaceInfo } from '../types'

interface WorktreeInfo {
  id: string
  path: string
  branch?: string
}

interface WorkspaceConfigModalProps {
  open: boolean
  workspace: WorkspaceInfo | null
  onClose: () => void
  onSave: (workspaceId: string, updates: any) => Promise<void>
  worktrees?: WorktreeInfo[]
  onAddWorktree?: (workspaceId: string) => Promise<void>
  onRemoveWorktree?: (workspaceId: string, worktreeId: string) => Promise<void>
}

export default function WorkspaceConfigModal({
  open, workspace, onClose, onSave,
  worktrees = [], onAddWorktree, onRemoveWorktree,
}: WorkspaceConfigModalProps) {
  const [envVarsText, setEnvVarsText] = useState('')
  const [setupScript, setSetupScript] = useState('')
  const [teardownScript, setTeardownScript] = useState('')
  const [wtEnabled, setWtEnabled] = useState(false)
  const [wtCount, setWtCount] = useState(1)
  const [wtNaming, setWtNaming] = useState('work{n}')
  const [wtAutoCreate, setWtAutoCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'general' | 'worktrees'>('general')

  useEffect(() => {
    if (open && workspace) {
      const envText = workspace.envVars
        ? Object.entries(workspace.envVars).map(([k, v]) => `${k}=${v}`).join('\n')
        : ''
      setEnvVarsText(envText)
      setSetupScript(workspace.setupScript || '')
      setTeardownScript(workspace.teardownScript || '')
      setWtEnabled(workspace.worktrees?.enabled ?? false)
      setWtCount(workspace.worktrees?.count ?? 1)
      setWtNaming(workspace.worktrees?.namingPattern ?? 'work{n}')
      setWtAutoCreate(workspace.worktrees?.autoCreate ?? false)
      setError('')
    }
  }, [open, workspace])

  if (!open || !workspace) return null
  const ws = workspace

  async function handleSave() {
    setSaving(true)
    setError('')
    const envVars: Record<string, string> = {}
    for (const line of envVarsText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
      }
    }
    try {
      await onSave(ws.id, {
        envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
        setupScript: setupScript.trim() || undefined,
        teardownScript: teardownScript.trim() || undefined,
        worktrees: {
          enabled: wtEnabled,
          count: wtCount,
          namingPattern: wtNaming,
          autoCreate: wtAutoCreate,
        },
      })
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal workspace-config-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Workspace Config: {workspace.name}</h3>

        <div className="create-workspace-tabs config-tabs">
          <button className={`tab-btn ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
            General
          </button>
          <button className={`tab-btn ${tab === 'worktrees' ? 'active' : ''}`} onClick={() => setTab('worktrees')}>
            Worktrees
          </button>
        </div>

        {tab === 'general' ? (
          <>
            <div className="config-field">
              <label>Environment Variables (one per line, KEY=VALUE):</label>
              <textarea
                className="config-textarea"
                rows={4}
                placeholder="NODE_ENV=development&#10;API_KEY=sk-xxx"
                value={envVarsText}
                onChange={e => setEnvVarsText(e.target.value)}
              />
            </div>

            <div className="config-field">
              <label>Setup Script (runs on workspace activation):</label>
              <textarea
                className="config-textarea config-textarea-code"
                rows={3}
                placeholder="#!/bin/bash&#10;echo 'Setting up...'&#10;npm install"
                value={setupScript}
                onChange={e => setSetupScript(e.target.value)}
              />
            </div>

            <div className="config-field">
              <label>Teardown Script (runs on workspace deactivation):</label>
              <textarea
                className="config-textarea config-textarea-code"
                rows={3}
                placeholder="#!/bin/bash&#10;echo 'Cleaning up...'&#10;docker compose down"
                value={teardownScript}
                onChange={e => setTeardownScript(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="config-field">
              <div className="toggle-row">
                <label>Enable Git Worktrees</label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={wtEnabled} onChange={e => setWtEnabled(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            {wtEnabled && (
              <>
                <div className="config-field">
                  <label>Number of Worktrees:</label>
                  <input
                    type="number"
                    className="text-input"
                    min={1}
                    max={10}
                    value={wtCount}
                    onChange={e => setWtCount(parseInt(e.target.value) || 1)}
                  />
                </div>

                <div className="config-field">
                  <label>Naming Pattern ({'{n}'} = number):</label>
                  <input
                    type="text"
                    className="text-input text-input-mono"
                    value={wtNaming}
                    onChange={e => setWtNaming(e.target.value)}
                    placeholder="work{n}"
                  />
                  <span className="field-hint">
                    Will create: {Array.from({ length: Math.min(wtCount, 3) }, (_, i) => wtNaming.replace('{n}', String(i + 1))).join(', ')}
                  </span>
                </div>

                <div className="config-field">
                  <div className="toggle-row">
                    <label>Auto-create with git worktree add</label>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={wtAutoCreate} onChange={e => setWtAutoCreate(e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className="config-section-divider" />

            <div className="config-field">
              <label>Worktrees ({worktrees.length}):</label>
              <div className="worktree-list">
                {worktrees.length === 0 ? (
                  <p className="worktree-empty">No worktrees configured</p>
                ) : (
                  worktrees.map(wt => (
                    <div key={wt.id} className="worktree-item">
                      <div className="worktree-item-info">
                        <span className="worktree-item-name">{wt.id}</span>
                        <span className="worktree-item-path">{wt.path}</span>
                        {wt.branch && <span className="worktree-item-branch">{wt.branch}</span>}
                      </div>
                      {onRemoveWorktree && (
                        <button
                          className="action-btn danger worktree-remove-btn"
                          onClick={() => onRemoveWorktree(workspace.id, wt.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {onAddWorktree && wtEnabled && (
                <button className="modal-btn modal-btn-ok worktree-add-btn" onClick={() => onAddWorktree(workspace.id)}>
                  Add Worktree
                </button>
              )}
            </div>
          </>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn-ok" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
