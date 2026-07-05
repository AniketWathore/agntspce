import { useCallback } from 'react'
import type { FileTreeNode } from '../types'

interface FileTreeProps {
  nodes: FileTreeNode[]
  expandedFolders: Set<string>
  selectedFilePath: string | null
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, path: string, isDirectory: boolean) => void
  depth?: number
}

function FileIcon({ name }: { name: string }) {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : ''
  const iconMap: Record<string, string> = {
    tsx: 'react',
    ts: 'typescript',
    js: 'javascript',
    jsx: 'react',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    svg: 'image',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    ico: 'image',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    py: 'python',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    gitignore: 'git',
    env: 'env',
    lock: 'lock',
    sql: 'database',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
    astro: 'astro',
  }
  const icon = iconMap[ext ?? ''] || 'file'
  return <i className={`codicon codicon-${icon}`} style={{ fontSize: 14, flexShrink: 0 }} />
}

export function FileTree({
  nodes,
  expandedFolders,
  selectedFilePath,
  onToggleFolder,
  onSelectFile,
  onContextMenu,
  depth = 0,
}: FileTreeProps) {
  if (nodes.length === 0) {
    return <div className="file-tree-empty">Empty folder</div>
  }

  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          expandedFolders={expandedFolders}
          selectedFilePath={selectedFilePath}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onContextMenu={onContextMenu}
          depth={depth}
        />
      ))}
    </div>
  )
}

function TreeNode({
  node,
  expandedFolders,
  selectedFilePath,
  onToggleFolder,
  onSelectFile,
  onContextMenu,
  depth,
}: {
  node: FileTreeNode
  expandedFolders: Set<string>
  selectedFilePath: string | null
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, path: string, isDirectory: boolean) => void
  depth: number
}) {
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedFilePath === node.path

  const handleClick = useCallback(() => {
    if (isDirectory) {
      onToggleFolder(node.path)
    } else {
      onSelectFile(node.path)
    }
  }, [isDirectory, node.path, onToggleFolder, onSelectFile])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onContextMenu?.(e, node.path, isDirectory)
  }, [onContextMenu, node.path, isDirectory])

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={node.path}
      >
        {isDirectory ? (
          <i
            className={`codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`}
            style={{ fontSize: 12, flexShrink: 0, width: 16 }}
          />
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}
        {isDirectory ? (
          <i
            className={`codicon ${isExpanded ? 'codicon-folder-opened' : 'codicon-folder'}`}
            style={{ fontSize: 14, flexShrink: 0, marginRight: 4 }}
          />
        ) : (
          <FileIcon name={node.name} />
        )}
        <span className="file-tree-label">{node.name}</span>
      </div>
      {isDirectory && isExpanded && node.children && (
        <div className="file-tree-children">
          <FileTree
            nodes={node.children}
            expandedFolders={expandedFolders}
            selectedFilePath={selectedFilePath}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
            onContextMenu={onContextMenu}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  )
}
