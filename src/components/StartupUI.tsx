import { useState } from 'react'
import type { AgentConfig, AgentStartConfig } from '../types'
import { getAgentColorImage } from '../agentImages'

interface StartupUIProps {
  sessionId: string
  agentConfigs: AgentConfig[]
  onStart: (sessionId: string, config: AgentStartConfig) => void
  onAdvanced: () => void
  onDismiss: () => void
}

export default function StartupUI({ sessionId, agentConfigs, onStart, onAdvanced, onDismiss }: StartupUIProps) {
  const [selectedAgent, setSelectedAgent] = useState('claude')

  const config = agentConfigs.find(a => a.id === selectedAgent)
  const defaultFlags = config?.flags.filter(f => f.default).map(f => f.id) || []

  function handleMode(mode: string) {
    onStart(sessionId, {
      agentId: selectedAgent,
      mode,
      flags: defaultFlags,
    })
  }

  if (agentConfigs.length === 0) return null

  return (
    <div className="startup-ui">
      <div className="startup-header">
        <span className="startup-title">Start AI Agent</span>
        <button className="startup-dismiss" onClick={onDismiss} title="Dismiss">✕</button>
      </div>
      <div className="startup-body">
        <div className="startup-agent-row">
          <img className="startup-agent-img" src={getAgentColorImage(selectedAgent)} alt={selectedAgent} />
          <select
            className="startup-agent-select"
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
          >
            {agentConfigs.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="startup-modes">
          <button className="startup-mode-btn" onClick={() => handleMode('fresh')}>Fresh</button>
          <button className="startup-mode-btn" onClick={() => handleMode('continue')}>Continue</button>
          <button className="startup-mode-btn" onClick={() => handleMode('resume')}>Resume</button>
        </div>
        <button className="startup-advanced" onClick={onAdvanced}>Advanced</button>
      </div>
    </div>
  )
}
