import { useState } from 'react'
import type { WorkspaceInfo, SessionState, FilterStats, CommandEvent } from '../types'
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
  filterStats?: FilterStats
  searchEvents?: CommandEvent[]
  commandHistory?: CommandEvent[]
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
const BAR_CHARS = 24

function EfficiencyBar({ pct, color = '#22C55E' }: { pct: number; color?: string }) {
  const filled = Math.round((pct / 100) * BAR_CHARS)
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 13, color, letterSpacing: 0 }}>
      {'█'.repeat(Math.max(0, filled))}{'░'.repeat(Math.max(0, BAR_CHARS - filled))} {pct}%
    </span>
  )
}

export default function Dashboard(props: Props) {
  const { workspaces, sessions, activeWorkspace, deletedWorkspaces, onSelect, onDelete, onRestore, onPermanentDelete, onNewWorkspace, onClose } = props
  const searchEvents = props.searchEvents || []
  const commandHistory = props.commandHistory || []
  const totalSessions = Object.keys(sessions).length
  const activeCount = getActiveCount(sessions)
  const [showDeleted, setShowDeleted] = useState(false)

  const totalOriginal = commandHistory.reduce((s, e) => s + (e.command.startsWith('agntspce-search') ? 0 : e.originalTokens), 0)
  const totalFiltered = commandHistory.reduce((s, e) => s + (e.command.startsWith('agntspce-search') ? 0 : e.filteredTokens), 0)
  const totalCalls = commandHistory.filter(e => !e.command.startsWith('agntspce-search')).length
  const tokensSaved = totalOriginal - totalFiltered
  const pctReduction = totalOriginal > 0
    ? Math.round((tokensSaved / totalOriginal) * 100)
    : 0
  const costSaved = tokensSaved > 0 ? ((tokensSaved / 1000) * TOKEN_COST_PER_1K).toFixed(4) : '0'

  const searchTotalOrig = searchEvents.reduce((s, e) => s + e.originalTokens, 0)
  const searchTotalFilt = searchEvents.reduce((s, e) => s + e.filteredTokens, 0)
  const searchSaved = searchTotalOrig - searchTotalFilt
  const searchPct = searchTotalOrig > 0 ? Math.round((searchSaved / searchTotalOrig) * 100) : 0

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

        {/* Command Filter Savings — real: raw output vs filtered output comparison */}
        {totalCalls > 0 && (
          <div className="dashboard-chart">
            <div className="dashboard-chart-header">
              <span className="dashboard-chart-label">Command Output Filters</span>
              <span className="dashboard-chart-legend">exact token reduction in LLM context</span>
            </div>
            <div className="dashboard-savings-table">
              <div className="savings-row">
                <span>Saved from LLM context:</span>
                <span className="savings-value">{tokensSaved.toLocaleString()} tokens ({pctReduction}% reduction)</span>
              </div>
              <div className="savings-row">
                <span>Efficiency:</span>
                <EfficiencyBar pct={pctReduction} />
              </div>
              <div className="savings-row">
                <span>Commands filtered:</span>
                <span className="savings-value">{totalCalls} commands &mdash; {totalOriginal.toLocaleString()} raw tokens</span>
              </div>
            </div>
          </div>
        )}

        {/* Code Search Savings — estimated: full files vs returned snippets */}
        {searchEvents.length > 0 && (
          <div className="dashboard-chart" style={{ borderLeftColor: '#8b5cf6' }}>
            <div className="dashboard-chart-header">
              <span className="dashboard-chart-label">Code Search (agntspce-search)</span>
              <span className="dashboard-chart-legend">estimated tokens avoided vs reading full files</span>
            </div>
            <div className="dashboard-savings-table">
              <div className="savings-row">
                <span>Estimated tokens avoided:</span>
                <span className="savings-value">{searchSaved.toLocaleString()} tokens ({searchPct}% reduction)</span>
              </div>
              <div className="savings-row">
                <span>Efficiency:</span>
                <EfficiencyBar pct={searchPct} color="#8b5cf6" />
              </div>
              <div className="savings-row">
                <span>Searches run:</span>
                <span className="savings-value">{searchEvents.length} searches &mdash; {searchTotalOrig.toLocaleString()} chars of source code</span>
              </div>
            </div>
          </div>
        )}

        {/* Per-Session Breakdown — only marker-detected commands */}
        {commandHistory.length > 0 && (
          <div className="dashboard-chart" style={{ borderLeftColor: '#f59e0b' }}>
            <div className="dashboard-chart-header">
              <span className="dashboard-chart-label">Per-Session Breakdown</span>
              <span className="dashboard-chart-legend">tokens tracked via agntspce wrapper</span>
            </div>
            <div className="dashboard-savings-table">
              {(() => {
                const bySession = new Map<string, { commands: number; orig: number; filt: number }>()
                for (const e of commandHistory) {
                  if (e.command.startsWith('agntspce-search')) continue
                  const s = bySession.get(e.sessionId) || { commands: 0, orig: 0, filt: 0 }
                  s.commands++
                  s.orig += e.originalTokens
                  s.filt += e.filteredTokens
                  bySession.set(e.sessionId, s)
                }
                const sorted = [...bySession.entries()].sort((a, b) => b[1].orig - a[1].orig)
                return sorted.map(([sid, stats]) => {
                  const saved = stats.orig - stats.filt
                  const pct = stats.orig > 0 ? Math.round((saved / stats.orig) * 100) : 0
                  return (
                    <div key={sid} className="savings-row" style={{ fontSize: 12, padding: '4px 0' }}>
                      <span style={{ color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: 11 }}>
                        {sid.slice(0, 8)}
                      </span>
                      <span style={{ marginLeft: 8 }}>
                        {stats.commands} cmd{stats.commands !== 1 ? 's' : ''} &mdash;
                        {' '}{stats.orig.toLocaleString()} raw &rarr; {stats.filt.toLocaleString()} filtered
                        <span style={{ color: pct > 0 ? '#22C55E' : 'var(--text-dim)', marginLeft: 8 }}>
                          ({pct}% saved)
                        </span>
                      </span>
                    </div>
                  )
                })
              })()}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              Raw token counts come from the <code>agntspce</code> wrapper's <code>spawnSync</code> capture; filtered counts come from the wrapper's <code>applyFilter</code> output.
              Commands not run through the wrapper (e.g. <code>git status</code> without <code>agntspce</code>) are detected via shell prompt patterns
              and use the RTK filter pipeline. Fallback events capture terminal output when no shell command can be identified.
            </div>
          </div>
        )}

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
