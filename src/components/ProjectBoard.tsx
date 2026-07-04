import { useMemo } from 'react'
import type { SessionState } from '../types'
import { getAgentColorImage } from '../agentImages'

const STATUS_CONFIG: Record<string, { label: string, className: string }> = {
  idle: { label: 'Idle', className: 'status-idle' },
  busy: { label: 'Busy', className: 'status-busy' },
  waiting: { label: 'Waiting', className: 'status-waiting' },
  exited: { label: 'Exited', className: 'status-exited' },
}

interface Props {
  sessions: SessionState[]
  onSelect: (sessionId: string) => void
  onRestart: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onNewAgent: () => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    claude: 'Claude',
    opencode: 'Opencode',
    codex: 'Codex',
    gemini: 'Gemini',
    'cursor-agent': 'Cursor',
    copilot: 'Copilot',
    mastracode: 'Mastra',
    droid: 'Droid',
    amp: 'Amp',
    pi: 'Pi',
  }
  return labels[type] || type
}

export default function ProjectBoard({ sessions, onSelect, onRestart, onClose, onNewAgent }: Props) {
  const groupedSessions = useMemo(() => {
    const groups: Record<string, { agentId: string, sessions: SessionState[] }> = {}
    for (const s of sessions) {
      if (!groups[s.type]) groups[s.type] = { agentId: s.type, sessions: [] }
      groups[s.type].sessions.push(s)
    }
    return Object.values(groups)
  }, [sessions])

  if (sessions.length === 0) {
    return (
      <div className="project-board-empty">
        <div className="empty-state">
          <p>No agent sessions</p>
          <p className="empty-hint">Create an agent terminal to get started</p>
          <button className="new-terminal-btn" onClick={onNewAgent}>+ Agent</button>
        </div>
      </div>
    )
  }

  const runningCount = sessions.filter(s => s.status !== 'exited').length
  const busyCount = sessions.filter(s => s.status === 'busy').length

  return (
    <div className="project-board">
      <div className="project-board-header">
        <div className="project-board-header-left">
          <h2>Project Board</h2>
          <div className="project-board-header-stats">
            <span className="project-board-stat">{sessions.length} total</span>
            <span className="project-board-stat running">{runningCount} running</span>
            {busyCount > 0 && <span className="project-board-stat busy">{busyCount} busy</span>}
          </div>
        </div>
      </div>

      <div className="project-board-sections">
        {groupedSessions.map(group => (
          <div key={group.agentId} className="project-board-group">
            <div className="project-board-group-header">
              <img className="project-board-group-icon" src={getAgentColorImage(group.agentId)} alt={group.agentId} />
              <span className="project-board-group-name">{typeLabel(group.agentId)}</span>
              <span className="project-board-group-count">{group.sessions.length}</span>
            </div>
            <div className="project-board-cards">
              {group.sessions.map(session => {
                const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle
                return (
                  <div
                    key={session.id}
                    className="project-board-card"
                    onClick={() => onSelect(session.id)}
                  >
                    <div className="project-board-card-top">
                      <div className="project-board-card-title-row">
                        <span className={`project-board-status-dot ${statusCfg.className}`} />
                        <span className="project-board-card-id">{session.id.slice(-12)}</span>
                        <span className={`project-board-status-label ${statusCfg.className}`}>{statusCfg.label}</span>
                      </div>
                    </div>
                    {session.branch && (
                      <div className="project-board-card-detail">
                        <span className="project-board-detail-label">Branch</span>
                        <span className="project-board-detail-value">{session.branch}</span>
                      </div>
                    )}
                    <div className="project-board-card-detail">
                      <span className="project-board-detail-label">Last activity</span>
                      <span className="project-board-detail-value">{timeAgo(session.lastActivity)}</span>
                    </div>
                    {session.worktreeId && session.worktreeId !== 'default' && (
                      <div className="project-board-card-detail">
                        <span className="project-board-detail-label">Worktree</span>
                        <span className="project-board-detail-value">{session.worktreeId}</span>
                      </div>
                    )}
                    {session.sessionGroupId && (
                      <div className="project-board-card-detail">
                        <span className="project-board-detail-label">Group</span>
                        <span className="project-board-detail-value">{session.sessionGroupId.slice(-12)}</span>
                      </div>
                    )}
                    <div className="project-board-card-actions">
                      <button
                        className="project-board-action-btn"
                        onClick={(e) => { e.stopPropagation(); onSelect(session.id) }}
                      >
                        Focus
                      </button>
                      <button
                        className="project-board-action-btn"
                        onClick={(e) => { e.stopPropagation(); onRestart(session.id) }}
                      >
                        Restart
                      </button>
                      <button
                        className="project-board-action-btn danger"
                        onClick={(e) => { e.stopPropagation(); onClose(session.id) }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
