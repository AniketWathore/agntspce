interface Props {
  onNewAgent: () => void
  onToggleShellSidebar: () => void
  shellCount: number
}

export default function Header({ onNewAgent, onToggleShellSidebar, shellCount }: Props) {
  return (
    <header className="app-header">
      <div className="header-left" />
      <div className="header-right">
        <button className="new-terminal-btn" onClick={onNewAgent}>+ Agent</button>
        <button className={`shell-toggle-btn${shellCount > 0 ? ' has-shells' : ''}`} onClick={onToggleShellSidebar} title="Toggle shell terminals">
          &gt;_ {shellCount > 0 && <span className="shell-count">{shellCount}</span>}
        </button>
      </div>
    </header>
  )
}
