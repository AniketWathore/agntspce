import { useEffect, useState } from 'react'
import type { WorkspaceInfo, SessionState } from '../types'
import { useSocket } from '../hooks/useSocket'

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
  const { compressionStats, compressionHistory, requestCompressionStats } = useSocket()
  const [showDebug, setShowDebug] = useState(false)
  const [debugSearch, setDebugSearch] = useState('')

  useEffect(() => {
    requestCompressionStats()
  }, [])

  const tokensSaved = compressionStats.totalOriginalTokens - compressionStats.totalCompressedTokens
  const charsSaved = compressionStats.totalOriginalChars - compressionStats.totalCompressedChars
  const pctReduction = compressionStats.totalOriginalTokens > 0
    ? Math.round((tokensSaved / compressionStats.totalOriginalTokens) * 100 * 10) / 10
    : 0

  const filteredHistory = debugSearch
    ? compressionHistory.filter(r =>
        r.original.toLowerCase().includes(debugSearch.toLowerCase()) ||
        r.compressed.toLowerCase().includes(debugSearch.toLowerCase())
      )
    : compressionHistory

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

      {compressionStats.linesCompressed > 0 && (
        <div className="dashboard-tr-section">
          <div className="dashboard-tr-header">
            <h2>Token Reduction</h2>
            <span className="dashboard-tr-badge">active</span>
          </div>
          <div className="dashboard-tr-grid">
            <div className="dashboard-tr-stat">
              <span className="dashboard-tr-value">{compressionStats.linesCompressed}</span>
              <span className="dashboard-tr-label">lines compressed</span>
            </div>
            <div className="dashboard-tr-stat">
              <span className="dashboard-tr-value">{tokensSaved}</span>
              <span className="dashboard-tr-label">tokens saved</span>
            </div>
            <div className="dashboard-tr-stat">
              <span className="dashboard-tr-value">{charsSaved.toLocaleString()}</span>
              <span className="dashboard-tr-label">chars saved</span>
            </div>
            <div className="dashboard-tr-stat">
              <span className="dashboard-tr-value">{pctReduction}%</span>
              <span className="dashboard-tr-label">avg reduction</span>
            </div>
          </div>
          <div className="dashboard-tr-detail">
            <span>{compressionStats.totalOriginalTokens} tokens → {compressionStats.totalCompressedTokens} tokens</span>
            <span> | </span>
            <span>{compressionStats.totalOriginalChars.toLocaleString()} chars → {compressionStats.totalCompressedChars.toLocaleString()} chars</span>
          </div>

          <div className="dashboard-tr-debug-header">
            <button className="dashboard-tr-debug-toggle" onClick={() => setShowDebug(!showDebug)}>
              {showDebug ? '▼' : '▶'} Debug Viewer ({compressionHistory.length} records)
            </button>
            {showDebug && (
              <input
                className="dashboard-tr-debug-search"
                type="text"
                placeholder="Filter records..."
                value={debugSearch}
                onChange={e => setDebugSearch(e.target.value)}
              />
            )}
          </div>

          {showDebug && (
            <div className="dashboard-tr-debug-list">
              {filteredHistory.length === 0 && (
                <div className="dashboard-tr-debug-empty">No compression records yet.</div>
              )}
              {filteredHistory.map((record, i) => (
                <div key={i} className="dashboard-tr-debug-item">
                  <div className="dashboard-tr-debug-meta">
                    <span className="dashboard-tr-debug-reduction">{record.reduction}% reduction</span>
                    <span className="dashboard-tr-debug-tokens">{record.originalTokens}→{record.compressedTokens} tokens</span>
                  </div>
                  <div className="dashboard-tr-debug-original">
                    <span className="dashboard-tr-debug-label">Original:</span>
                    <span className="dashboard-tr-debug-text">
                      {record.original.split(' ').map((word, wi) => {
                        const detail = record.details?.find(d => d.word === word)
                        const removed = detail && !detail.kept
                        return (
                          <span key={wi} className={removed ? 'tr-word-removed' : 'tr-word-kept'} title={detail?.reason}>
                            {word}{' '}
                          </span>
                        )
                      })}
                    </span>
                  </div>
                  <div className="dashboard-tr-debug-compressed">
                    <span className="dashboard-tr-debug-label">Compressed:</span>
                    <span className="dashboard-tr-debug-text">{record.compressed}</span>
                  </div>
                    {record.details && (
                    <div className="dashboard-tr-debug-removed">
                      <span className="dashboard-tr-debug-label">Removed:</span>
                      <span className="dashboard-tr-debug-text">
                        {record.details.filter(d => !d.kept).map((d, di) => (
                          <span key={di} className="tr-word-removed-reason" title={d.reason}>
                            {di > 0 && <>{' '}</>}"{d.word}"({d.reason})
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
