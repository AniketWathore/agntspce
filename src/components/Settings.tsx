import { useState, useEffect } from 'react'
import type { ChatModelInfo } from '../types'

interface UserPrefs {
  fontSize: number
  fontFamily: string
  autoSave: boolean
  tokenCompression: boolean
  autoStart: boolean
  sessionRecovery: boolean
  maxTokensPerSession: number
  layoutPreset: string
}

function loadPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem('agent-workspace-prefs')
    if (raw) return { ...defaultPrefs, ...JSON.parse(raw) }
  } catch {}
  return { ...defaultPrefs }
}

function savePrefs(prefs: UserPrefs) {
  localStorage.setItem('agent-workspace-prefs', JSON.stringify(prefs))
}

const defaultPrefs: UserPrefs = {
  fontSize: 16,
  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
  autoSave: true,
  tokenCompression: true,
  autoStart: true,
  sessionRecovery: true,
  maxTokensPerSession: 100000,
  layoutPreset: 'auto',
}

const FONT_FAMILIES = [
  { value: "'JetBrains Mono', 'Fira Code', Menlo, monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', 'JetBrains Mono', Menlo, monospace", label: 'Fira Code' },
  { value: "'Cascadia Code', 'JetBrains Mono', monospace", label: 'Cascadia Code' },
  { value: "'Source Code Pro', Menlo, monospace", label: 'Source Code Pro' },
  { value: "Menlo, Monaco, monospace", label: 'Menlo' },
  { value: "monospace", label: 'Default' },
]

interface Props {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  onFontSizeChange: (size: number) => void
  onFontFamilyChange: (family: string) => void
  onPrefsChange: (prefs: Partial<UserPrefs>) => void
  onClose: () => void
  chatGetModels: () => Promise<ChatModelInfo[]>
  chatUpdateApiKey: (providerId: string, apiKey: string) => void
}

export default function Settings({ theme, onThemeChange, onFontSizeChange, onFontFamilyChange, onPrefsChange, onClose, chatGetModels, chatUpdateApiKey }: Props) {
  const [prefs, setPrefs] = useState<UserPrefs>(loadPrefs)
  const [models, setModels] = useState<ChatModelInfo[]>([])
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  useEffect(() => {
    chatGetModels().then(setModels)
  }, [])

  useEffect(() => {
    savePrefs(prefs)
    onPrefsChange(prefs)
  }, [prefs])

  function updatePrefs(partial: Partial<UserPrefs>) {
    setPrefs(p => {
      const next = { ...p, ...partial }
      return next
    })
  }

  function changeFontSize(delta: number) {
    setPrefs(p => {
      const next = Math.max(10, Math.min(24, p.fontSize + delta))
      onFontSizeChange(next)
      return { ...p, fontSize: next }
    })
  }

  function changeFontFamily(value: string) {
    setPrefs(p => {
      onFontFamilyChange(value)
      return { ...p, fontFamily: value }
    })
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Settings</h1>
        <button className="settings-close-btn" onClick={onClose} title="Close">
          <i className="codicon codicon-close" style={{ fontSize: 16 }}></i>
        </button>
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
            <div>
              <span className="settings-label">Font Size</span>
              <span className="settings-label-desc">{prefs.fontSize}px</span>
            </div>
            <div className="settings-stepper">
              <button className="settings-stepper-btn" onClick={() => changeFontSize(-1)} disabled={prefs.fontSize <= 10}>−</button>
              <span className="settings-stepper-value">{prefs.fontSize}px</span>
              <button className="settings-stepper-btn" onClick={() => changeFontSize(1)} disabled={prefs.fontSize >= 24}>+</button>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <span className="settings-label">Font Family</span>
              <span className="settings-label-desc">Terminal font style</span>
            </div>
            <select
              className="settings-select"
              value={prefs.fontFamily}
              onChange={e => changeFontFamily(e.target.value)}
            >
              {FONT_FAMILIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
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
              <input
                type="checkbox"
                checked={prefs.autoSave}
                onChange={e => updatePrefs({ autoSave: e.target.checked })}
              />
              <span className="settings-toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <div>
              <span className="settings-label">Auto-start agents</span>
              <span className="settings-label-desc">Auto-launch agent sessions on workspace open</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={prefs.autoStart}
                onChange={e => updatePrefs({ autoStart: e.target.checked })}
              />
              <span className="settings-toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <div>
              <span className="settings-label">Session recovery</span>
              <span className="settings-label-desc">Restore sessions from last workspace on startup</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={prefs.sessionRecovery}
                onChange={e => updatePrefs({ sessionRecovery: e.target.checked })}
              />
              <span className="settings-toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <div>
              <span className="settings-label">Max tokens per session</span>
              <span className="settings-label-desc">Auto-close session when token budget exceeded</span>
            </div>
            <input
              className="settings-input"
              type="number"
              min={10000}
              max={1000000}
              step={10000}
              value={prefs.maxTokensPerSession}
              onChange={e => updatePrefs({ maxTokensPerSession: parseInt(e.target.value) || 100000 })}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <h2>API Keys</h2>
          </div>
          {models.map(m => (
            <div key={m.id} className="settings-row">
              <div>
                <span className="settings-label">{m.name}</span>
                <span className="settings-label-desc">{m.model}{m.configured ? ' — configured' : ''}</span>
              </div>
              <div className="settings-api-key-field">
                <input
                  className="settings-input settings-api-key-input"
                  type="password"
                  placeholder={m.configured ? '••••••••' : `Enter ${m.name} API key...`}
                  value={apiKeys[m.id] || ''}
                  onChange={e => {
                    setApiKeys(prev => ({ ...prev, [m.id]: e.target.value }))
                    setSaved(prev => ({ ...prev, [m.id]: false }))
                  }}
                />
                <button
                  className="settings-api-key-save"
                  disabled={!apiKeys[m.id]?.trim()}
                  onClick={() => {
                    chatUpdateApiKey(m.id, apiKeys[m.id].trim())
                    setSaved(prev => ({ ...prev, [m.id]: true }))
                    setTimeout(() => chatGetModels().then(setModels), 300)
                  }}
                >
                  {saved[m.id] ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { UserPrefs }
