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
  const { filterStats } = useSocket()
  const [showDeleted, setShowDeleted] = useState(false)

  const tokensSaved = filterStats.totalOriginalTokens - filterStats.totalFilteredTokens
  const pctReduction = filterStats.totalOriginalTokens > 0
    ? Math.round((tokensSaved / filterStats.totalOriginalTokens) * 100 * 10) / 10
    : 0
  const costSaved = tokensSaved > 0 ? ((tokensSaved / 1000) * TOKEN_COST_PER_1K).toFixed(4) : '0'

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
