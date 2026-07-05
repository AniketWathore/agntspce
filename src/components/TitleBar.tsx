interface Props {
  unreadCount: number
  notificationPanelOpen: boolean
  onNotificationClick: () => void
}

export default function TitleBar({ unreadCount, notificationPanelOpen, onNotificationClick }: Props) {
  return (
    <div className="title-bar">
      <div className="title-bar-drag" />
      <button
        className={`title-bar-btn ${notificationPanelOpen ? 'active' : ''}`}
        onClick={onNotificationClick}
        title="Notifications"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="title-bar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
    </div>
  )
}
