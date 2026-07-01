import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import type { SessionState, AgentConfig, AgentStartConfig } from '../types'
import TerminalPane from './TerminalPane'

export type LayoutPreset = 'auto' | '1x1' | '2x2' | '1+2' | '3x3'

interface Props {
  sessions: SessionState[]
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onStartAgent: (sessionId: string, config: AgentStartConfig) => void
  onShowAgentModal: (sessionId: string) => void
  onNewAgent: () => void
  onNewShell: () => void
  onCloseTab: (sessionId: string) => void
  onActiveSessionChange: (id: string | null) => void
  activeSessionId: string | null
  writeBuffers: Record<string, string>
  agentConfigs: AgentConfig[]
  layoutPreset: LayoutPreset
}

const AGENT_TYPES = [
  { id: 'claude', label: 'Claude Code', icon: '🤖' },
  { id: 'opencode', label: 'Opencode', icon: '🔧' },
  { id: 'codex', label: 'Codex', icon: '⚡' },
  { id: 'gemini', label: 'Gemini CLI', icon: '✨' },
]

function getTilingStyle(count: number, preset: LayoutPreset): CSSProperties {
  const base: CSSProperties = { display: 'grid', gap: 4, padding: '0 4px 4px', height: '100%' }
  switch (preset) {
    case '1x1':
      return { ...base, gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
    case '2x2':
      return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
    case '1+2':
      return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
    case '3x3':
      return { ...base, gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr' }
    case 'auto':
    default:
      if (count <= 1) return { ...base, gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
      if (count === 2) return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }
      if (count <= 4) return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
      const cols = Math.min(Math.ceil(Math.sqrt(count)), 4)
      const rows = Math.ceil(count / cols)
      return { ...base, gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }
  }
}

function getItemStyle(index: number, count: number, preset: LayoutPreset, activeIndex: number): CSSProperties {
  if (preset === '1x1') {
    if (index !== activeIndex) return { display: 'none' }
    return {}
  }
  if (preset === '1+2' && count > 1 && index === activeIndex) {
    return { gridRow: 'span 2' }
  }
  if (preset === 'auto' && count === 3 && index === 0) {
    return { gridRow: 'span 2' }
  }
  return {}
}

export default function TerminalArea({
  sessions, onInput, onResize, onRestart, onStartAgent,
  onShowAgentModal, onNewAgent, onNewShell, onCloseTab, onActiveSessionChange,
  activeSessionId, writeBuffers, agentConfigs,
  layoutPreset,
}: Props) {
  const [activeGroupTab, setActiveGroupTab] = useState<string>('all')

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) {
      counts[s.type] = (counts[s.type] || 0) + 1
    }
    return counts
  }, [sessions])

  const filteredSessions = useMemo(() => {
    if (activeGroupTab === 'all') return sessions
    return sessions.filter(s => s.type === activeGroupTab)
  }, [sessions, activeGroupTab])

  useEffect(() => {
    if (activeGroupTab !== 'all' && activeSessionId) {
      const session = sessions.find(s => s.id === activeSessionId)
      if (session && session.type !== activeGroupTab) {
        const firstInGroup = filteredSessions[0]
        if (firstInGroup) onActiveSessionChange(firstInGroup.id)
      }
    }
  }, [activeGroupTab])

  useEffect(() => {
    if (!activeSessionId || filteredSessions.some(s => s.id === activeSessionId)) return
    const session = sessions.find(s => s.id === activeSessionId)
    if (session) setActiveGroupTab('all')
  }, [activeSessionId])

  if (sessions.length === 0) {
    return (
      <div className="terminal-area-empty">
        <div className="empty-state">
          <p>No agent terminals</p>
          <p className="empty-hint">Add an AI coding agent or open a shell</p>
          <div className="empty-actions">
            <button className="new-terminal-btn" onClick={onNewAgent}>+ Agent</button>
            <button className="shell-btn" onClick={onNewShell}>&gt;_ Shell</button>
          </div>
        </div>
      </div>
    )
  }

  const groupTabs = [
    { id: 'all', label: 'All', icon: '⊞', count: sessions.length },
    ...AGENT_TYPES
      .filter(t => typeCounts[t.id] > 0)
      .map(t => ({ id: t.id, label: t.label, icon: t.icon, count: typeCounts[t.id] })),
  ]

  function handleShellBtn() {
    onNewShell()
  }

  const activeIdx = activeSessionId
    ? filteredSessions.findIndex(s => s.id === activeSessionId)
    : 0
  const tilingStyle = getTilingStyle(filteredSessions.length, layoutPreset)

  return (
    <div className="terminal-area-wrapper">
      <div className="tab-bar">
        <div className="tab-bar-tabs">
          {groupTabs.map(tab => {
            const isActive = tab.id === activeGroupTab
            return (
              <div
                key={tab.id}
                className={`tab-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveGroupTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
                <span className="tab-count">{tab.count}</span>
              </div>
            )
          })}
        </div>
        <div className="tab-bar-actions">
          <button className="new-terminal-btn" onClick={onNewAgent}>+ Agent</button>
          <button className="shell-btn" onClick={handleShellBtn}>&gt;_ Shell</button>
        </div>
      </div>
      <div className="terminal-area" style={tilingStyle}>
        {filteredSessions.map((session, i) => (
          <TerminalPane
            key={session.id}
            session={session}
            onInput={onInput}
            onResize={onResize}
            onRestart={onRestart}
            onStartAgent={onStartAgent}
            onShowAgentModal={onShowAgentModal}
            writeData={writeBuffers[session.id] || ''}
            agentConfigs={agentConfigs}
            style={getItemStyle(i, filteredSessions.length, layoutPreset, activeIdx)}
            onClose={onCloseTab}
          />
        ))}
      </div>
    </div>
  )
}
