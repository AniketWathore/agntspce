import { useState } from 'react'
import type { AgentConfig } from '../types'

interface ParallelTaskModalProps {
  open: boolean
  agentConfigs: AgentConfig[]
  onClose: () => void
  onLaunch: (config: {
    agentId: string
    mode: string
    flags: string[]
    prompt: string
    worktreeCount: number
    model?: string
  }) => Promise<void>
}

export default function ParallelTaskModal({ open, agentConfigs, onClose, onLaunch }: ParallelTaskModalProps) {
  const [prompt, setPrompt] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('claude')
  const [worktreeCount, setWorktreeCount] = useState(2)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const config = agentConfigs.find(a => a.id === selectedAgent)

  async function handleLaunch() {
    if (!prompt.trim()) return
    setLaunching(true)
    setError('')
    try {
      await onLaunch({
        agentId: selectedAgent,
        mode: 'fresh',
        flags: config?.flags.filter(f => f.default).map(f => f.id) || [],
        prompt: prompt.trim(),
        worktreeCount,
      })
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Failed to launch')
    }
    setLaunching(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal parallel-task-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Parallel Agent Task</h3>
        <p className="modal-subtitle">Run the same prompt across multiple worktrees simultaneously</p>

        <div className="parallel-field">
          <label>Prompt / Task:</label>
          <textarea
            className="config-textarea parallel-prompt-input"
            rows={5}
            placeholder="Refactor this project to use TypeScript strict mode..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
        </div>

        <div className="parallel-row">
          <div className="parallel-field parallel-field-half">
            <label>Agent:</label>
            <select
              className="select-input"
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
            >
              {agentConfigs.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="parallel-field parallel-field-half">
            <label>Worktrees:</label>
            <input
              type="number"
              className="text-input"
              min={1}
              max={8}
              value={worktreeCount}
              onChange={e => setWorktreeCount(parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn modal-btn-ok"
            onClick={handleLaunch}
            disabled={launching || !prompt.trim()}
          >
            {launching ? 'Launching...' : `Launch ${worktreeCount} Agents`}
          </button>
        </div>
      </div>
    </div>
  )
}
