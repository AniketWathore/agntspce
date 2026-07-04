import { useEffect, useState } from 'react'
import type { WorkspaceInfo, SessionState } from '../types'
import { useSocket } from '../hooks/useSocket'
import ActivityFeed from './ActivityFeed'

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
  onClose: () => void
}

function getSessionCount(ws: WorkspaceInfo): number {
  if (!ws.terminals) return 0
  if (Array.isArray(ws.terminals)) return ws.terminals.length
  return ws.terminals?.pairs ? ws.terminals.pairs * 2 : 0
}

function getActiveCount(sessions: Record<string, SessionState>): number {
  return Object.values(sessions).filter(s => s.status === 'busy' || s.status === 'waiting').length
}

const TOKEN_COST_PER_1K = 0.015

export default function Dashboard({ workspaces, sessions, activeWorkspace, deletedWorkspaces, onSelect, onDelete, onRestore, onPermanentDelete, onNewWorkspace, onClose }: Props) {
  const totalSessions = Object.keys(sessions).length
  const activeCount = getActiveCount(sessions)
  const { compressionStats, compressionHistory, requestCompressionStats } = useSocket()
  const [showDebug, setShowDebug] = useState(false)
  const [debugSearch, setDebugSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  useEffect(() => {
    requestCompressionStats()
  }, [])

  const tokensSaved = compressionStats.totalOriginalTokens - compressionStats.totalCompressedTokens
  const charsSaved = compressionStats.totalOriginalChars - compressionStats.totalCompressedChars
  const pctReduction = compressionStats.totalOriginalTokens > 0
    ? Math.round((tokensSaved / compressionStats.totalOriginalTokens) * 100 * 10) / 10
    : 0
  const costSaved = tokensSaved > 0 ? ((tokensSaved / 1000) * TOKEN_COST_PER_1K).toFixed(4) : '0'

  const filteredHistory = debugSearch
    ? compressionHistory.filter(r =>
        r.original.toLowerCase().includes(debugSearch.toLowerCase()) ||
        r.compressed.toLowerCase().includes(debugSearch.toLowerCase())
      )
    : compressionHistory

  const topReductions = [...compressionHistory].sort((a, b) => b.reduction - a.reduction).slice(0, 5)
  const maxOriginal = topReductions.length > 0 ? Math.max(...topReductions.map(r => r.originalTokens)) : 1

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>Dashboard</h1>
          <div className="dashboard-header-stats">
            <span className="dashboard-header-stat">{workspaces.length} workspaces</span>
            <span className="dashboard-header-stat">{totalSessions} terminals</span>
            {activeCount > 0 && <span className="dashboard-header-stat active">{activeCount} active</span>}
          </div>
        </div>
        <div className="dashboard-header-actions">
          <button className="new-terminal-btn" onClick={onNewWorkspace}>+ New Workspace</button>
          <button className="dashboard-close-btn" onClick={onClose} title="Close">
            <i className="codicon codicon-close" style={{ fontSize: 16 }}></i>
          </button>
        </div>
      </div>

      <div className="dashboard-body">
        {/* Overview Stats */}
        <div className="dashboard-overview">
          <div className="dashboard-overview-card">
            <div className="dashboard-overview-card-header">
              <span className="dashboard-overview-label">Total Sessions</span>
            </div>
            <span className="dashboard-overview-value">{totalSessions}</span>
            <span className="dashboard-overview-change neutral">{workspaces.length} workspaces</span>
          </div>
          <div className="dashboard-overview-card">
            <div className="dashboard-overview-card-header">
              <span className="dashboard-overview-label">Tokens Saved</span>
            </div>
            <span className="dashboard-overview-value">{tokensSaved.toLocaleString()}</span>
            {pctReduction > 0 && <span className="dashboard-overview-change up">↑ {pctReduction}% reduction</span>}
          </div>
          <div className="dashboard-overview-card">
            <div className="dashboard-overview-card-header">
              <span className="dashboard-overview-label">Cost Saved</span>
            </div>
            <span className="dashboard-overview-value">${costSaved}</span>
            {parseFloat(costSaved) > 0 && <span className="dashboard-overview-change up">↑ estimated savings</span>}
          </div>
          <div className="dashboard-overview-card">
            <div className="dashboard-overview-card-header">
              <span className="dashboard-overview-label">Active Now</span>
            </div>
            <span className="dashboard-overview-value">{activeCount}</span>
            <span className="dashboard-overview-change neutral">{totalSessions - activeCount} idle</span>
          </div>
        </div>

        {/* Activity Feed */}
        <ActivityFeed sessions={sessions} maxEvents={30} />

        {/* Token Reduction Section */}
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
                <span className="dashboard-tr-value">{tokensSaved.toLocaleString()}</span>
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
              <span>{compressionStats.totalOriginalTokens.toLocaleString()} tokens → {compressionStats.totalCompressedTokens.toLocaleString()} tokens</span>
              <span> | </span>
              <span>{compressionStats.totalOriginalChars.toLocaleString()} chars → {compressionStats.totalCompressedChars.toLocaleString()} chars</span>
            </div>

            {/* Token Flow Visualization */}
            {tokensSaved > 0 && (
              <div className="dashboard-tr-flow">
                <div className="tr-flow-stat">
                  <div className="tr-flow-stat-label">Original</div>
                  <div className="tr-flow-stat-value original">{compressionStats.totalOriginalTokens.toLocaleString()}</div>
                </div>
                <div className="tr-flow-arrow">→</div>
                <div className="tr-flow-stat">
                  <div className="tr-flow-stat-label">Compressed</div>
                  <div className="tr-flow-stat-value compressed">{compressionStats.totalCompressedTokens.toLocaleString()}</div>
                </div>
                <div className="tr-flow-arrow">→</div>
                <div className="tr-flow-stat">
                  <div className="tr-flow-stat-label">Saved ({pctReduction}%)</div>
                  <div className="tr-flow-stat-value saved">{tokensSaved.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Top Reductions Chart */}
            {topReductions.length > 0 && (
              <div className="dashboard-tr-chart">
                <h3>Top Token Reductions</h3>
                <div className="tr-chart-bars">
                  {topReductions.map((r, i) => {
                    const originalW = (r.originalTokens / maxOriginal) * 100
                    const compressedW = (r.compressedTokens / r.originalTokens) * originalW
                    return (
                      <div key={i} className="tr-chart-row">
                        <span className="tr-chart-label">{r.reduction}%</span>
                        <div className="tr-chart-bar-container">
                          <div className="tr-chart-bar-original" style={{ width: `${originalW}%` }} />
                          <div className="tr-chart-bar-compressed" style={{ width: `${compressedW}%` }} />
                        </div>
                        <span className="tr-chart-value">{r.originalTokens}→{r.compressedTokens}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Debug Viewer Toggle */}
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

        {/* Workspace Cards */}
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

        {/* Deleted Workspaces */}
        {deletedWorkspaces.length > 0 && (
          <div className="dashboard-deleted">
            <div className="dashboard-deleted-header" onClick={() => setShowDeleted(!showDeleted)}>
              <h2>Trash ({deletedWorkspaces.length})</h2>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{showDeleted ? '▼' : '▶'}</span>
            </div>
            {showDeleted && (
              <div className="dashboard-deleted-list">
                {deletedWorkspaces.map(dws => (
                  <div key={dws.id} className="dashboard-deleted-item">
                    <span>{dws.name}</span>
                    <div className="dashboard-deleted-actions">
                      <button onClick={() => onRestore(dws.id)} title="Restore">↩ Restore</button>
                      <button className="danger" onClick={() => {
                        if (confirm(`Permanently delete "${dws.name}"?`)) onPermanentDelete(dws.id)
                      }} title="Permanent delete">✕ Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
