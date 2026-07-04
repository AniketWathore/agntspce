import type { SessionState, WorkspaceInfo } from '../types'

interface Props {
  sessions: Record<string, SessionState>
  workspaces: WorkspaceInfo[]
  activeWorkspace: WorkspaceInfo | null
  theme: 'dark' | 'light'
}

function getSessionStats(sessions: Record<string, SessionState>) {
  const arr = Object.values(sessions)
  const total = arr.length
  const busy = arr.filter(s => s.status === 'busy' || s.status === 'waiting').length
  const shells = arr.filter(s => s.type === 'shell').length
  return { total, busy, shells }
}

export default function StatusBar({ sessions, workspaces, activeWorkspace, theme }: Props) {
  const stats = getSessionStats(sessions)

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span className="status-bar-item status-bar-branch" title="Current workspace">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.5 1a2.5 2.5 0 1 0-.4 4.97c-.07.24-.17.47-.3.68l-3.2 3.8a2.5 2.5 0 1 0 1.2 1.02l3.2-3.8c.2-.13.42-.22.66-.3a2.5 2.5 0 0 0 2.34-2.5A2.5 2.5 0 0 0 11.5 1zm0 1a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>
          </svg>
          {activeWorkspace?.name || 'No workspace'}
        </span>
        <span className="status-bar-item" title="Active sessions">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 10a3.5 3.5 0 0 0-3.5 3.5v.5c0 .83.67 1.5 1.5 1.5h3.65a3.5 3.5 0 0 1 .35-1H2.5c-.28 0-.5-.22-.5-.5v-.5a2.5 2.5 0 0 1 2.5-2.5h6.3a3.5 3.5 0 0 1 .7-1H4.5z"/>
          </svg>
          {stats.busy > 0 ? `${stats.busy}/${stats.total}` : `${stats.total}`}
        </span>
        <span className="status-bar-item" title="Shell terminals">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm0 1v10h10V3H3zm2.5 2.5L8 8 5.5 10.5 6 11l3-3-3-3-.5.5z"/>
          </svg>
          {stats.shells}
        </span>
      </div>
      <div className="status-bar-right">
        <span className="status-bar-item" title="Workspaces">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3h5l1 1h6v9H2V3zm1 1v8h11V5H7.5L6.5 4H3z"/>
          </svg>
          {workspaces.length}
        </span>
        <span className="status-bar-item" title="Theme">
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1v12a6 6 0 1 1 0-12z"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8z"/>
            </svg>
          )}
        </span>
      </div>
    </footer>
  )
}
