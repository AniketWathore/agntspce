import { useEffect, useRef } from 'react'

interface AgentItem {
  id: string
  name: string
  icon: string
}

interface Props {
  agents: AgentItem[]
  onSelect: (id: string) => void
  onClose: () => void
}

export default function AgentPicker({ agents, onSelect, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="agent-picker-overlay" ref={overlayRef} onClick={onClose}>
      <div className="agent-picker" onClick={e => e.stopPropagation()}>
        {agents.map(a => (
          <div key={a.id} className="agent-picker-item" onClick={() => onSelect(a.id)}>
            <span className="agent-picker-icon">{a.icon}</span>
            <span className="agent-picker-name">{a.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}