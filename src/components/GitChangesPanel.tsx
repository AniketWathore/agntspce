import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import DiffViewer from './DiffViewer'

interface FileStatus {
  filePath: string
  stagedStatus: string
  workingStatus: string
  status: 'M' | 'A' | 'D' | 'R' | 'U' | 'C'
  additions: number
  deletions: number
  staged: boolean
}

interface FullStatus {
  branch: string
  ahead: number
  behind: number
  files: FileStatus[]
  clean: boolean
  total: number
}

interface Props {
  worktreePath: string
  onClose: () => void
  getGitFullStatus: (path: string) => Promise<FullStatus | null>
  getGitFileDiff: (path: string, filePath: string, base?: string, head?: string) => Promise<string | null>
  gitRevertFile: (path: string, filePath: string) => Promise<boolean>
  gitStageFile: (path: string, filePath: string) => Promise<boolean>
  gitUnstageFile: (path: string, filePath: string) => Promise<boolean>
  gitStageAll: (path: string) => Promise<boolean>
  gitUnstageAll: (path: string) => Promise<boolean>
  gitCommit: (path: string, message: string) => Promise<any>
  gitPull: (path: string) => Promise<any>
  gitPush: (path: string) => Promise<any>
  gitFetch: (path: string) => Promise<any>
  gitDiscardAll: (path: string) => Promise<boolean>
}

type StatusFilter = 'all' | 'staged' | 'unstaged'

export default function GitChangesPanel({
  worktreePath, onClose,
  getGitFullStatus, getGitFileDiff,
  gitRevertFile, gitStageFile, gitUnstageFile,
  gitStageAll, gitUnstageAll, gitCommit,
  gitPull, gitPush, gitFetch, gitDiscardAll,
}: Props) {
  const [status, setStatus] = useState<FullStatus | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [fileDiffLoading, setFileDiffLoading] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [contextMenuFile, setContextMenuFile] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadStatus = useCallback(async () => {
    if (!worktreePath) return
    const s = await getGitFullStatus(worktreePath)
    setStatus(s)
  }, [worktreePath, getGitFullStatus])

  useEffect(() => {
    loadStatus()
    pollTimer.current = setInterval(loadStatus, 3000)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [loadStatus])

  useEffect(() => {
    setSelectedFile(null)
    setFileDiff(null)
    setCommitResult(null)
  }, [worktreePath])

  useEffect(() => {
    if (!selectedFile || !worktreePath) {
      setFileDiff(null)
      return
    }
    setFileDiffLoading(true)
    const load = async () => {
      const file = filteredFiles.find(f => f.filePath === selectedFile)
      let diff: string | null = null
      if (file?.status === 'U') {
        diff = await getGitFileDiff(worktreePath, selectedFile, 'EMPTY')
      } else {
        diff = await getGitFileDiff(worktreePath, selectedFile)
      }
      setFileDiff(diff)
      setFileDiffLoading(false)
    }
    load()
  }, [selectedFile, worktreePath, getGitFileDiff])

  const filteredFiles: FileStatus[] = useMemo(() => {
    if (!status) return []
    let files = status.files
    if (statusFilter === 'staged') files = files.filter(f => f.staged)
    else if (statusFilter === 'unstaged') files = files.filter(f => !f.staged)
    return files
  }, [status, statusFilter])

  const visibleFiles = filteredFiles

  const totalAdds = visibleFiles.reduce((s, f) => s + f.additions, 0)
  const totalDels = visibleFiles.reduce((s, f) => s + f.deletions, 0)

  const groupedFiles = useCallback((files: FileStatus[]) => {
    const groups: Record<string, FileStatus[]> = {}
    for (const f of files) {
      const parts = f.filePath.split('/')
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/'
      if (!groups[dir]) groups[dir] = []
      groups[dir].push(f)
    }
    return groups
  }, [])

  const statusIcon = (st: string) => {
    switch (st) {
      case 'A': return <span className="scm-status-added">A</span>
      case 'D': return <span className="scm-status-deleted">D</span>
      case 'U': return <span className="scm-status-untracked">U</span>
      case 'R': return <span className="scm-status-modified">R</span>
      case 'C': return <span className="scm-status-added">C</span>
      default: return <span className="scm-status-modified">M</span>
    }
  }

  const handleStage = async (filePath: string) => {
    setActionLoading('stage-' + filePath)
    await gitStageFile(worktreePath, filePath)
    setActionLoading(null)
    setContextMenuFile(null)
    loadStatus()
  }

  const handleUnstage = async (filePath: string) => {
    setActionLoading('unstage-' + filePath)
    await gitUnstageFile(worktreePath, filePath)
    setActionLoading(null)
    setContextMenuFile(null)
    loadStatus()
  }

  const handleRevert = async (filePath: string) => {
    if (!confirm(`Are you sure you want to discard the changes in "${filePath.split('/').pop()}"? This action cannot be undone.`)) return
    setActionLoading('revert-' + filePath)
    await gitRevertFile(worktreePath, filePath)
    setActionLoading(null)
    setContextMenuFile(null)
    loadStatus()
    setFileDiff(null)
    setSelectedFile(null)
  }

  const handleStageAll = async () => {
    setActionLoading('stage-all')
    await gitStageAll(worktreePath)
    setActionLoading(null)
    loadStatus()
  }

  const handleUnstageAll = async () => {
    setActionLoading('unstage-all')
    await gitUnstageAll(worktreePath)
    setActionLoading(null)
    loadStatus()
  }

  const handleDiscardAll = async () => {
    if (!confirm('Are you sure you want to discard ALL changes? This action cannot be undone.')) return
    setActionLoading('discard-all')
    await gitDiscardAll(worktreePath)
    setActionLoading(null)
    loadStatus()
    setFileDiff(null)
    setSelectedFile(null)
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setCommitting(true)
    setCommitResult(null)
    const result = await gitCommit(worktreePath, commitMsg.trim())
    setCommitting(false)
    if (result.ok) {
      setCommitMsg('')
      setCommitResult(`Committed as ${result.hash || 'unknown'}`)
      loadStatus()
      setFileDiff(null)
      setSelectedFile(null)
    } else {
      setCommitResult(`Commit failed: ${result.error || 'unknown error'}`)
    }
  }

  const handlePull = async () => {
    setActionLoading('pull')
    const result = await gitPull(worktreePath)
    setActionLoading(null)
    if (result.ok) {
      loadStatus()
      setCommitResult('Pull completed')
    } else {
      setCommitResult(`Pull failed: ${result.error || 'unknown error'}`)
    }
  }

  const handlePush = async () => {
    setActionLoading('push')
    const result = await gitPush(worktreePath)
    setActionLoading(null)
    if (result.ok) {
      setCommitResult('Push completed')
    } else {
      setCommitResult(`Push failed: ${result.error || 'unknown error'}`)
    }
  }

  const handleFetch = async () => {
    setActionLoading('fetch')
    const result = await gitFetch(worktreePath)
    setActionLoading(null)
    if (result.ok) {
      setCommitResult('Fetch completed')
    } else {
      setCommitResult(`Fetch failed: ${result.error || 'unknown error'}`)
    }
  }

  const handleCopyPath = (filePath: string) => {
    navigator.clipboard?.writeText(filePath)
    setContextMenuFile(null)
  }

  const handleRevealInExplorer = () => {
    setContextMenuFile(null)
  }

  const isLoading = (key: string) => actionLoading === key

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleCommit()
    }
  }

  return (
    <div className="pr-fullpage">
      <div className="pr-fullpage-body">
        <div className="pr-panel-header">
          <h3>Source Control</h3>
          <div className="pr-panel-tabs">
            <button className={`pr-tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => { setStatusFilter('all'); setSelectedFile(null) }}>
              All {status ? `(${status.total})` : ''}
            </button>
            <button className={`pr-tab ${statusFilter === 'staged' ? 'active' : ''}`} onClick={() => { setStatusFilter('staged'); setSelectedFile(null) }}>
              Staged
            </button>
            <button className={`pr-tab ${statusFilter === 'unstaged' ? 'active' : ''}`} onClick={() => { setStatusFilter('unstaged'); setSelectedFile(null) }}>
              Changes
            </button>
          </div>
          <button className="pr-close-btn" onClick={onClose} title="Close">
            <i className="codicon codicon-close" style={{ fontSize: 16 }}></i>
          </button>
        </div>
        <div className="scm-body">
          <div className="scm-sidebar">
            <div className="scm-section">
              {/* Branch info */}
              <div className="scm-branch-row">
                <i className="codicon codicon-source-control" style={{ fontSize: 14, marginRight: 4 }}></i>
                <span className="scm-branch-name">{status?.branch || 'loading...'}</span>
                {status && (status.ahead > 0 || status.behind > 0) && (
                  <span className="scm-branch-status">
                    {status.behind > 0 && <span className="diff-stat-del">↓ {status.behind}</span>}
                    {status.ahead > 0 && <span className="diff-stat-add">↑ {status.ahead}</span>}
                  </span>
                )}
              </div>

              {/* Commit area */}
              <div className="scm-commit-area">
                <textarea
                  className="scm-commit-input"
                  placeholder="Commit message (Ctrl+Enter to commit)"
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                />
                <button
                  className="scm-commit-btn"
                  disabled={!commitMsg.trim() || committing}
                  onClick={handleCommit}
                >
                  {committing ? 'Committing...' : 'Commit'}
                </button>
              </div>

              {commitResult && (
                <div className={`scm-commit-result ${commitResult.startsWith('Commit failed') || commitResult.startsWith('Pull failed') || commitResult.startsWith('Push failed') || commitResult.startsWith('Fetch failed') ? 'error' : ''}`}>
                  {commitResult}
                </div>
              )}

              {/* Action buttons */}
              <div className="scm-actions-row">
                <button className="scm-action-btn" onClick={handleStageAll} disabled={isLoading('stage-all') || visibleFiles.length === 0} title="Stage All Changes">
                  {isLoading('stage-all') ? '...' : '✓ +'}
                </button>
                <button className="scm-action-btn" onClick={handleUnstageAll} disabled={isLoading('unstage-all')} title="Unstage All Changes">
                  {isLoading('unstage-all') ? '...' : '⊟'}
                </button>
                <button className="scm-action-btn" onClick={loadStatus} title="Refresh">
                  ↻
                </button>
                <button className="scm-action-btn" onClick={handlePull} disabled={isLoading('pull')} title="Pull">
                  {isLoading('pull') ? '...' : '↓'}
                </button>
                <button className="scm-action-btn" onClick={handlePush} disabled={isLoading('push')} title="Push">
                  {isLoading('push') ? '...' : '↑'}
                </button>
                <button className="scm-action-btn" onClick={handleFetch} disabled={isLoading('fetch')} title="Fetch">
                  {isLoading('fetch') ? '...' : '↧'}
                </button>
                <button className="scm-action-btn scm-action-danger" onClick={handleDiscardAll} disabled={isLoading('discard-all')} title="Discard All Changes">
                  {isLoading('discard-all') ? '...' : '✕'}
                </button>
              </div>

              {/* Changes section */}
              <div className="scm-section-header">
                <span>Changes</span>
                <span className="scm-section-stats">
                  {totalAdds > 0 && <span className="diff-stat-add">+{totalAdds}</span>}
                  {totalDels > 0 && <span className="diff-stat-del">-{totalDels}</span>}
                  <span className="diff-stat-total">{visibleFiles.length} file{visibleFiles.length !== 1 ? 's' : ''}</span>
                </span>
              </div>
              <div className="scm-file-list">
                {!status ? (
                  !worktreePath ? (
                    <div className="scm-empty">Open a workspace to view changes</div>
                  ) : (
                    <div className="scm-loading">Loading...</div>
                  )
                ) : visibleFiles.length === 0 ? (
                  <div className="scm-empty">
                    {status.clean ? 'No changes' : 'No matching files'}
                  </div>
                ) : (
                  Object.entries(groupedFiles(visibleFiles)).map(([dir, files]) => (
                    <div key={dir} className="scm-folder">
                      {dir !== '/' && <div className="scm-folder-label">{dir}/</div>}
                      {files.map(f => (
                        <div
                          key={f.filePath}
                          className={`scm-file-item ${selectedFile === f.filePath ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedFile(f.filePath)
                            setContextMenuFile(null)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenuFile(f.filePath)
                          }}
                        >
                          {statusIcon(f.status)}
                          <span className="scm-file-path">{f.filePath.split('/').pop()}</span>
                          <span className="scm-file-stats">
                            {f.additions > 0 && <span className="diff-stat-add">+{f.additions}</span>}
                            {f.deletions > 0 && <span className="diff-stat-del">-{f.deletions}</span>}
                          </span>
                          {selectedFile === f.filePath && (
                            <span className="scm-file-actions">
                              <button
                                className="scm-file-action-btn"
                                onClick={(e) => { e.stopPropagation(); setSelectedFile(f.filePath) }}
                                title="Open Diff"
                              >◀▶</button>
                              {f.staged ? (
                                <button
                                  className="scm-file-action-btn"
                                  onClick={(e) => { e.stopPropagation(); handleUnstage(f.filePath) }}
                                  title="Unstage"
                                >⊟</button>
                              ) : (
                                <button
                                  className="scm-file-action-btn"
                                  onClick={(e) => { e.stopPropagation(); handleStage(f.filePath) }}
                                  title="Stage"
                                >+</button>
                              )}
                            </span>
                          )}
                          {contextMenuFile === f.filePath && (
                            <div className="scm-context-menu" onClick={(e) => e.stopPropagation()}>
                              <button className="scm-context-item" onClick={() => { setSelectedFile(f.filePath); setContextMenuFile(null) }}>Open Diff</button>
                              <button className="scm-context-item" onClick={() => handleCopyPath(f.filePath)}>Copy File Path</button>
                              <button className="scm-context-item" onClick={handleRevealInExplorer}>Reveal in Explorer</button>
                              <div className="scm-context-separator" />
                              {f.staged ? (
                                <button className="scm-context-item" onClick={() => handleUnstage(f.filePath)}>Unstage Changes</button>
                              ) : (
                                <button className="scm-context-item" onClick={() => handleStage(f.filePath)}>Stage Changes</button>
                              )}
                              <button className="scm-context-item danger" onClick={() => handleRevert(f.filePath)}>Revert Changes</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="scm-content">
            {!selectedFile ? (
              <div className="scm-content-empty">
                Select a file to view diff
              </div>
            ) : fileDiffLoading ? (
              <div className="scm-content-loading">Loading diff...</div>
            ) : fileDiff !== null && fileDiff.trim() ? (
              <div className="scm-diff-container">
                <div className="scm-diff-toolbar">
                  <span className="scm-diff-filename">{selectedFile}</span>
                  <div className="scm-diff-actions">
                    <button
                      className="scm-diff-action-btn danger"
                      onClick={() => handleRevert(selectedFile)}
                      title="Revert this file"
                    >
                      Revert
                    </button>
                  </div>
                </div>
                <DiffViewer diff={fileDiff} filename={selectedFile} />
              </div>
            ) : (
              <div className="scm-content-empty">No diff content for {selectedFile}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}