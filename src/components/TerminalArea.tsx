import type { Workspace, Panel } from '../App'
import TerminalPane from './TerminalPane'
import './TerminalArea.css'

type Props = {
  workspace: Workspace | null
  panels: Panel[]
  onAddPanel: () => void
  onRemovePanel: (id: string) => void
  onAddWorkspace: () => void
}

function getGridLayout(count: number): { style: React.CSSProperties; className: string } {
  if (count === 0) return { style: {}, className: '' }
  if (count === 1) return { style: { gridTemplateColumns: '1fr' }, className: '' }
  if (count === 2) return { style: { gridTemplateColumns: '1fr 1fr' }, className: '' }
  if (count === 3) return { style: {}, className: 'master-stack' }
  if (count === 4) return { style: { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }, className: '' }
  const cols = Math.ceil(Math.sqrt(count))
  return { style: { gridTemplateColumns: `repeat(${cols}, 1fr)` }, className: '' }
}

export default function TerminalArea({ workspace, panels, onAddPanel, onRemovePanel, onAddWorkspace }: Props) {
  if (!workspace) {
    return (
      <div className="terminal-area">
        <div className="terminal-area-empty">
          <div className="terminal-area-empty-inner">
            <h2>Welcome to AgntSpce</h2>
            <p>Select a workspace or add a folder to get started</p>
            <button className="btn btn-primary" onClick={onAddWorkspace}>
              + Add Workspace
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { style: gridStyle, className: gridClass } = getGridLayout(panels.length)

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
        <div className={`terminal-area-grid${gridClass ? ` ${gridClass}` : ''}`} style={gridStyle}>
          {panels.map((panel, i) => (
            <div
              key={panel.id}
              className="tile-wrapper"
              style={panels.length === 3 && i === 0 ? { gridRow: 'span 2' } : undefined}
            >
              <TerminalPane
                id={panel.id}
                workspaceName={workspace.name}
                workspacePath={workspace.path}
                onClose={() => onRemovePanel(panel.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
