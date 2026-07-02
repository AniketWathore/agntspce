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
          <div className="settings-section-header">
            <h2>Appearance</h2>
          </div>
          <div className="settings-row">
            <div>
              <span className="settings-label">Theme</span>
              <span className="settings-label-desc">Switch between dark and light mode</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={theme === 'dark'}
                onChange={e => onThemeChange(e.target.checked ? 'dark' : 'light')}
              />
              <span className="settings-toggle-slider" />
            </label>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Terminal</h2>
          </div>
          <div className="settings-row">
            <span className="settings-label">Font Size</span>
            <span className="settings-value">13px</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Font Family</span>
            <span className="settings-value">JetBrains Mono</span>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Session</h2>
          </div>
          <div className="settings-row">
            <div>
              <span className="settings-label">Auto-save</span>
              <span className="settings-label-desc">Automatically save session state</span>
            </div>
            <label className="settings-toggle">
              <input type="checkbox" defaultChecked />
              <span className="settings-toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <div>
              <span className="settings-label">Token Compression</span>
              <span className="settings-label-desc">Enable real-time token reduction</span>
            </div>
            <label className="settings-toggle">
              <input type="checkbox" defaultChecked />
              <span className="settings-toggle-slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
