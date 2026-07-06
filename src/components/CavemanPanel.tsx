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

  const totalOriginalTokens = aggregateStats.totalOutputTokens
  const totalSavedTokens = aggregateStats.totalSavedTokens
  const savingsPct = (totalOriginalTokens + totalSavedTokens) > 0
    ? Math.round((totalSavedTokens / (totalOriginalTokens + totalSavedTokens)) * 100)
    : 0
  const estCostSaved = totalSavedTokens > 0 ? ((totalSavedTokens / 1_000_000) * 15).toFixed(4) : '0.0000'

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h ${m % 60}m`
    if (m > 0) return `${m}m ${s % 60}s`
    return `${s}s`
  }

  function formatTokens(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return n.toLocaleString()
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
          Sessions
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
              <div className="caveman-stat-value">{formatTokens(totalOutputTokens)}</div>
              <div className="caveman-stat-label">Output Tokens</div>
            </div>
            <div className="caveman-stat-card accent">
              <div className="caveman-stat-value">{formatTokens(totalSavedTokens)}</div>
              <div className="caveman-stat-label">Tokens Saved</div>
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

          {allSessions.map(s => {
            const totalRuns = s.runs.length
            const totalRunTokens = s.runs.reduce((a, r) => a + r.totalOriginalTokens, 0)
            const totalRunSaved = s.runs.reduce((a, r) => a + r.totalSavedTokens, 0)
            return (
              <div key={s.sessionId} className="caveman-session-summary">
                <div className="caveman-session-summary-header">
                  <span className="caveman-session-id">{s.sessionId.slice(-12)}</span>
                  <span className="caveman-session-level">{s.level.toUpperCase()}</span>
                  <span className="caveman-session-runs">{totalRuns} run{totalRuns !== 1 ? 's' : ''}</span>
                  <span className="caveman-session-tokens">{formatTokens(totalRunTokens)} tok</span>
                  <span className="caveman-session-saved">+{formatTokens(totalRunSaved)} saved</span>
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
              {allSessions.length === 0 && (
                <div className="caveman-list-empty">
                  <div className="caveman-list-empty-icon">🪨</div>
                  <span>No sessions yet.</span>
                  <span className="caveman-list-empty-hint">Enable caveman on an agent terminal to track runs.</span>
                </div>
              )}
              {allSessions.map(s => {
                const isSelected = s.sessionId === selectedSessionId
                const runCount = s.runs.length
                return (
                  <div key={s.sessionId}>
                    <div
                      className={`caveman-session-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedSessionId(s.sessionId)
                        setSelectedRunId(null)
                      }}
                    >
                      <div className="caveman-session-item-header">
                        <span className="caveman-session-id">{s.sessionId.slice(-12)}</span>
                        <span className="caveman-session-uptime">{formatTime(s.uptime)}</span>
                      </div>
                      <div className="caveman-session-stats">
                        <span>{runCount} run{runCount !== 1 ? 's' : ''}</span>
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
                              <span className="caveman-run-pct">buffering…</span>
                            </div>
                          </div>
                        )}
                        {s.runs.length === 0 && !s.currentRun && (
                          <div className="caveman-run-empty">No runs yet</div>
                        )}
                        {s.runs.map(r => {
                          const runPct = r.totalSavedTokens > 0
                            ? Math.round((r.totalSavedTokens / r.totalOriginalTokens) * 100)
                            : 0
                          return (
                            <div
                              key={r.id}
                              className={`caveman-run-item ${selectedRunId === r.id ? 'selected' : ''}`}
                              onClick={() => setSelectedRunId(r.id)}
                            >
                              <div className="caveman-run-prompt">{shortPrompt(r.prompt, 50)}</div>
                              <div className="caveman-run-meta">
                                <span className="caveman-run-saved">-{formatTokens(r.totalSavedTokens)} tok</span>
                                <span className="caveman-run-pct">{runPct}%</span>
                                <span className="caveman-run-duration">{formatTime(r.endedAt - r.startedAt)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="caveman-detail">
            {selectedRun ? (
              <div className="caveman-run-detail">
                <div className="caveman-run-detail-header">
                  <h2>Run</h2>
                  <div className="caveman-run-detail-meta">
                    <span>saved: <strong>{formatTokens(selectedRun.totalSavedTokens)} tokens</strong></span>
                    <span>compression: <strong>{
                      selectedRun.totalSavedTokens > 0
                        ? Math.round((selectedRun.totalSavedTokens / selectedRun.totalOriginalTokens) * 100)
                        : 0
                    }%</strong></span>
                    <span>duration: <strong>{formatTime(selectedRun.endedAt - selectedRun.startedAt)}</strong></span>
                  </div>
                </div>

                <div className="caveman-run-prompt-box">
                  <div className="caveman-run-prompt-label">Prompt</div>
                  <div className="caveman-run-prompt-text">{selectedRun.prompt}</div>
                </div>

                {selectedRun.removedWords.length > 0 && (
                  <div className="caveman-run-words">
                    <span className="caveman-run-words-label">Words cut:</span>
                    <span className="caveman-run-words-list">{selectedRun.removedWords.join(', ')}</span>
                  </div>
                )}

                <div className="caveman-run-chunks">
                  {selectedRun.chunks.length > 0 && selectedRun.chunks.map((chunk, i) => (
                    <div key={i} className="caveman-chunk">
                      <div className="caveman-chunk-panels">
                        <div className="caveman-chunk-panel">
                          <div className="caveman-chunk-panel-label">Original ({chunk.originalTokens} tok)</div>
                          <div className="caveman-chunk-panel-content">{chunk.originalText}</div>
                        </div>
                        <div className="caveman-chunk-panel">
                          <div className="caveman-chunk-panel-label accent">Compressed ({chunk.compressedTokens} tok)</div>
                          <div className="caveman-chunk-panel-content">{chunk.compressedText}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {selectedRun.chunks.length === 0 && (
                    <div className="caveman-run-empty">No output recorded for this run</div>
                  )}
                </div>
              </div>
            ) : selectedSessionId ? (
              <div className="caveman-detail-empty">
                <span>Select a run to view details</span>
              </div>
            ) : (
              <div className="caveman-detail-empty">
                <div className="caveman-list-empty-icon">🪨</div>
                <span>Select a session to see its runs</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


