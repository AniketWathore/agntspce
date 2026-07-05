import { useCallback } from 'react'

interface Notification {
  id: string
  type: 'session-created' | 'session-exited' | 'status-change' | 'branch-change' | 'error' | 'agent-approval' | 'session-complete' | 'session-error'
  title: string
  detail: string
  timestamp: number
  read: boolean
}

interface Props {
  notifications: Notification[]
  onDismiss: (id: string) => void
  onDismissAll: () => void
  onClose: () => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const secs = Math.floor(diff / 1000)
  if (secs < 10) return 'now'
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return `${hours}h`
}

const ICONS: Record<string, string> = {
  'session-created': '▶',
  'session-exited': '◀',
  'session-complete': '✓',
  'session-error': '⚠',
  'status-change': '●',
  'branch-change': '⑂',
  error: '⚠',
  'agent-approval': '?',
}

export default function NotificationPanel({ notifications, onDismiss, onDismissAll, onClose }: Props) {
  const unreadCount = notifications.filter(n => !n.read).length

  const groupedByType = useCallback(() => {
    const groups: Record<string, Notification[]> = {}
    for (const n of notifications) {
      if (!groups[n.type]) groups[n.type] = []
      groups[n.type].push(n)
    }
    return groups
  }, [notifications])

  const handleClear = useCallback(() => {
    onDismissAll()
  }, [onDismissAll])

  return (
    <div className="notification-panel-overlay">
      <div className="notification-panel">
        <div className="notification-panel-header">
          <h3>Notifications</h3>
          <div className="notification-panel-actions">
            {unreadCount > 0 && <span className="notification-unread-badge">{unreadCount}</span>}
            <button className="notification-clear-btn" onClick={handleClear}>Clear all</button>
            <button className="notification-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="notification-panel-list">
          {notifications.length === 0 ? (
            <div className="notification-empty">No notifications</div>
          ) : (
            Object.entries(groupedByType()).map(([type, items]) => (
              <div key={type} className="notification-group">
                <div className="notification-group-title">{type.replace('session-', '')} {type.includes('error') ? 'errors' : ''}</div>
                {items.map(n => (
                  <div
                    key={n.id}
                    className={`notification-item ${n.read ? 'read' : 'unread'}`}
                    onClick={() => onDismiss(n.id)}
                  >
                    <span className="notification-icon">{ICONS[n.type] || '●'}</span>
                    <div className="notification-content">
                      <span className="notification-title">{n.title}</span>
                      <span className="notification-detail">{n.detail}</span>
                    </div>
                    <span className="notification-time">{timeAgo(n.timestamp)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export type { Notification }
