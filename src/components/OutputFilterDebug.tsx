import { useEffect, useState } from 'react'

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

interface Props {
  filterStats: FilterStats
  filterHistory: FilterEvent[]
  onFilterEvent: (cb: (event: FilterEvent) => void) => () => void
  onClose: () => void
}

export default function OutputFilterDebug({ filterStats, filterHistory, onFilterEvent, onClose }: Props) {
  const [selected, setSelected] = useState<FilterEvent | null>(null)
  const [filter, setFilter] = useState('')
  const [liveEvents, setLiveEvents] = useState<FilterEvent[]>([])

  useEffect(() => {
    const unsub = onFilterEvent((event) => {
      setLiveEvents(prev => [event, ...prev].slice(0, 200))
    })
    return unsub
  }, [onFilterEvent])

  const allEvents = [...liveEvents]
  for (const e of filterHistory) {
    if (!allEvents.find(l => l.original === e.original && l.sessionId === e.sessionId)) {
      allEvents.push(e)
    }
  }
  allEvents.sort((a, b) => b.originalBytes - a.originalBytes)

  const tokensSaved = filterStats.totalOriginalTokens - filterStats.totalFilteredTokens
  const pctReduction = filterStats.totalOriginalTokens > 0
    ? Math.round((tokensSaved / filterStats.totalOriginalTokens) * 100 * 10) / 10
    : 0

  const filteredEvents = filter
    ? allEvents.filter(e =>
        e.rulesApplied.some(r => r.toLowerCase().includes(filter.toLowerCase())) ||
        e.sessionId.toLowerCase().includes(filter.toLowerCase())
      )
    : allEvents

  return (
    <div className="ofd">
      <div className="ofd-header">
        <div className="ofd-header-left">
          <h1>Output Filter</h1>
          <span className="ofd-badge">tokf</span>
          {filterStats.eventsProcessed > 0 && <span className="ofd-badge live">live</span>}
        </div>
        <button className="ofd-close" onClick={onClose} title="Close">✕</button>
      </div>
      <div className="ofd-header-stats">
        <span className="ofd-stat">
          <strong>{filterStats.eventsProcessed}</strong> events
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
            <strong>{pctReduction}%</strong> reduction
          </span>
        )}
      </div>
      <div className="ofd-body">
        <div className="ofd-sidebar">
          <div className="ofd-sidebar-header">
            <div className="ofd-filter-wrap">
              <input
                className="ofd-filter"
                type="text"
                placeholder="Filter events..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
              {filter && (
                <button className="ofd-filter-clear" onClick={() => setFilter('')}>✕</button>
              )}
            </div>
          </div>
          <div className="ofd-list">
            {filteredEvents.length === 0 && (
              <div className="ofd-empty">
                <div className="ofd-empty-icon">◉</div>
                <span>No filtered output events yet.</span>
                <span className="ofd-empty-hint">Run commands in an agent terminal to see tokf-style compression stats.</span>
              </div>
            )}
            {filteredEvents.map((event, i) => (
              <div
                key={i}
                className={`ofd-event ${selected === event ? 'selected' : ''}`}
                onClick={() => setSelected(event)}
              >
                <div className="ofd-event-header">
                  <span className="ofd-event-reduction">{event.reduction}%</span>
                  <span className="ofd-event-tokens">{event.originalTokens} → {event.filteredTokens}</span>
                  <span className="ofd-event-rules">{event.rulesApplied.join(', ')}</span>
                </div>
                <div className="ofd-event-preview">{event.filtered.slice(0, 120)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="ofd-detail">
          {selected ? (
            <>
              <div className="ofd-detail-header">
                <h2>Output Event</h2>
                <div className="ofd-detail-meta">
                  <span>red: <strong>-{selected.reduction}%</strong></span>
                  <span>bytes: <strong>{selected.originalBytes} → {selected.filteredBytes}</strong></span>
                  <span>tokens: <strong>{selected.originalTokens} → {selected.filteredTokens}</strong></span>
                  <span>rules: <strong>{selected.rulesApplied.join(', ')}</strong></span>
                </div>
              </div>
              <div className="ofd-detail-panels">
                <div className="ofd-panel">
                  <div className="ofd-panel-label">
                    Original ({selected.originalTokens} tokens)
                  </div>
                  <div className="ofd-panel-content">{selected.original}</div>
                </div>
                <div className="ofd-panel">
                  <div className="ofd-panel-label">
                    Filtered ({selected.filteredTokens} tokens)
                  </div>
                  <div className="ofd-panel-content">{selected.filtered}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="ofd-detail-empty">
              <div className="ofd-detail-empty-icon">◈</div>
              <span>Select an event to view details</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
