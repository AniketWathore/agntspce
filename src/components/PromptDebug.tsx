import { useState, useEffect, useRef, useCallback } from 'react'
import type { CompressionEvent, CompressionDebugRecord, CompressionStats } from '../types'

interface Props {
  compressionStats: CompressionStats
  compressionHistory: CompressionDebugRecord[]
  onCompressionEvent: (cb: (data: CompressionEvent) => void) => () => void
  requestCompressionStats: () => void
}

export default function PromptDebug({ compressionStats, compressionHistory, onCompressionEvent, requestCompressionStats }: Props) {
  const [selected, setSelected] = useState<CompressionDebugRecord | null>(null)
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [liveEvents, setLiveEvents] = useState<CompressionEvent[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestCompressionStats()
  }, [])

  useEffect(() => {
    const unsub = onCompressionEvent((event) => {
      setLiveEvents(prev => [event, ...prev].slice(0, 200))
    })
    return unsub
  }, [onCompressionEvent])

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [liveEvents, autoScroll])

  const filtered = filter
    ? compressionHistory.filter(r =>
        r.original.toLowerCase().includes(filter.toLowerCase()) ||
        r.compressed.toLowerCase().includes(filter.toLowerCase())
      )
    : compressionHistory

  const tokensSaved = compressionStats.totalOriginalTokens - compressionStats.totalCompressedTokens
  const charsSaved = compressionStats.totalOriginalChars - compressionStats.totalCompressedChars
  const pctReduction = compressionStats.totalOriginalTokens > 0
    ? Math.round((tokensSaved / compressionStats.totalOriginalTokens) * 100 * 10) / 10
    : 0

  const handleClear = useCallback(() => {
    setLiveEvents([])
    setSelected(null)
  }, [])

  const currentEvents = liveEvents.length > 0 ? liveEvents.map(e => e.debug) : filtered

  return (
    <div className="prompt-debug">
      <div className="prompt-debug-header">
        <div className="prompt-debug-header-left">
          <h1>Prompt Optimizer Debug</h1>
          <span className="prompt-debug-badge">live</span>
        </div>
        <div className="prompt-debug-header-stats">
          <span className="prompt-debug-stat">
            <strong>{compressionStats.linesCompressed}</strong> lines
          </span>
          <span className="prompt-debug-stat">
            <strong>{tokensSaved.toLocaleString()}</strong> tokens saved
          </span>
          <span className="prompt-debug-stat">
            <strong>{charsSaved.toLocaleString()}</strong> chars saved
          </span>
          <span className="prompt-debug-stat">
            <strong>{pctReduction}%</strong> reduction
          </span>
        </div>
      </div>

      <div className="prompt-debug-body">
        <div className="prompt-debug-sidebar">
          <div className="prompt-debug-sidebar-header">
            <div className="prompt-debug-sidebar-controls">
              <div className="prompt-debug-filter-wrap">
                <input
                  className="prompt-debug-filter"
                  type="text"
                  placeholder="Filter events..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
                {filter && (
                  <button className="prompt-debug-filter-clear" onClick={() => setFilter('')}>✕</button>
                )}
              </div>
              <label className="prompt-debug-autoscroll">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={e => setAutoScroll(e.target.checked)}
                />
                <span>Auto-scroll</span>
              </label>
            </div>
            <button className="prompt-debug-clear-btn" onClick={handleClear}>Clear</button>
          </div>
          <div className="prompt-debug-list" ref={listRef}>
            {currentEvents.length === 0 ? (
              <div className="prompt-debug-empty">
                No compression events yet.
                <span className="prompt-debug-empty-hint">Type in a terminal with token reduction enabled to see results.</span>
              </div>
            ) : (
              currentEvents.map((record, i) => {
                const originalW = record.original.split(' ').length
                const compressedW = record.compressed.split(' ').length
                const removedCount = record.details ? record.details.filter(d => !d.kept).length : 0
                return (
                  <div
                    key={`${record.original}-${i}`}
                    className={`prompt-debug-event ${selected === record ? 'selected' : ''}`}
                    onClick={() => setSelected(record)}
                  >
                    <div className="prompt-debug-event-header">
                      <span className="prompt-debug-event-reduction">{record.reduction}%</span>
                      <span className="prompt-debug-event-words">{originalW} → {compressedW} words</span>
                      {removedCount > 0 && (
                        <span className="prompt-debug-event-removed">-{removedCount}</span>
                      )}
                    </div>
                    <div className="prompt-debug-event-preview">
                      {record.original.length > 80
                        ? record.original.slice(0, 80) + '...'
                        : record.original}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="prompt-debug-detail">
          {selected ? (
            <>
              <div className="prompt-debug-detail-header">
                <h2>Compression Detail</h2>
                <div className="prompt-debug-detail-meta">
                  <span>Tokens: <strong>{selected.originalTokens} → {selected.compressedTokens}</strong></span>
                  <span>Chars: <strong>{selected.originalChars} → {selected.compressedChars}</strong></span>
                  <span>Reduction: <strong>{selected.reduction}%</strong></span>
                </div>
              </div>

              <div className="prompt-debug-detail-panels">
                <div className="prompt-debug-panel">
                  <div className="prompt-debug-panel-label">
                    <span>Original</span>
                    <span className="prompt-debug-panel-count">{selected.originalTokens} tokens</span>
                  </div>
                  <div className="prompt-debug-panel-content">
                    {selected.details ? (
                      selected.details.map((d, i) => (
                        <span
                          key={i}
                          className={d.kept ? 'pd-word-kept' : 'pd-word-removed'}
                          title={d.kept ? undefined : d.reason}
                        >
                          {d.word}{' '}
                        </span>
                      ))
                    ) : (
                      selected.original
                    )}
                  </div>
                </div>

                <div className="prompt-debug-panel">
                  <div className="prompt-debug-panel-label">
                    <span>Compressed</span>
                    <span className="prompt-debug-panel-count">{selected.compressedTokens} tokens</span>
                  </div>
                  <div className="prompt-debug-panel-content">
                    {selected.compressed}
                  </div>
                </div>
              </div>

              {selected.details && selected.details.filter(d => !d.kept).length > 0 && (
                <div className="prompt-debug-removed-list">
                  <div className="prompt-debug-removed-list-label">Removed Words</div>
                  <div className="prompt-debug-removed-tags">
                    {selected.details.filter(d => !d.kept).map((d, i) => (
                      <span key={i} className="prompt-debug-removed-tag" title={d.reason}>
                        "{d.word}" <span className="pd-removed-reason">{d.reason}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="prompt-debug-detail-empty">
              <div className="prompt-debug-detail-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span>Select a compression event to inspect</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
