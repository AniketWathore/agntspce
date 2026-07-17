import { useState, useEffect, useCallback } from 'react'
import type { FileTreeNode } from '../types'
import { FileTree } from './FileTree'

interface FileExplorerProps {
  workspacePath: string
  selectedFilePath: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
  getWorkspaceTree: (worktreePath: string) => Promise<any>
  createFile: (absolutePath: string) => Promise<any>
  createFolder: (absolutePath: string) => Promise<any>
  renameFile: (oldPath: string, newPath: string) => Promise<any>
  deleteFile: (absolutePath: string) => Promise<any>
}

export function FileExplorer({
  workspacePath,
  selectedFilePath,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  getWorkspaceTree,
  createFile,
  createFolder,
  renameFile,
  deleteFile,
}: FileExplorerProps) {
  const [treeData, setTreeData] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    targetPath: string
    isDirectory: boolean
  } | null>(null)

  const loadTree = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    setError(null)
    try {
      const res = await getWorkspaceTree(workspacePath)
      if (res?.ok) {
        setTreeData(res.tree)
      } else {
        setError(res?.error || 'Failed to load tree')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load tree')
    } finally {
      setLoading(false)
    }
  }, [workspacePath, getWorkspaceTree])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    if (contextMenu) {
      const handler = () => closeContextMenu()
      document.addEventListener('click', handler)
      return () => document.removeEventListener('click', handler)
    }
  }, [contextMenu, closeContextMenu])

  const handleRename = useCallback(() => {
    if (!contextMenu) return
    const oldName = contextMenu.targetPath.split('/').pop() || ''
    const newName = prompt('Rename to:', oldName)
    if (newName && newName !== oldName) {
      const parentPath = contextMenu.targetPath.slice(0, contextMenu.targetPath.lastIndexOf('/'))
      const newPath = parentPath ? `${parentPath}/${newName}` : newName
      const absOldPath = workspacePath.replace(/\\/g, '/') + '/' + contextMenu.targetPath
      const absNewPath = workspacePath.replace(/\\/g, '/') + '/' + newPath
      renameFile(absOldPath, absNewPath).then((res: any) => {
        if (res?.ok) loadTree()
      })
    }
    closeContextMenu()
  }, [contextMenu, workspacePath, renameFile, loadTree, closeContextMenu])

  const handleDelete = useCallback(() => {
    if (!contextMenu) return
    const name = contextMenu.targetPath.split('/').pop() || ''
    if (confirm(`Delete "${name}"?`)) {
      const absPath = workspacePath.replace(/\\/g, '/') + '/' + contextMenu.targetPath
      deleteFile(absPath).then((res: any) => {
        if (res?.ok) loadTree()
      })
    }
    closeContextMenu()
  }, [contextMenu, workspacePath, deleteFile, loadTree, closeContextMenu])

  const handleNewFile = useCallback(() => {
    const basePath = contextMenu
      ? workspacePath.replace(/\\/g, '/') + '/' + (contextMenu.isDirectory ? contextMenu.targetPath : contextMenu.targetPath.split('/').slice(0, -1).join('/'))
      : workspacePath.replace(/\\/g, '/')
    const name = prompt('File name:')
    if (name) {
      createFile(`${basePath}/${name}`).then((res: any) => {
        if (res?.ok) loadTree()
      })
    }
    closeContextMenu()
  }, [contextMenu, workspacePath, createFile, loadTree, closeContextMenu])

  const handleNewFolder = useCallback(() => {
    const basePath = contextMenu
      ? workspacePath.replace(/\\/g, '/') + '/' + (contextMenu.isDirectory ? contextMenu.targetPath : contextMenu.targetPath.split('/').slice(0, -1).join('/'))
      : workspacePath.replace(/\\/g, '/')
    const name = prompt('Folder name:')
    if (name) {
      createFolder(`${basePath}/${name}`).then((res: any) => {
        if (res?.ok) loadTree()
      })
    }
    closeContextMenu()
  }, [contextMenu, workspacePath, createFolder, loadTree, closeContextMenu])

  const handleTreeContextMenu = useCallback((e: React.MouseEvent, path: string, isDirectory: boolean) => {
    setContextMenu({ x: e.clientX, y: e.clientY, targetPath: path, isDirectory })
  }, [])

  return (
    <div className="file-explorer">
      {loading && <div className="file-tree-loading">Loading...</div>}
      {error && <div className="file-tree-error">{error}</div>}
      {!loading && !error && (
        <FileTree
          nodes={treeData}
          expandedFolders={expandedFolders}
          selectedFilePath={selectedFilePath}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onContextMenu={handleTreeContextMenu}
        />
      )}
      {contextMenu && (
        <div
          className="file-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="file-context-menu-item" onClick={handleNewFile}>
            <i className="codicon codicon-new-file" style={{ fontSize: 13, marginRight: 6 }} />
            New File
          </button>
          <button className="file-context-menu-item" onClick={handleNewFolder}>
            <i className="codicon codicon-new-folder" style={{ fontSize: 13, marginRight: 6 }} />
            New Folder
          </button>
          <div className="file-context-menu-separator" />
          <button className="file-context-menu-item" onClick={handleRename}>
            <i className="codicon codicon-edit" style={{ fontSize: 13, marginRight: 6 }} />
            Rename
          </button>
          <button className="file-context-menu-item" onClick={handleDelete}>
            <i className="codicon codicon-trash" style={{ fontSize: 13, marginRight: 6 }} />
            Delete
          </button>
          <div className="file-context-menu-separator" />
          <button className="file-context-menu-item" onClick={() => {
            if (contextMenu) {
              const absPath = workspacePath.replace(/\\/g, '/') + '/' + contextMenu.targetPath
              navigator.clipboard.writeText(absPath)
            }
            closeContextMenu()
          }}>
            <i className="codicon codicon-copy" style={{ fontSize: 13, marginRight: 6 }} />
            Copy Path
          </button>
        </div>
      )}
    </div>
  )
}
