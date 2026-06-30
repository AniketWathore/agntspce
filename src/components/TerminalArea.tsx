import type { SessionState, AgentConfig, AgentStartConfig } from '../types'
import TerminalPane from './TerminalPane'

interface Props {
  sessions: SessionState[]
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onStartAgent: (sessionId: string, config: AgentStartConfig) => void
  onShowAgentModal: (sessionId: string) => void
  onNewTerminal: (type?: string) => void
  writeBuffers: Record<string, string>
  agentConfigs: AgentConfig[]
}

export default function TerminalArea({ sessions, onInput, onResize, onRestart, onStartAgent, onShowAgentModal, onNewTerminal, writeBuffers, agentConfigs }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="terminal-area">
        <div className="empty-state">
          <p>No terminals active</p>
          <p className="empty-hint">Click a button below to start a terminal</p>
          <div className="empty-actions">
            <button className="new-terminal-btn" onClick={() => onNewTerminal('claude')}>+ Agent</button>
            <button className="new-terminal-btn secondary" onClick={() => onNewTerminal('shell')}>+ Shell</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="terminal-area">
      {sessions.map(session => (
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
        />
      ))}
    </div>
  )
}
