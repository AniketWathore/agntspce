import type { Workspace, Panel } from '../App'
import TerminalPane from './TerminalPane'
import './TerminalArea.css'

type Props = {
  workspace: Workspace | null
  panels: Panel[]
  onAddPanel: () => void
  onRemovePanel: (id: string) => void
}

export default function TerminalArea({ workspace, panels, onAddPanel, onRemovePanel }: Props) {
  if (!workspace) {
    return (
      <div className="terminal-area">
        <div className="terminal-area-empty">
          <p>Select or create a workspace to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="terminal-area">
      <div className="terminal-area-header">
        <span className="terminal-area-title">{workspace.name}</span>
        <span className="terminal-area-path">{workspace.path}</span>
        <div className="terminal-area-spacer" />
        <button className="btn btn-primary btn-sm" onClick={onAddPanel}>
          + Add Panel
        </button>
      </div>
      {panels.length === 0 ? (
        <div className="terminal-area-empty">
          <p>No terminal panels. Click "Add Panel" to open one.</p>
        </div>
      ) : (
        <div className="terminal-area-grid">
          {panels.map(panel => (
            <TerminalPane
              key={panel.id}
              id={panel.id}
              workspaceName={workspace.name}
              workspacePath={workspace.path}
              onClose={() => onRemovePanel(panel.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
