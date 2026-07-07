import { useState } from 'react'

interface FilterEvent {
  sessionId: string
  original: string
  filtered: string
  originalBytes: number
  filteredBytes: number
  originalTokens: number
  filteredTokens: number
  reduction: number
  rulesApplied: string[]
}

interface FilterStats {
  totalOriginalBytes: number
  totalFilteredBytes: number
  totalOriginalTokens: number
  totalFilteredTokens: number
  eventsProcessed: number
}

interface CommandEvent {
  sessionId: string
  command: string
  args: string[]
  rawOutput: string
  filteredOutput: string
  filterName: string | null
  originalTokens: number
  filteredTokens: number
  reduction: number
  exitCode: number | null
  duration: number
}

interface Props {
  filterStats: FilterStats
  commandHistory: CommandEvent[]
  onClose: () => void
}

export default function RtkDashboard({ filterStats, commandHistory, onClose }: Props) {
  const tokensSaved = filterStats.totalOriginalTokens - filterStats.totalFilteredTokens
  const pctReduction = filterStats.totalOriginalTokens > 0
    ? Math.round((tokensSaved / filterStats.totalOriginalTokens) * 100 * 10) / 10
    : 0
  const bytesSaved = filterStats.totalOriginalBytes - filterStats.totalFilteredBytes
  const bytesPct = filterStats.totalOriginalBytes > 0
    ? Math.round((bytesSaved / filterStats.totalOriginalBytes) * 100 * 10) / 10
    : 0

  const commandsFiltered = commandHistory.filter(c => c.filterName !== null).length
  const rtkActive = commandHistory.length > 0 && commandsFiltered > 0

  const avgReduction = commandHistory.length > 0
    ? Math.round(commandHistory.reduce((s, c) => s + c.reduction, 0) / commandHistory.length * 10) / 10
    : 0

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  return (
    <div className="ofd">
      <div className="ofd-header">
        <div className="ofd-header-left">
          <h1>AgntSpce Filter</h1>
          <span className="ofd-badge" style={{ background: rtkActive ? '#2ea043' : '#6e7681' }}>
            {rtkActive ? 'active' : 'inactive'}
          </span>
          <span className="ofd-badge" style={{ background: '#7c3aed' }}>agntspce</span>
          {commandHistory.length > 0 && <span className="ofd-badge live">live</span>}
        </div>
        <button className="ofd-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="ofd-header-stats">
        <span className="ofd-stat">
          <strong>{filterStats.eventsProcessed}</strong> events
        </span>
        <span className="ofd-stat">
          <strong>{commandHistory.length}</strong> commands
        </span>
        <span className="ofd-stat">
          <strong>{commandsFiltered}</strong> filtered
        </span>
        <span className="ofd-stat">
          <strong>{filterStats.totalOriginalBytes.toLocaleString()}</strong> → <strong>{filterStats.totalFilteredBytes.toLocaleString()}</strong> bytes
        </span>
        <span className="ofd-stat">
          <strong>{filterStats.totalOriginalTokens.toLocaleString()}</strong> → <strong>{filterStats.totalFilteredTokens.toLocaleString()}</strong> tokens
        </span>
        <span className="ofd-stat">
          saved <strong>{tokensSaved.toLocaleString()}</strong> tokens
        </span>
        {pctReduction > 0 && (
          <span className="ofd-stat pct">
            <strong>{pctReduction}%</strong> token reduction
          </span>
        )}
        {bytesPct > 0 && (
          <span className="ofd-stat pct">
            <strong>{bytesPct}%</strong> byte reduction
          </span>
        )}
        {avgReduction > 0 && (
          <span className="ofd-stat pct">
            <strong>{avgReduction}%</strong> avg/command
          </span>
        )}
      </div>

      <div className="ofd-body">
        <div className="ofd-sidebar">
          <div className="ofd-sidebar-header">
            <span style={{ fontWeight: 600, color: '#e6edf3' }}>Command History</span>
          </div>
          <div className="ofd-list">
            {commandHistory.length === 0 && (
              <div className="ofd-empty">
                <div className="ofd-empty-icon">🚀</div>
                <span>No commands processed yet.</span>
                <span className="ofd-empty-hint">Run commands inside Opencode agent to see AgntSpce token reduction stats.</span>
              </div>
            )}
            {commandHistory.map((event, i) => (
              <div
                key={i}
                className={`ofd-event ${selectedIdx === i ? 'selected' : ''}`}
                onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
              >
                <div className="ofd-event-header">
                  <span className="ofd-event-reduction" style={{ color: event.reduction > 0 ? '#58a6ff' : '#6e7681' }}>
                    {event.reduction > 0 ? `-${event.reduction}%` : '0%'}
                  </span>
                  <span className="ofd-event-tokens" style={{ fontSize: 11 }}>
                    {event.originalTokens} → {event.filteredTokens} tok
                  </span>
                  <span className="ofd-event-rules" style={{ color: event.filterName ? '#7c3aed' : '#6e7681' }}>
                    {event.filterName ? `agntspce` : 'passthrough'}
                  </span>
                </div>
                <div className="ofd-event-preview">
                  <span style={{ color: '#7ee787' }}>$ {event.command} {event.args.join(' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="ofd-detail">
          {selectedIdx !== null && commandHistory[selectedIdx] ? (
            (() => {
              const ev = commandHistory[selectedIdx]
              return (
                <div className="ofd-detail-header" style={{ padding: 16 }}>
                  <h2 style={{ margin: '0 0 12px', fontSize: 14, color: '#7ee787' }}>
                    $ {ev.command} {ev.args.join(' ')}
                  </h2>
                  <div className="ofd-detail-meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                    <span>filter: <strong style={{ color: ev.filterName ? '#58a6ff' : '#6e7681' }}>{ev.filterName || 'passthrough'}</strong></span>
                    <span>tokens: <strong>{ev.originalTokens}</strong> → <strong>{ev.filteredTokens}</strong></span>
                    <span>reduction: <strong style={{ color: ev.reduction > 0 ? '#58a6ff' : '#6e7681' }}>{ev.reduction}%</strong></span>
                    <span>duration: <strong>{(ev.duration / 1000).toFixed(1)}s</strong></span>
                    <span>exit: <strong>{ev.exitCode ?? '?'}</strong></span>
                  </div>
                  <div className="ofd-detail-panels" style={{ marginTop: 12, display: 'flex', gap: 8, height: 'calc(100% - 80px)' }}>
                    <div className="ofd-panel" style={{ flex: 1 }}>
                      <div className="ofd-panel-label">Original ({ev.originalTokens} tok)</div>
                      <div className="ofd-panel-content" style={{ fontSize: 11, lineHeight: 1.4 }}>{ev.rawOutput.slice(0, 3000)}</div>
                    </div>
                    <div className="ofd-panel" style={{ flex: 1 }}>
                      <div className="ofd-panel-label">Filtered ({ev.filteredTokens} tok)</div>
                      <div className="ofd-panel-content" style={{ fontSize: 11, lineHeight: 1.4 }}>{ev.filteredOutput.slice(0, 3000)}</div>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="ofd-detail-empty">
              <div className="ofd-detail-empty-icon">🚀</div>
              <span>AgntSpce Token Reduction Engine</span>
              <span className="ofd-empty-hint" style={{ marginTop: 8 }}>
                {rtkActive
                  ? `Filtering active — ${commandHistory.length} commands processed, ${commandsFiltered} with filters applied.`
                  : 'Waiting for commands to process...'}
              </span>
              <div className="ofd-empty-hint" style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
                filters: {commandHistory.length > 0 ? [...new Set(commandHistory.map(c => c.filterName).filter(Boolean))].join(', ') : 'default, git-status, test-runner, linter'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}