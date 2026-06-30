import type { CSSProperties } from 'react'
import type { SessionState, AgentConfig, AgentStartConfig } from '../types'
import TerminalPane from './TerminalPane'

interface Props {
  sessions: SessionState[]
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onStartAgent: (sessionId: string, config: AgentStartConfig) => void
  onShowAgentModal: (sessionId: string) => void
  onNewAgent: () => void
  writeBuffers: Record<string, string>
  agentConfigs: AgentConfig[]
}

function getTilingStyle(count: number): CSSProperties {
  const base: CSSProperties = { display: 'grid', gap: 4, padding: 4, height: '100%' }
  if (count === 0) return base
  if (count === 1) return { ...base, gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
  if (count === 2) return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }
  if (count === 3) return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
  if (count === 4) return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
  const cols = Math.min(Math.ceil(Math.sqrt(count)), 4)
  const rows = Math.ceil(count / cols)
  return { ...base, gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }
}

function getItemStyle(index: number, count: number): CSSProperties {
  if (count === 3 && index === 0) return { gridRow: 'span 2' }
  return {}
}

export default function TerminalArea({ sessions, onInput, onResize, onRestart, onStartAgent, onShowAgentModal, onNewAgent, writeBuffers, agentConfigs }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="terminal-area-empty">
        <div className="empty-state">
          <p>No agent terminals</p>
          <p className="empty-hint">Click + Agent to add an AI coding agent</p>
          <div className="empty-actions">
            <button className="new-terminal-btn" onClick={onNewAgent}>+ Agent</button>
          </div>
        </div>
      </div>
    )
  }

  const tilingStyle = getTilingStyle(sessions.length)

  return (
    <div className="terminal-area" style={tilingStyle}>
      {sessions.map((session, i) => (
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
          style={getItemStyle(i, sessions.length)}
        />
      ))}
    </div>
  )
}
