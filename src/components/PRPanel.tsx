import { useState, useEffect, useCallback, useRef } from 'react'
import DiffViewer from './DiffViewer'

interface GitLogEntry {
  hash: string
  message: string
  author: string
  date: string
}


interface ChangedFile {
  filePath: string
  status: string
  additions: number
  deletions: number
}

interface Props {
  worktreePath: string
  onClose: () => void
  onSelectDiff: (base: string, head?: string) => void
  fetchLog: (path: string, maxCount?: number) => Promise<GitLogEntry[] | null>

  fetchDiff: (path: string, base: string, head?: string) => Promise<string | null>
  fetchWorkingTreeDiff: (path: string) => Promise<string | null>
  fetchCommitFiles: (path: string, commitHash: string) => Promise<ChangedFile[] | null>
  fetchWorkingTreeFiles: (path: string) => Promise<ChangedFile[] | null>
  fetchFileDiff: (path: string, filePath: string, base?: string, head?: string) => Promise<string | null>
}

type TabId = 'working' | 'commits' | 'overall'

export default function PRPanel({
  worktreePath, onClose, fetchLog,
  fetchCommitFiles, fetchWorkingTreeFiles, fetchFileDiff,
}: Props) {
  const [tab, setTab] = useState<TabId>('working')
  const [log, setLog] = useState<GitLogEntry[] | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitFiles, setCommitFiles] = useState<ChangedFile[] | null>(null)
  const [workingFiles, setWorkingFiles] = useState<ChangedFile[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string | null>(null)
  const [fileDiffLoading, setFileDiffLoading] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchLog(worktreePath, 50).then(setLog)
  }, [worktreePath])

  const loadWorkingFiles = useCallback(async () => {
    const files = await fetchWorkingTreeFiles(worktreePath)
    setWorkingFiles(files || [])
    if (files && files.length > 0 && !selectedFile) {
      setSelectedFile(files[0].filePath)
    }
  }, [worktreePath, fetchWorkingTreeFiles, selectedFile])

  useEffect(() => {
    loadWorkingFiles()
    pollRef.current = setInterval(loadWorkingFiles, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadWorkingFiles])

  const handleCommitClick = useCallback(async (hash: string) => {
    if (selectedCommit === hash) return
    setSelectedCommit(hash)
    setSelectedFile(null)
    setFileDiff(null)

    const files = await fetchCommitFiles(worktreePath, hash)
    setCommitFiles(files || [])

    if (files && files.length > 0) {
      setSelectedFile(files[0].filePath)
    }
  }, [worktreePath, fetchCommitFiles, selectedCommit])

  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null)
      return
    }
    setFileDiffLoading(true)
    const load = async () => {
      let diff: string | null = null
      if (tab === 'working') {
        const file = workingFiles?.find(f => f.filePath === selectedFile)
        if (file?.status === 'U') {
          diff = await fetchFileDiff(worktreePath, selectedFile, 'EMPTY')
        } else {
          diff = await fetchFileDiff(worktreePath, selectedFile)
        }
      } else if (tab === 'commits' && selectedCommit) {
        diff = await fetchFileDiff(worktreePath, selectedFile, `${selectedCommit}^`, selectedCommit)
      }
      setFileDiff(diff)
      setFileDiffLoading(false)
    }
    load()
  }, [selectedFile, tab, selectedCommit, worktreePath, fetchFileDiff])

  const handleTabChange = useCallback((newTab: TabId) => {
    setTab(newTab)
    setSelectedFile(null)
    setFileDiff(null)
    if (newTab === 'working') {
      setSelectedCommit(null)
    } else if (newTab === 'commits' && log && log.length > 0) {
      setSelectedCommit(null)
      setCommitFiles(null)
    }
  }, [log])

  const currentFiles = tab === 'working' ? workingFiles
    : tab === 'commits' ? commitFiles
    : []

  const totalAdds = currentFiles?.reduce((s, f) => s + f.additions, 0) || 0
  const totalDels = currentFiles?.reduce((s, f) => s + f.deletions, 0) || 0
  const statusIcon = (status: string) => {
    switch (status) {
      case 'A': return <span className="scm-status-added">A</span>
      case 'D': return <span className="scm-status-deleted">D</span>
      case 'U': return <span className="scm-status-untracked">U</span>
      case 'M': return <span className="scm-status-modified">M</span>
      default: return <span className="scm-status-modified">M</span>
    }
  }

  const groupedFiles = useCallback((files: ChangedFile[] | null) => {
    if (!files || files.length === 0) return {}
    const groups: Record<string, ChangedFile[]> = {}
    for (const f of files) {
      const parts = f.filePath.split('/')
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/'
      if (!groups[dir]) groups[dir] = []
      groups[dir].push(f)
    }
    return groups
  }, [])

  return (
    <div className="pr-fullpage">
      <div className="pr-fullpage-body">
        <div className="pr-panel-header">
          <h3>Source Control</h3>
          <div className="pr-panel-tabs">
            <button className={`pr-tab ${tab === 'working' ? 'active' : ''}`} onClick={() => handleTabChange('working')}>
              Changes {workingFiles && workingFiles.length > 0 ? `(${workingFiles.length})` : ''}
            </button>
            <button className={`pr-tab ${tab === 'commits' ? 'active' : ''}`} onClick={() => handleTabChange('commits')}>
              Commits
            </button>
            <button className={`pr-tab ${tab === 'overall' ? 'active' : ''}`} onClick={() => handleTabChange('overall')}>
              Overall
            </button>
          </div>
          <button className="pr-close-btn" onClick={onClose} title="Close">
            <i className="codicon codicon-close" style={{ fontSize: 16 }}></i>
          </button>
        </div>
        <div className="scm-body">
          <div className="scm-sidebar">
            {tab === 'working' && (
              <div className="scm-section">
                <div className="scm-section-header">
                  <span>Changes</span>
                  <span className="scm-section-stats">
                    <span className="diff-stat-add">+{totalAdds}</span>
                    <span className="diff-stat-del">-{totalDels}</span>
                  </span>
                </div>
                <div className="scm-file-list">
                  {!workingFiles ? (
                    <div className="scm-loading">Loading...</div>
                  ) : workingFiles.length === 0 ? (
                    <div className="scm-empty">No changes</div>
                  ) : (
                    Object.entries(groupedFiles(workingFiles)).map(([dir, files]) => (
                      <div key={dir} className="scm-folder">
                        {dir !== '/' && <div className="scm-folder-label">{dir}/</div>}
                        {files.map(f => (
                          <div
                            key={f.filePath}
                            className={`scm-file-item ${selectedFile === f.filePath ? 'selected' : ''}`}
                            onClick={() => setSelectedFile(f.filePath)}
                          >
                            {statusIcon(f.status)}
                            <span className="scm-file-path">{f.filePath.split('/').pop()}</span>
                            <span className="scm-file-stats">
                              {f.additions > 0 && <span className="diff-stat-add">+{f.additions}</span>}
                              {f.deletions > 0 && <span className="diff-stat-del">-{f.deletions}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {tab === 'commits' && (
              <div className="scm-section">
                <div className="scm-section-header">
                  <span>Commits</span>
                </div>
                <div className="scm-commit-list">
                  {!log ? (
                    <div className="scm-loading">Loading...</div>
                  ) : log.length === 0 ? (
                    <div className="scm-empty">No commits</div>
                  ) : (
                    log.map(entry => (
                      <div key={entry.hash} className={`scm-commit-item ${selectedCommit === entry.hash ? 'selected' : ''}`} onClick={() => handleCommitClick(entry.hash)}>
                        <div className="scm-commit-header">
                          <span className="scm-commit-hash">{entry.hash}</span>
                          <span className="scm-commit-date">{entry.date}</span>
                        </div>
                        <div className="scm-commit-msg">{entry.message}</div>
                        <div className="scm-commit-author">{entry.author}</div>
                        {selectedCommit === entry.hash && commitFiles && (
                          <div className="scm-commit-files">
                            {Object.entries(groupedFiles(commitFiles)).map(([dir, files]) => (
                              <div key={dir} className="scm-folder">
                                {dir !== '/' && <div className="scm-folder-label">{dir}/</div>}
                                {files.map(f => (
                                  <div
                                    key={f.filePath}
                                    className={`scm-file-item ${selectedFile === f.filePath ? 'selected' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); setSelectedFile(f.filePath) }}
                                  >
                                    {statusIcon(f.status)}
                                    <span className="scm-file-path">{f.filePath.split('/').pop()}</span>
                                    <span className="scm-file-stats">
                                      {f.additions > 0 && <span className="diff-stat-add">+{f.additions}</span>}
                                      {f.deletions > 0 && <span className="diff-stat-del">-{f.deletions}</span>}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {tab === 'overall' && (
              <div className="scm-section">
                <div className="scm-section-header">
                  <span>All Changes</span>
                </div>
                <div className="scm-empty">Select a commit from Commits tab to see overall file changes per commit.</div>
              </div>
            )}
          </div>
          <div className="scm-content">
            {!selectedFile ? (
              <div className="scm-content-empty">
                Select a file to view diff
              </div>
            ) : fileDiffLoading ? (
              <div className="scm-content-loading">Loading diff...</div>
            ) : fileDiff !== null && fileDiff.trim() ? (
              <DiffViewer diff={fileDiff} filename={selectedFile} />
            ) : (
              <div className="scm-content-empty">No diff content for {selectedFile}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
