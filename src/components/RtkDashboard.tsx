import { useState, useMemo } from 'react'
import type { CommandEvent, ExecutionEvent } from '../types'

interface Props {
  executionHistory: ExecutionEvent[]
  sessionStartedAt: number
  onClose: () => void
}

function timeStr(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' as any }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return (ms / 1000).toFixed(2) + 's'
}

export default function RtkDashboard({ executionHistory, sessionStartedAt, onClose }: Props) {
  const totalOriginalBytes = useMemo(() => executionHistory.reduce((s, e) => s + e.commands.reduce((cs, c) => cs + c.rawOutput.length, 0), 0), [executionHistory])
  const totalFilteredBytes = useMemo(() => executionHistory.reduce((s, e) => s + e.commands.reduce((cs, c) => cs + c.filteredOutput.length, 0), 0), [executionHistory])
  const totalOriginalTokens = useMemo(() => executionHistory.reduce((s, e) => s + e.totalOriginalTokens, 0), [executionHistory])
  const totalFilteredTokens = useMemo(() => executionHistory.reduce((s, e) => s + e.totalFilteredTokens, 0), [executionHistory])
  const tokensSaved = totalOriginalTokens - totalFilteredTokens
  const pctReduction = totalOriginalTokens > 0
    ? Math.round((tokensSaved / totalOriginalTokens) * 100 * 10) / 10
    : 0

  const totalCommands = executionHistory.reduce((s, e) => s + e.commandCount, 0)
  const successfulEx = executionHistory.filter(e => e.success).length
  const failedEx = executionHistory.length - successfulEx
  const totalDurationMs = executionHistory.reduce((s, e) => s + e.totalDuration, 0)

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [expandedCmd, setExpandedCmd] = useState<number | null>(null)
  const selected = selectedIdx !== null ? executionHistory[selectedIdx] ?? null : null

  return (
    <div className="ofd">
      <div className="ofd-header">
        <div className="ofd-header-left">
          <h1>AgntSpce Filter</h1>
          <span className="ofd-badge" style={{ background: executionHistory.length > 0 ? '#2ea043' : '#6e7681' }}>
            {executionHistory.length > 0 ? 'active' : 'inactive'}
          </span>
          <span className="ofd-badge" style={{ background: '#7c3aed' }}>agntspce</span>
          {executionHistory.length > 0 && <span className="ofd-badge live">live</span>}
        </div>
        <button className="ofd-close" onClick={onClose} title="Close">✕</button>
      </div>

      {executionHistory.length > 0 && (
        <div style={{ padding: '6px 16px', fontSize: 11, display: 'flex', gap: 16, flexWrap: 'wrap', background: '#0d1117', borderBottom: '1px solid #21262d' }}>
          <span style={{ color: '#8b949e', fontWeight: 600 }}>Session</span>
          <span>started: <strong style={{ color: '#e6edf3' }}>{timeStr(sessionStartedAt)}</strong></span>
          <span>ended: <strong style={{ color: '#e6edf3' }}>{timeStr(Math.max(...executionHistory.map(e => e.endedAt || Date.now())))}</strong></span>
          <span>executions: <strong style={{ color: '#e6edf3' }}>{executionHistory.length}</strong></span>
          <span>commands: <strong style={{ color: '#e6edf3' }}>{totalCommands}</strong></span>
          <span>successful: <strong style={{ color: '#7ee787' }}>{successfulEx}</strong></span>
          {failedEx > 0 && <span>failed: <strong style={{ color: '#f85149' }}>{failedEx}</strong></span>}
          <span>tokens saved: <strong style={{ color: '#58a6ff' }}>{tokensSaved.toLocaleString()}</strong></span>
          {pctReduction > 0 && <span>avg reduction: <strong style={{ color: '#58a6ff' }}>{pctReduction}%</strong></span>}
        </div>
      )}

      <div className="ofd-body">
        <div className="ofd-sidebar" style={{ minWidth: 280, maxWidth: 320 }}>
          <div className="ofd-sidebar-header">
            <span style={{ fontWeight: 600, color: '#e6edf3' }}>Executions</span>
          </div>
          <div className="ofd-list">
            {executionHistory.length === 0 && (
              <div className="ofd-empty">
                <div className="ofd-empty-icon">🚀</div>
                <span>No executions yet.</span>
                <span className="ofd-empty-hint">Send a prompt to an agent to see execution details.</span>
              </div>
            )}
            {executionHistory.map((exec, i) => (
              <div
                key={exec.id}
                className={`ofd-event ${selectedIdx === i ? 'selected' : ''}`}
                onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
              >
                <div className="ofd-event-header">
                  <span className="ofd-event-reduction" style={{ color: exec.totalOriginalTokens > 0 ? '#58a6ff' : '#6e7681' }}>
                    {exec.totalOriginalTokens > 0
                      ? `-${Math.round((1 - exec.totalFilteredTokens / exec.totalOriginalTokens) * 100)}%`
                      : '0%'}
                  </span>
                  <span className="ofd-event-tokens" style={{ fontSize: 11 }}>
                    {exec.totalOriginalTokens} → {exec.totalFilteredTokens} tok
                  </span>
                  <span className="ofd-event-rules" style={{ color: exec.success ? '#7ee787' : '#f85149' }}>
                    {exec.success ? 'success' : 'failed'}
                  </span>
                </div>
                <div className="ofd-event-preview" style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b949e' }}>
                  <span>{timeStr(exec.startedAt)}</span>
                  <span>{fmt(exec.totalDuration)}</span>
                  <span>{exec.commandCount} cmd</span>
                </div>
                <div className="ofd-event-preview" style={{ fontSize: 11, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Execution #{i + 1}
                  {exec.prompt ? `: ${exec.prompt.slice(0, 80)}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ofd-detail">
          {selected ? (
            <div className="ofd-detail-header" style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 14, color: '#e6edf3' }}>
                Execution #{executionHistory.indexOf(selected) + 1}
              </h2>

              <div className="ofd-detail-meta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, marginBottom: 12 }}>
                <span>time: <strong>{timeStr(selected.startedAt)}</strong></span>
                <span>duration: <strong>{fmt(selected.totalDuration)}</strong></span>
                <span>status: <strong style={{ color: selected.success ? '#7ee787' : '#f85149' }}>{selected.success ? 'Success' : 'Failed'}</strong></span>
                <span>commands: <strong>{selected.commandCount}</strong></span>
                <span>tokens: <strong>{selected.totalOriginalTokens}</strong> → <strong>{selected.totalFilteredTokens}</strong></span>
              </div>

              {selected.prompt && (
                <div style={{ marginBottom: 12, padding: 8, background: '#161b22', borderRadius: 6, fontSize: 12 }}>
                  <div style={{ color: '#8b949e', marginBottom: 4 }}>Prompt</div>
                  <div style={{ color: '#e6edf3', whiteSpace: 'pre-wrap', fontFamily: 'var(--mono-font)' }}>{selected.prompt}</div>
                </div>
              )}

              <div style={{ fontWeight: 600, fontSize: 12, color: '#8b949e', marginBottom: 8, marginTop: 8 }}>Commands</div>
              {selected.commands.length === 0 && (
                <div style={{ fontSize: 12, color: '#8b949e', padding: 8 }}>No commands recorded for this execution.</div>
              )}
              {selected.commands.map((cmd, ci) => (
                <div key={ci} style={{ marginBottom: 8, border: '1px solid #30363d', borderRadius: 6, overflow: 'hidden' }}>
                  <div
                    style={{ padding: '6px 10px', background: '#161b22', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => setExpandedCmd(expandedCmd === ci ? null : ci)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#7ee787', fontSize: 13 }}>agntspce $</span>
                      <span style={{ color: '#e6edf3', fontSize: 13, fontFamily: 'var(--mono-font)' }}>
                        {cmd.command} {cmd.args.join(' ')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b949e' }}>
                      <span>{timeStr(cmd.timestamp)}</span>
                      <span>{fmt(cmd.duration)}</span>
                      <span>exit: {cmd.exitCode ?? '?'}</span>
                    </div>
                  </div>
                  {expandedCmd === ci && (
                    <div style={{ padding: '8px 10px', fontSize: 11 }}>
                      <div className="ofd-detail-meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span>tokens: <strong>{cmd.originalTokens}</strong> → <strong>{cmd.filteredTokens}</strong></span>
                        {cmd.reduction > 0 && <span>reduction: <strong style={{ color: '#58a6ff' }}>-{cmd.reduction}%</strong></span>}
                        <span>filter: <strong style={{ color: cmd.filterName ? '#7c3aed' : '#6e7681' }}>{cmd.filterName ? `agntspce:${cmd.filterName}` : 'passthrough'}</strong></span>
                      </div>
                      <div className="ofd-detail-panels" style={{ display: 'flex', gap: 8, minHeight: 100 }}>
                        <div className="ofd-panel" style={{ flex: 1 }}>
                          <div className="ofd-panel-label">
                            Filtered Output ({cmd.filteredTokens} tok)
                          </div>
                          <div className="ofd-panel-content" style={{ fontSize: 11, lineHeight: 1.5, textShadow: 'none' }}>
                            {cmd.filteredOutput ? cmd.filteredOutput.slice(0, 5000) : <span style={{ color: '#6e7681' }}>(empty output)</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #30363d' }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#8b949e', marginBottom: 6 }}>Execution Statistics</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                  <div>Started: <strong style={{ color: '#e6edf3' }}>{timeStr(selected.startedAt)}</strong></div>
                  <div>Finished: <strong style={{ color: '#e6edf3' }}>{selected.endedAt > 0 ? timeStr(selected.endedAt) : '—'}</strong></div>
                  <div>Duration: <strong style={{ color: '#e6edf3' }}>{fmt(selected.totalDuration)}</strong></div>
                  <div>Commands Executed: <strong style={{ color: '#e6edf3' }}>{selected.commandCount}</strong></div>
                  <div>Original Bytes: <strong style={{ color: '#e6edf3' }}>{selected.commands.reduce((s, c) => s + c.rawOutput.length, 0).toLocaleString()}</strong></div>
                  <div>Filtered Bytes: <strong style={{ color: '#e6edf3' }}>{selected.commands.reduce((s, c) => s + c.filteredOutput.length, 0).toLocaleString()}</strong></div>
                  <div>Original Tokens: <strong style={{ color: '#e6edf3' }}>{selected.totalOriginalTokens.toLocaleString()}</strong></div>
                  <div>Filtered Tokens: <strong style={{ color: '#e6edf3' }}>{selected.totalFilteredTokens.toLocaleString()}</strong></div>
                  <div>Tokens Saved: <strong style={{ color: '#58a6ff' }}>{(selected.totalOriginalTokens - selected.totalFilteredTokens).toLocaleString()}</strong></div>
                  <div>Reduction: <strong style={{ color: '#58a6ff' }}>{selected.totalOriginalTokens > 0 ? Math.round((1 - selected.totalFilteredTokens / selected.totalOriginalTokens) * 10000) / 100 : 0}%</strong></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="ofd-detail-empty">
              <div className="ofd-detail-empty-icon">🚀</div>
              <span>AgntSpce Token Reduction Engine</span>
              <span className="ofd-empty-hint" style={{ marginTop: 8 }}>
                {executionHistory.length > 0
                  ? `Session active — ${executionHistory.length} executions, ${totalCommands} commands, saving ${tokensSaved.toLocaleString()} tokens.`
                  : 'Waiting for agent executions to process...'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
