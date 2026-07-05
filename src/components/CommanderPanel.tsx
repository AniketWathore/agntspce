import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

interface Command {
  id: string
  category: string
  label: string
  description: string
  shortcut?: string
  action: () => void
}

interface Props {
  commands: Command[]
  onClose: () => void
}

export default function CommanderPanel({ commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return commands
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    )
  }, [commands, query])

  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {}
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = []
      groups[cmd.category].push(cmd)
    }
    return groups
  }, [filtered])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  const execute = useCallback((cmd: Command) => {
    cmd.action()
    onClose()
  }, [onClose])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filtered[activeIdx]
        if (cmd) execute(cmd)
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filtered, activeIdx, execute, onClose])

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  let flatIdx = 0

  return (
    <div className="commander-overlay" onClick={onClose}>
      <div className="commander-panel" onClick={e => e.stopPropagation()}>
        <div className="commander-input-wrap">
          <span className="commander-prefix">&gt;</span>
          <input
            ref={inputRef}
            className="commander-input"
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="commander-results" ref={listRef}>
          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category} className="commander-group">
              <div className="commander-group-title">{category}</div>
              {cmds.map(cmd => {
                const idx = flatIdx++
                return (
                  <div
                    key={cmd.id}
                    className={`commander-item ${idx === activeIdx ? 'active' : ''}`}
                    onClick={() => execute(cmd)}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    <div className="commander-item-left">
                      <span className="commander-item-label">{cmd.label}</span>
                      {cmd.shortcut && <span className="commander-item-shortcut">{cmd.shortcut}</span>}
                    </div>
                    <span className="commander-item-desc">{cmd.description}</span>
                  </div>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="commander-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  )
}
