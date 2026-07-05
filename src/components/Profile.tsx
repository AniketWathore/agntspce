interface Props {
  onClose: () => void
}

export default function Profile({ onClose }: Props) {
  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>Profile</h1>
        <button className="profile-close-btn" onClick={onClose} title="Close">
          <i className="codicon codicon-close" style={{ fontSize: 16 }}></i>
        </button>
      </div>
      <div className="profile-content">
        <div className="profile-avatar-section">
          <div className="profile-avatar">
            <div className="profile-avatar-placeholder">U</div>
          </div>
          <div className="profile-info">
            <h2>User</h2>
            <p className="profile-email">user@agentworkspace.dev</p>
            <p className="profile-role">Developer</p>
          </div>
        </div>

        <div className="profile-stats-grid">
          <div className="profile-stat-card">
            <span className="profile-stat-value">—</span>
            <span className="profile-stat-label">Workspaces</span>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-value">—</span>
            <span className="profile-stat-label">Sessions</span>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-value">1.0.0</span>
            <span className="profile-stat-label">Version</span>
          </div>
        </div>

        <div className="profile-details">
          <div className="profile-detail-item">
            <span className="profile-detail-label">Email</span>
            <span className="profile-detail-value">user@agentworkspace.dev</span>
          </div>
          <div className="profile-detail-item">
            <span className="profile-detail-label">Role</span>
            <span className="profile-detail-value">Developer</span>
          </div>
          <div className="profile-detail-item">
            <span className="profile-detail-label">Workspaces</span>
            <span className="profile-detail-value">—</span>
          </div>
          <div className="profile-detail-item">
            <span className="profile-detail-label">Sessions</span>
            <span className="profile-detail-value">—</span>
          </div>
          <div className="profile-detail-item">
            <span className="profile-detail-label">Version</span>
            <span className="profile-detail-value">1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
