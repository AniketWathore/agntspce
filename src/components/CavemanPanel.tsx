import { useState } from 'react'
import type { CavemanStats, CavemanRun, CavemanAggregateStats } from '../types'

interface Props {
  cavemanStates: Record<string, CavemanStats>
  aggregateStats: CavemanAggregateStats
  onCavemanRun: (cb: (data: { sessionId: string, run: CavemanRun }) => void) => () => void
  onClose: () => void
}

export default function CavemanPanel({ cavemanStates, aggregateStats, onCavemanRun: _onCavemanRun, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'stats' | 'sessions'>('stats')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const allSessions = Object.values(cavemanStates)
  const activeSessions = allSessions.filter(s => s.enabled)
  const selectedSession = allSessions.find(s => s.sessionId === selectedSessionId)
  const selectedRun = selectedSession?.runs.find(r => r.id === selectedRunId)
    || (selectedSession?.currentRun?.id === selectedRunId ? selectedSession.currentRun : null)

  function formatTime(ms: number): string {
    const s = Math.floor(Math.max(0, ms || 0) / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h ${m % 60}m`
    if (m > 0) return `${m}m ${s % 60}s`
    return `${s}s`
  }

  const levelLabel: Record<string, string> = {
    lite: 'LITE — ~30% fewer output tokens. Drop filler, keep grammar.',
    full: 'FULL — ~65% fewer output tokens. Fragments, no articles.',
    ultra: 'ULTRA — ~75% fewer output tokens. Telegraphic, abbreviations.',
  }

  const levelClass: Record<string, string> = {
    lite: 'caveman-level-lite',
    full: 'caveman-level-full',
    ultra: 'caveman-level-ultra',
  }

  function shortPrompt(prompt: string, max = 60): string {
    return prompt.length > max ? prompt.slice(0, max) + '…' : prompt
  }

  return (
    <div className="caveman-panel">
      <div className="caveman-header">
        <div className="caveman-header-left">
          <h1>
            <span className="caveman-header-icon">🪨</span>
            Caveman
          </h1>
          {activeSessions.length > 0 && <span className="caveman-badge live">live</span>}
        </div>
        <button className="caveman-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="caveman-tabs">
        <button className={`caveman-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
          Stats
        </button>
        <button className={`caveman-tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => { setActiveTab('sessions'); setSelectedSessionId(null); setSelectedRunId(null) }}>
          Runs
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
              <div className="caveman-stat-value">{formatTime(aggregateStats.uptimeMs)}</div>
              <div className="caveman-stat-label">Tracking Duration</div>
            </div>
          </div>

          {allSessions.map(s => {
            const totalRuns = s.runs.length
            return (
              <div key={s.sessionId} className="caveman-session-summary">
                <div className="caveman-session-summary-header">
                  <span className="caveman-session-id">{s.sessionId.slice(-12)}</span>
                  <span className={`caveman-session-level ${levelClass[s.level] || ''}`}>{s.level.toUpperCase()}</span>
                  <span className="caveman-session-runs">{totalRuns} run{totalRuns !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="caveman-body">
          <div className="caveman-sidebar">
            <div className="caveman-list">
              {allSessions.length === 0 ? (
                <div className="caveman-list-empty">
                  <div className="caveman-list-empty-icon">🪨</div>
                  <span>No caveman sessions.</span>
                  <span className="caveman-list-empty-hint">Enable caveman on an agent terminal to activate.</span>
                </div>
              ) : (
                allSessions.map(s => {
                  const isSelected = selectedSessionId === s.sessionId
                  return (
                    <div key={s.sessionId}>
                      <div
                        className={`caveman-session-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => { setSelectedSessionId(s.sessionId); setSelectedRunId(null) }}
                      >
                        <div className="caveman-session-item-header">
                          <span className="caveman-session-id">{s.sessionId.slice(-12)}</span>
                          <span className="caveman-session-uptime">{formatTime(s.uptime)}</span>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="caveman-run-list">
                          {s.currentRun && (
                            <div
                              className={`caveman-run-item live ${selectedRunId === s.currentRun.id ? 'selected' : ''}`}
                              onClick={() => setSelectedRunId(s.currentRun!.id)}
                            >
                              <div className="caveman-run-prompt">{shortPrompt(s.currentRun.prompt, 50)}</div>
                              <div className="caveman-run-meta">
                                <span className="caveman-run-pct">caveman {s.level}</span>
                              </div>
                            </div>
                          )}
                          {s.runs.length === 0 && !s.currentRun && (
                            <div className="caveman-run-empty">No runs yet</div>
                          )}
                          {s.runs.slice().reverse().map(r => {
                            const runDuration = r.endedAt ? r.endedAt - r.startedAt : 0
                            return (
                              <div
                                key={r.id}
                                className={`caveman-run-item ${selectedRunId === r.id ? 'selected' : ''}`}
                                onClick={() => setSelectedRunId(r.id)}
                              >
                                <div className="caveman-run-prompt">{shortPrompt(r.prompt, 50)}</div>
                                <div className="caveman-run-meta">
                                  <span className="caveman-run-duration">{formatTime(runDuration)}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="caveman-detail">
            {selectedRun ? (
              <div className="caveman-run-detail">
                <div className="caveman-run-detail-header">
                  <div className="caveman-run-detail-meta">
                    <span>Run {selectedRun.id}</span>
                    <span>Started {new Date(selectedRun.startedAt).toLocaleTimeString()}</span>
                    {selectedRun.endedAt > 0 && <span>Duration {formatTime(selectedRun.endedAt - selectedRun.startedAt)}</span>}
                  </div>
                </div>
                <div className="caveman-run-prompt-box">
                  <div className="caveman-run-prompt-label">Prompt</div>
                  <div className="caveman-run-prompt-text">{selectedRun.prompt}</div>
                </div>
              </div>
            ) : (
              <div className="caveman-detail-empty">
                <div className="caveman-list-empty-icon">🪨</div>
                <span>Select a run to view details</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
