interface Props {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  onClose: () => void
}

export default function Settings({ theme, onThemeChange, onClose }: Props) {
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Settings</h1>
        <button className="settings-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="settings-body">
        <div className="settings-section">
          <h2>Appearance</h2>
          <div className="settings-row">
            <span className="settings-label">Theme</span>
            <select
              className="settings-select"
              value={theme}
              onChange={e => onThemeChange(e.target.value as 'dark' | 'light')}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
        <div className="settings-section">
          <h2>Terminal</h2>
          <div className="settings-row">
            <span className="settings-label">Font Size</span>
            <span className="settings-value">13px</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Font Family</span>
            <span className="settings-value">JetBrains Mono</span>
          </div>
        </div>
      </div>
    </div>
  )
}
