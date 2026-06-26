import { useState } from 'react'
import WorkspaceSidebar from './components/WorkspaceSidebar'
import TerminalArea from './components/TerminalArea'
import './App.css'

export type Workspace = {
  id: string
  name: string
  path: string
}

export type Panel = {
  id: string
  workspaceId: string
}

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [panels, setPanels] = useState<Panel[]>([])

  function addWorkspace(name: string, path: string) {
    const id = String(Date.now())
    const ws: Workspace = { id, name, path }
    setWorkspaces(prev => [...prev, ws])
    setActiveWorkspaceId(id)
  }

  function editWorkspace(id: string, name: string, path: string) {
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name, path } : w))
  }

  function removeWorkspace(id: string) {
    setWorkspaces(prev => prev.filter(w => w.id !== id))
    setPanels(prev => prev.filter(p => p.workspaceId !== id))
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(workspaces.length > 1 ? workspaces.find(w => w.id !== id)?.id ?? null : null)
    }
  }

  function addPanel() {
    if (!activeWorkspaceId) return
    const id = String(Date.now())
    setPanels(prev => [...prev, { id, workspaceId: activeWorkspaceId }])
  }

  function removePanel(id: string) {
    setPanels(prev => prev.filter(p => p.id !== id))
  }

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) ?? null
  const activePanels = panels.filter(p => p.workspaceId === activeWorkspaceId)

  return (
    <div className="app">
      <WorkspaceSidebar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={setActiveWorkspaceId}
        onAdd={addWorkspace}
        onEdit={editWorkspace}
        onRemove={removeWorkspace}
      />
      <TerminalArea
        workspace={activeWorkspace}
        panels={activePanels}
        onAddPanel={addPanel}
        onRemovePanel={removePanel}
      />
    </div>
  )
}

export default App
