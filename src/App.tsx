import { useState, useEffect, useRef, useCallback } from 'react'
import WorkspaceSidebar from './components/WorkspaceSidebar'
import TerminalArea from './components/TerminalArea'
import NamePrompt from './components/NamePrompt'
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

function getNextDefaultName(workspaces: Workspace[]): string {
  const count = workspaces.filter(w => w.name.startsWith('Workspace')).length + 1
  return `Workspace${count}`
}

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [panels, setPanels] = useState<Panel[]>([])
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFolder, setPendingFolder] = useState<string | null>(null)
  const resizing = useRef(false)
  const dragCounter = useRef(0)
  const workspacesRef = useRef(workspaces)
  workspacesRef.current = workspaces

  const addWorkspace = useCallback((name: string, path: string) => {
    console.log('[app] addWorkspace:', name, path)
    const current = workspacesRef.current
    const existing = current.find(w => w.path === path)
    if (existing) {
      setActiveWorkspaceId(existing.id)
      return
    }
    const id = String(Date.now())
    setWorkspaces(prev => [...prev, { id, name, path }])
    setActiveWorkspaceId(id)
  }, [])

  const editWorkspace = useCallback((id: string, name: string, path: string) => {
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name, path } : w))
  }, [])

  const removeWorkspace = useCallback((id: string) => {
    setWorkspaces(prev => {
      const next = prev.filter(w => w.id !== id)
      setPanels(prevPanels => prevPanels.filter(p => p.workspaceId !== id))
      setActiveWorkspaceId(prevId => prevId === id ? (next.length > 0 ? next[0].id : null) : prevId)
      return next
    })
  }, [])

  const addPanel = useCallback(() => {
    if (!activeWorkspaceId) return
    const id = String(Date.now())
    setPanels(prev => [...prev, { id, workspaceId: activeWorkspaceId }])
  }, [activeWorkspaceId])

  const removePanel = useCallback((id: string) => {
    setPanels(prev => prev.filter(p => p.id !== id))
  }, [])

  const onNameConfirm = useCallback((name: string) => {
    const folder = pendingFolder
    setPendingFolder(null)
    if (folder) addWorkspace(name, folder)
  }, [pendingFolder, addWorkspace])

  const onNameCancel = useCallback(() => {
    setPendingFolder(null)
  }, [])

  const promptForName = useCallback((folderPath: string) => {
    console.log('[app] promptForName:', folderPath)
    setPendingFolder(folderPath)
  }, [])

  const handleAddWorkspace = useCallback(async () => {
    console.log('[app] handleAddWorkspace, electronAPI:', window.electronAPI)
    const api = window.electronAPI
    if (api?.selectDirectory) {
      const folder = await api.selectDirectory()
      console.log('[app] selectDirectory returned:', folder)
      if (folder) promptForName(folder)
      return
    }
    const p = prompt('Enter workspace path:')
    if (p?.trim()) promptForName(p.trim())
  }, [promptForName])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragging(false)

    console.log('[app] drop event, electronAPI:', window.electronAPI)
    const api = window.electronAPI
    if (api?.getDropPath) {
      const folder = await api.getDropPath()
      console.log('[app] getDropPath returned:', folder)
      if (folder) promptForName(folder)
    }
  }, [promptForName])

  function handleResizeDown(e: React.MouseEvent) {
    e.preventDefault()
    resizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!resizing.current) return
      setSidebarWidth(Math.max(180, Math.min(window.innerWidth * 0.2, e.clientX)))
    }
    function handleMouseUp() {
      if (resizing.current) {
        resizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const actionsRef = useRef({ handleAddWorkspace, promptForName })
  actionsRef.current = { handleAddWorkspace, promptForName }

  useEffect(() => {
    window.electronAPI?.onMenuAction?.(action => {
      const { handleAddWorkspace, promptForName } = actionsRef.current
      switch (action) {
        case 'open-folder':
          handleAddWorkspace()
          break
        case 'new-workspace':
          promptForName('')
          break
        case 'save-workspace':
          console.log('[app] save-workspace — not yet implemented')
          break
        case 'load-workspace':
          console.log('[app] load-workspace — not yet implemented')
          break
      }
    })
  }, [])

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) ?? null
  const activePanels = panels.filter(p => p.workspaceId === activeWorkspaceId)

  return (
    <div
      className={`app${isDragging ? ' drag-over' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <WorkspaceSidebar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={setActiveWorkspaceId}
        onEdit={editWorkspace}
        onRemove={removeWorkspace}
      />
      <div className="resize-handle" onMouseDown={handleResizeDown} />
      <TerminalArea
        workspace={activeWorkspace}
        panels={activePanels}
        onAddPanel={addPanel}
        onRemovePanel={removePanel}
        onAddWorkspace={handleAddWorkspace}
      />
      {pendingFolder && (
        <NamePrompt
          defaultName={getNextDefaultName(workspaces)}
          onConfirm={onNameConfirm}
          onCancel={onNameCancel}
        />
      )}
    </div>
  )
}

export default App
