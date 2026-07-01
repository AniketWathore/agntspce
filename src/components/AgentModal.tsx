import { useState, useEffect } from 'react'
import type { AgentConfig, AgentStartConfig } from '../types'

interface AgentModalProps {
  open: boolean
  sessionId: string | null
  agentConfigs: AgentConfig[]
  onStart: (sessionId: string, config: AgentStartConfig) => void
  onClose: () => void
}

export default function AgentModal({ open, sessionId, agentConfigs, onStart, onClose }: AgentModalProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('claude')
  const [selectedMode, setSelectedMode] = useState<string>('fresh')
  const [selectedFlags, setSelectedFlags] = useState<string[]>([])

  const config = agentConfigs.find(a => a.id === selectedAgent)

  useEffect(() => {
    if (open && config) {
      setSelectedMode(config.defaultMode)
      setSelectedFlags(config.flags.filter(f => f.default).map(f => f.id))
    }
  }, [open, selectedAgent, agentConfigs])

  if (!open || !sessionId) return null

  function toggleFlag(flagId: string) {
    const flag = config?.flags.find(f => f.id === flagId)
    if (!flag) return
    const isExclusive = flag.category === 'sandbox' || flag.category === 'approvals'
    if (isExclusive) {
      setSelectedFlags(prev => {
        const withoutCategory = prev.filter(f => {
          const f2 = config?.flags.find(x => x.id === f)
          return f2?.category !== flag.category
        })
        if (prev.includes(flagId)) return withoutCategory
        return [...withoutCategory, flagId]
      })
    } else {
      setSelectedFlags(prev =>
        prev.includes(flagId) ? prev.filter(f => f !== flagId) : [...prev, flagId]
      )
    }
  }

  function handleStart() {
    if (!sessionId) return
    onStart(sessionId, {
      agentId: selectedAgent,
      mode: selectedMode,
      flags: selectedFlags,
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal agent-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Start AI Agent</h3>
        <p className="modal-subtitle">Session: {sessionId}</p>

        <div className="agent-selector">
          <label>Select AI Agent:</label>
          <div className="agent-options">
            {agentConfigs.map(agent => (
              <label key={agent.id} className="agent-option">
                <input
                  type="radio"
                  name="agent-selection"
                  value={agent.id}
                  checked={selectedAgent === agent.id}
                  onChange={() => setSelectedAgent(agent.id)}
                />
                <span className="agent-icon">{agent.icon}</span>
                <div className="agent-info">
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-desc">{agent.description}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {config && (
          <>
            <div className="mode-selector">
              <label>Mode:</label>
              <div className="mode-buttons">
                {config.modes.map(mode => (
                  <button
                    key={mode.id}
                    className={`mode-btn ${selectedMode === mode.id ? 'active' : ''}`}
                    onClick={() => setSelectedMode(mode.id)}
                    title={mode.description}
                  >
                    {mode.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flag-configuration">
              {['permissions', 'sandbox', 'output', 'approvals'].map(category => {
                const catFlags = config.flags.filter(f => f.category === category)
                if (catFlags.length === 0) return null
                const isExclusive = category === 'sandbox' || category === 'approvals'
                return (
                  <div key={category} className="flag-category">
                    <label className="flag-category-label">
                      {category === 'permissions' ? 'Permissions' :
                       category === 'sandbox' ? 'Sandbox Mode' :
                       category === 'approvals' ? 'Approval Policy' :
                       'Output Options'}
                    </label>
                    <div className="flag-group">
                      {catFlags.map(flag => (
                        <label key={flag.id} className={`flag-item ${isExclusive ? 'flag-radio' : 'flag-checkbox'}`}>
                          <input
                            type={isExclusive ? 'radio' : 'checkbox'}
                            name={`flag-cat-${category}`}
                            checked={selectedFlags.includes(flag.id)}
                            onChange={() => toggleFlag(flag.id)}
                          />
                          <span>{flag.label}</span>
                          <span className="flag-desc">{flag.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="quick-presets">
              <button className="preset-btn" onClick={() => {
                setSelectedMode(config.defaultMode)
                setSelectedFlags(config.flags.filter(f => f.default).map(f => f.id))
              }}>
                🛡️ Default (Safe)
              </button>
              <button className="preset-btn" onClick={() => {
                setSelectedMode(config.defaultMode)
                setSelectedFlags(config.flags.filter(f => f.default).map(f => f.id))
              }}>
                🚀 Most Powerful
              </button>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-btn modal-btn-ok" onClick={handleStart}>Start</button>
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
