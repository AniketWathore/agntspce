import { useEffect, useState } from 'react'
import type { CavemanStats, CavemanAggregateStats, CavemanEvent } from '../types'

interface Props {
  cavemanStates: Record<string, CavemanStats>
  aggregateStats: CavemanAggregateStats
  liveEvents: { sessionId: string, event: CavemanEvent }[]
  onCavemanEvent: (cb: (data: { sessionId: string, event: CavemanEvent }) => void) => () => void
  onClose: () => void
}

export default function CavemanPanel({ cavemanStates, aggregateStats, liveEvents, onCavemanEvent, onClose }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<{ sessionId: string, event: CavemanEvent } | null>(null)
  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'stats' | 'events'>('stats')
  const [localEvents, setLocalEvents] = useState<{ sessionId: string, event: CavemanEvent }[]>([])

  useEffect(() => {
    const unsub = onCavemanEvent((data) => {
      setLocalEvents(prev => [data, ...prev].slice(0, 200))
    })
    return unsub
  }, [onCavemanEvent])

  const allEvents = [...localEvents]
  for (const evt of liveEvents) {
    if (!allEvents.find(e => e.event.timestamp === evt.event.timestamp && e.sessionId === evt.sessionId)) {
      allEvents.push(evt)
    }
  }
  allEvents.sort((a, b) => b.event.timestamp - a.event.timestamp)

  const filteredEvents = filter
    ? allEvents.filter(e =>
        e.sessionId.toLowerCase().includes(filter.toLowerCase()) ||
        e.event.rawText.toLowerCase().includes(filter.toLowerCase()) ||
        e.event.removed.some(r => r.toLowerCase().includes(filter.toLowerCase()))
      )
    : allEvents

  const totalTokens = aggregateStats.totalOutputTokens
  const totalSaved = aggregateStats.totalSavedTokens
  const savingsPct = (totalTokens + totalSaved) > 0
    ? Math.round((totalSaved / (totalTokens + totalSaved)) * 100)
    : 0
  const estCostSaved = totalSaved > 0 ? ((totalSaved / 1_000_000) * 15).toFixed(4) : '0.0000'

  const activeSessions = Object.values(cavemanStates).filter(s => s.enabled)

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h ${m % 60}m`
    if (m > 0) return `${m}m ${s % 60}s`
    return `${s}s`
  }

  return (
    <div className="caveman-panel">
      <div className="caveman-header">
        <div className="caveman-header-left">
          <h1>
            <span className="caveman-header-icon">🪨</span>
            Caveman
          </h1>
          <span className="caveman-badge">tokf</span>
          {activeSessions.length > 0 && <span className="caveman-badge live">live</span>}
        </div>
        <button className="caveman-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="caveman-tabs">
        <button
          className={`caveman-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
        <button
          className={`caveman-tab ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Events ({allEvents.length})
        </button>
      </div>

      {activeTab === 'stats' && (
        <div className="caveman-stats-content">
          <div className="caveman-stats-grid">
            <div className="caveman-stat-card">
              <div className="caveman-stat-value">{activeSessions.length}</div>
              <div className="caveman-stat-label">Active Sessions</div>
            </div>
            <div className="caveman-stat-card">
              <div className="caveman-stat-value">{totalTokens.toLocaleString()}</div>
              <div className="caveman-stat-label">Output Tokens (compressed)</div>
            </div>
            <div className="caveman-stat-card accent">
              <div className="caveman-stat-value">{totalSaved.toLocaleString()}</div>
              <div className="caveman-stat-label">Tokens Saved (est.)</div>
            </div>
            <div className="caveman-stat-card accent">
              <div className="caveman-stat-value">{savingsPct}%</div>
              <div className="caveman-stat-label">Compression Ratio</div>
            </div>
            <div className="caveman-stat-card">
              <div className="caveman-stat-value">~${estCostSaved}</div>
              <div className="caveman-stat-label">Est. Cost Saved</div>
            </div>
            <div className="caveman-stat-card">
              <div className="caveman-stat-value">{formatTime(aggregateStats.uptimeMs)}</div>
              <div className="caveman-stat-label">Tracking Duration</div>
            </div>
          </div>

          {activeSessions.length > 0 && (
            <div className="caveman-session-list">
              <div className="caveman-session-list-header">Active Sessions</div>
              {activeSessions.map(s => (
                <div key={s.sessionId} className="caveman-session-item">
                  <div className="caveman-session-item-header">
                    <span className="caveman-session-id">{s.sessionId.slice(-12)}</span>
                    <span className="caveman-session-level">{s.level.toUpperCase()}</span>
                    <span className="caveman-session-uptime">{formatTime(s.uptime)}</span>
                  </div>
                  <div className="caveman-session-stats">
                    <span>{s.outputTokens.toLocaleString()} tokens</span>
                    <span className="caveman-session-saved">+{s.estimatedSavedTokens.toLocaleString()} saved</span>
                    <span>{s.events.length} events</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSessions.length === 0 && (
            <div className="caveman-empty">
              <div className="caveman-empty-icon">🪨</div>
              <span>No active caveman sessions</span>
              <span className="caveman-empty-hint">
                Click the 🪨 button on any agent terminal header to enable caveman mode
              </span>
            </div>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="caveman-body">
          <div className="caveman-sidebar">
            <div className="caveman-sidebar-header">
              <div className="caveman-filter-wrap">
                <input
                  className="caveman-filter"
                  type="text"
                  placeholder="Filter events..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
                {filter && (
                  <button className="caveman-filter-clear" onClick={() => setFilter('')}>✕</button>
                )}
              </div>
            </div>
            <div className="caveman-list">
              {filteredEvents.length === 0 && (
                <div className="caveman-list-empty">
                  <div className="caveman-list-empty-icon">◉</div>
                  <span>No caveman events yet.</span>
                  <span className="caveman-list-empty-hint">Enable caveman on an agent terminal to see compression stats.</span>
                </div>
              )}
              {filteredEvents.map((item, i) => (
                <div
                  key={item.event.timestamp + '-' + i}
                  className={`caveman-event ${selectedEvent === item ? 'selected' : ''}`}
                  onClick={() => setSelectedEvent(item)}
                >
                  <div className="caveman-event-header">
                    <span className="caveman-event-savings">
                      -{item.event.savedTokens.toLocaleString()}
                    </span>
                    <span className="caveman-event-tokens">
                      {item.event.expandedTokens} → {item.event.rawTokens}
                    </span>
                    <span className="caveman-event-level">{item.event.level.toUpperCase()}</span>
                  </div>
                  <div className="caveman-event-preview">{item.event.rawText.slice(0, 120)}</div>
                  {item.event.removed.length > 0 && (
                    <div className="caveman-event-removed">
                      cut: {item.event.removed.slice(0, 6).join(', ')}
                    </div>
                  )}
                  <div className="caveman-event-session">{item.sessionId.slice(-12)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="caveman-detail">
            {selectedEvent ? (
              <>
                <div className="caveman-detail-header">
                  <h2>Output Event</h2>
                  <div className="caveman-detail-meta">
                    <span>level: <strong>{selectedEvent.event.level.toUpperCase()}</strong></span>
                    <span>tokens: <strong>{selectedEvent.event.expandedTokens} → {selectedEvent.event.rawTokens}</strong></span>
                    <span>saved: <strong>-{selectedEvent.event.savedTokens.toLocaleString()}</strong></span>
                    <span>session: <strong>{selectedEvent.sessionId.slice(-12)}</strong></span>
                  </div>
                </div>
                <div className="caveman-detail-removed">
                  Words cut: <strong>{selectedEvent.event.removed.join(', ') || 'none'}</strong>
                </div>
                <div className="caveman-detail-panels">
                  <div className="caveman-panel-box">
                    <div className="caveman-panel-box-label">
                      Expanded (estimated — {selectedEvent.event.expandedTokens} tokens)
                    </div>
                    <div className="caveman-panel-box-content">{selectedEvent.event.expandedText}</div>
                  </div>
                  <div className="caveman-panel-box">
                    <div className="caveman-panel-box-label accent">
                      Caveman output ({selectedEvent.event.rawTokens} tokens) — saved {selectedEvent.event.savedTokens}
                    </div>
                    <div className="caveman-panel-box-content">{selectedEvent.event.rawText}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="caveman-detail-empty">
                <div className="caveman-detail-empty-icon">🪨</div>
                <span>Select an event to view original vs compressed</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
