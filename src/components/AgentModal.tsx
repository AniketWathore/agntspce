import { useState, useEffect } from 'react'
import type { AgentConfig, AgentStartConfig } from '../types'
import { getAgentColorImage } from '../agentImages'

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
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined)
  const [selectedReasoning, setSelectedReasoning] = useState<string | undefined>(undefined)
  const [selectedVerbosity, setSelectedVerbosity] = useState<string | undefined>(undefined)
  const [resumeId, setResumeId] = useState<string>('')
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const config = agentConfigs.find(a => a.id === selectedAgent)

  useEffect(() => {
    if (open && config) {
      setSelectedMode(config.defaultMode)
      setSelectedFlags(config.flags.filter(f => f.default).map(f => f.id))
      setSelectedModel(config.defaultModel ?? undefined)
      setSelectedReasoning(config.defaultReasoning ?? undefined)
      setSelectedVerbosity(config.defaultVerbosity ?? undefined)
      setResumeId('')
      setActivePreset(null)
    }
  }, [open, selectedAgent, agentConfigs])

  if (!open || !sessionId) return null

  function toggleFlag(flagId: string) {
    const flag = config?.flags.find(f => f.id === flagId)
    if (!flag) return
    const isExclusive = flag.category === 'sandbox' || flag.category === 'approvals'
    setSelectedFlags(prev => {
      if (isExclusive) {
        const withoutCategory = prev.filter(f => {
          const f2 = config?.flags.find(x => x.id === f)
          return f2?.category !== flag.category
        })
        if (prev.includes(flagId)) return withoutCategory
        return [...withoutCategory, flagId]
      }
      return prev.includes(flagId)
        ? prev.filter(f => f !== flagId)
        : [...prev, flagId]
    })
    setActivePreset(null)
  }

  function applyPreset(presetKey: string) {
    if (!config) return
    const defaultFlags = config.flags.filter(f => f.default).map(f => f.id)
    const powerfulFlags = config.flags.filter(f =>
      f.category === 'sandbox' || f.category === 'permissions'
    ).map(f => f.id)
    const readOnlyFlags = config.flags.filter(f =>
      f.category === 'sandbox' && (f.id === 'readOnly' || f.flag.includes('read-only'))
    ).map(f => f.id)

    switch (presetKey) {
      case 'default':
        setSelectedMode(config.defaultMode)
        setSelectedFlags(defaultFlags)
        setSelectedModel(config.defaultModel ?? undefined)
        setSelectedReasoning(config.defaultReasoning ?? undefined)
        setSelectedVerbosity(config.defaultVerbosity ?? undefined)
        break
      case 'powerful':
        setSelectedMode(config.defaultMode)
        setSelectedFlags(powerfulFlags.length > 0 ? powerfulFlags : defaultFlags)
        setSelectedModel(config.models?.[0] ?? undefined)
        setSelectedReasoning(config.reasoningLevels?.[config.reasoningLevels.length - 1] ?? undefined)
        setSelectedVerbosity(config.verbosityLevels?.[config.verbosityLevels.length - 1] ?? undefined)
        break
      case 'readOnly':
        setSelectedMode(config.defaultMode)
        setSelectedFlags(readOnlyFlags.length > 0 ? readOnlyFlags : [])
        break
    }
    setActivePreset(presetKey)
  }

  function handleStart() {
    if (!sessionId) return
    onStart(sessionId, {
      agentId: selectedAgent,
      mode: selectedMode,
      flags: selectedFlags,
      model: selectedModel,
      reasoning: selectedReasoning,
      verbosity: selectedVerbosity,
      resumeId: selectedMode === 'resume' ? resumeId || undefined : undefined,
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
                <img className="agent-icon" src={getAgentColorImage(agent.id)} alt={agent.name} />
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
                    onClick={() => { setSelectedMode(mode.id); setActivePreset(null) }}
                    title={mode.description}
                  >
                    {mode.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedMode === 'resume' && (
              <div className="resume-id-field">
                <label htmlFor="resume-id">Resume Session ID:</label>
                <input
                  id="resume-id"
                  type="text"
                  className="text-input"
                  placeholder="Enter session ID or leave blank for last session..."
                  value={resumeId}
                  onChange={e => setResumeId(e.target.value)}
                />
              </div>
            )}

            {config.models && config.models.length > 0 && (
              <div className="model-selector">
                <label htmlFor="model-select">Model:</label>
                <select
                  id="model-select"
                  className="select-input"
                  value={selectedModel ?? ''}
                  onChange={e => { setSelectedModel(e.target.value || undefined); setActivePreset(null) }}
                >
                  {config.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {config.reasoningLevels && config.reasoningLevels.length > 0 && (
              <div className="slider-control">
                <label>
                  Reasoning: <span className="slider-value">{selectedReasoning ?? config.defaultReasoning ?? 'medium'}</span>
                </label>
                <div className="slider-options">
                  {config.reasoningLevels.map(level => (
                    <button
                      key={level}
                      className={`slider-btn ${(selectedReasoning ?? config.defaultReasoning) === level ? 'active' : ''}`}
                      onClick={() => { setSelectedReasoning(level); setActivePreset(null) }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {config.verbosityLevels && config.verbosityLevels.length > 0 && (
              <div className="slider-control">
                <label>
                  Verbosity: <span className="slider-value">{selectedVerbosity ?? config.defaultVerbosity ?? 'medium'}</span>
                </label>
                <div className="slider-options">
                  {config.verbosityLevels.map(level => (
                    <button
                      key={level}
                      className={`slider-btn ${(selectedVerbosity ?? config.defaultVerbosity) === level ? 'active' : ''}`}
                      onClick={() => { setSelectedVerbosity(level); setActivePreset(null) }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {config.flags.length > 0 && (
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
            )}

            <div className="quick-presets">
              <div className="presets-label">Quick Presets</div>
              <div className="preset-buttons">
                <button
                  className={`preset-btn ${activePreset === 'default' ? 'active' : ''}`}
                  onClick={() => applyPreset('default')}
                  title="Default safe configuration with recommended settings"
                >
                  <span className="preset-btn-icon">🛡️</span>
                  <span className="preset-btn-label">Default</span>
                  {activePreset === 'default' && <span className="preset-btn-check">✓</span>}
                </button>
                <button
                  className={`preset-btn ${activePreset === 'powerful' ? 'active' : ''}`}
                  onClick={() => applyPreset('powerful')}
                  title="Maximum capabilities: all flags, best model, highest reasoning"
                >
                  <span className="preset-btn-icon">🚀</span>
                  <span className="preset-btn-label">Powerful</span>
                  {activePreset === 'powerful' && <span className="preset-btn-check">✓</span>}
                </button>
                <button
                  className={`preset-btn ${activePreset === 'readOnly' ? 'active' : ''}`}
                  onClick={() => applyPreset('readOnly')}
                  title="Read-only access, no file modifications"
                >
                  <span className="preset-btn-icon">👀</span>
                  <span className="preset-btn-label">Read Only</span>
                  {activePreset === 'readOnly' && <span className="preset-btn-check">✓</span>}
                </button>
              </div>
              {activePreset && (
                <div className="preset-summary">
                  {activePreset === 'default' && 'Safe configuration: default flags and model settings'}
                  {activePreset === 'powerful' && 'Max power: all permissions, highest model/reasoning/verbosity'}
                  {activePreset === 'readOnly' && 'Read only: no file writes, safe for review'}
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn-ok" onClick={handleStart}>Start</button>
        </div>
      </div>
    </div>
  )
}
