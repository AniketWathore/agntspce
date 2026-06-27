import { useState, useEffect, useRef } from 'react'

type Props = {
  defaultName: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export default function NamePrompt({ defaultName, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && value.trim()) {
      onConfirm(value.trim())
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="name-prompt-overlay" onClick={onCancel}>
      <div className="name-prompt" onClick={e => e.stopPropagation()}>
        <label className="name-prompt-label">Workspace name</label>
        <input
          ref={inputRef}
          className="name-prompt-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="name-prompt-actions">
          <button className="btn btn-primary btn-sm" onClick={() => value.trim() && onConfirm(value.trim())}>
            OK
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
