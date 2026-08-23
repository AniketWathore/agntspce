import { useEffect, useRef } from 'react'
import { getAgentColorImage } from '../agentImages'

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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  return (
    <div className="agent-dropdown" ref={ref} onClick={e => e.stopPropagation()}>
      {agents.map(a => (
        <div
          key={a.id}
          className="agent-dropdown-item"
          onClick={() => onSelect(a.id)}
          title={a.name}
        >
          <img className="agent-dropdown-color" src={getAgentColorImage(a.id)} alt={a.name} />
          <span className="agent-dropdown-name">{a.name}</span>
        </div>
      ))}
    </div>
  )
}
