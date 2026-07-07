interface Props {
  unreadCount: number
  notificationPanelOpen: boolean
  onNotificationClick: () => void
}

const MENUS = ['File', 'Edit', 'View', 'Window', 'Help']

export default function TitleBar({ unreadCount, notificationPanelOpen, onNotificationClick }: Props) {
  const isMac = navigator.platform?.startsWith('Mac')

  function handleMenuClick(e: React.MouseEvent, label: string) {
    window.electronAPI?.popupMenu(label, Math.round(e.screenX), Math.round(e.screenY))
  }

  if (isMac) {
    return (
      <div className="title-bar title-bar-mac">
        <div className="title-bar-drag" />
      </div>
    )
  }

  return (
    <div className="title-bar">
      <div className="title-bar-menus">
        {MENUS.map(m => (
          <button key={m} className="title-bar-menu-btn" onClick={e => handleMenuClick(e, m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="title-bar-drag" />
      <div className="title-bar-window-controls">
        <button className="title-bar-win-btn" onClick={() => window.electronAPI?.windowMinimize?.()} title="Minimize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="4.5" width="8" height="1" fill="currentColor"/></svg>
        </button>
        <button className="title-bar-win-btn" onClick={() => window.electronAPI?.windowMaximize?.()} title="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button className="title-bar-win-btn title-bar-win-close" onClick={() => window.electronAPI?.windowClose?.()} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
        </button>
      </div>
    </div>
  )
}
