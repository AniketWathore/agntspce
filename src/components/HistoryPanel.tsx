import { useMemo } from 'react'

interface HistoryEntry {
  id: string
  type: string
  worktreeId: string
  branch: string
  status: string
  lastActivity: number
  closedAt: number
  agentId?: string
}

const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude',
  opencode: 'Opencode',
  codex: 'Codex',
  gemini: 'Gemini',
  'cursor-agent': 'Cursor Agent',
  copilot: 'Copilot',
  mastracode: 'Mastra Code',
  droid: 'Droid',
  amp: 'Amp',
  pi: 'Pi',
  shell: 'Shell',
}

function typeLabel(t: string): string {
  return AGENT_LABELS[t] || t
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

interface Props {
  history: HistoryEntry[]
  onRestore: (entry: HistoryEntry) => void
  onClose: () => void
}

export default function HistoryPanel({ history, onRestore, onClose }: Props) {
  const sorted = useMemo(() => {
    return [...history].sort((a, b) => b.closedAt - a.closedAt)
  }, [history])

  const groupedByAgent = useMemo(() => {
    const groups: Record<string, HistoryEntry[]> = {}
    for (const entry of sorted) {
      const key = entry.agentId || entry.type
      if (!groups[key]) groups[key] = []
      groups[key].push(entry)
    }
    return groups
  }, [sorted])

  if (history.length === 0) {
    return (
      <div className="history-panel-overlay" onClick={onClose}>
        <div className="history-panel" onClick={e => e.stopPropagation()}>
          <div className="history-panel-header">
            <h3>Session History</h3>
            <button className="history-close-btn" onClick={onClose}>✕</button>
          </div>
          <div className="history-empty">No past sessions</div>
        </div>
      </div>
    )
  }

  return (
    <div className="history-panel-overlay" onClick={onClose}>
      <div className="history-panel" onClick={e => e.stopPropagation()}>
        <div className="history-panel-header">
          <h3>Session History ({history.length})</h3>
          <button className="history-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="history-panel-list">
          {Object.entries(groupedByAgent).map(([agentId, entries]) => (
            <div key={agentId} className="history-group">
              <div className="history-group-title">{typeLabel(agentId)}</div>
              {entries.map(entry => (
                <div key={entry.id} className="history-item">
                  <div className="history-item-info">
                    <span className="history-item-id">{entry.id.slice(-12)}</span>
                    {entry.branch && <span className="history-item-branch">{entry.branch}</span>}
                    <span className="history-item-time">closed {timeAgo(entry.closedAt)}</span>
                  </div>
                  <button
                    className="history-restore-btn"
                    onClick={() => onRestore(entry)}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { HistoryEntry }
