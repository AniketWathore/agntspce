import { useState, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { SessionState, AgentConfig, AgentStartConfig } from '../types'
import TerminalPane from './TerminalPane'
import AgentPicker from './AgentPicker'
import { getAgentColorImage } from '../agentImages'

export interface PageView {
  id: string
  label: string
  icon: string
  render: () => ReactNode
}

interface Props {
  sessions: SessionState[]
  shellSessions: SessionState[]
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onStartAgent: (sessionId: string, config: AgentStartConfig) => void
  onShowAgentModal: (sessionId: string) => void
  onNewAgent: () => void
  onSelectAgent: (agentId: string) => void
  onNewShell: () => void
  onCloseTab: (sessionId: string) => void
  onActiveSessionChange: (id: string | null) => void
  activeSessionId: string | null
  writeBuffersRef: { current: Record<string, string> }
  agentConfigs: AgentConfig[]
  layoutPreset?: 'auto' | '1x1' | '2x2' | '1+2' | '3x3'
  focusMode: boolean
  agentsList?: { id: string; name: string; icon: string }[]
  bottomShellOpen: boolean
  onToggleShell: () => void
  chatSidebarOpen: boolean
  onToggleChatSidebar: () => void
  onTerminalOutput: (cb: (data: any) => void) => () => void
  pageViews?: PageView[]
  activeView: string | null
  onViewChange: (view: string | null) => void
  shellOnly?: boolean
  cavemanEnabled?: Record<string, boolean>
  onToggleCaveman?: (sessionId: string, enabled: boolean) => void
}

const AGENT_TYPES = [
  { id: 'claude', label: 'Claude Code', icon: '🤖' },
  { id: 'opencode', label: 'Opencode', icon: '🔧' },
  { id: 'codex', label: 'Codex', icon: '⚡' },
  { id: 'gemini', label: 'Gemini CLI', icon: '✨' },
]

function getTilingStyle(count: number): CSSProperties {
  const base: CSSProperties = { display: 'grid', gap: 4, padding: '0 4px 4px', minHeight: 0, flex: 1 }
  if (count <= 1) return { ...base, gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
  if (count === 2) return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }
  if (count <= 4) return { ...base, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
  const cols = Math.min(Math.ceil(Math.sqrt(count)), 4)
  const rows = Math.ceil(count / cols)
  return { ...base, gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }
}

function getItemStyle(index: number, count: number, _activeIndex: number): CSSProperties {
  if (count === 3 && index === 0) {
    return { gridRow: 'span 2' }
  }
  return {}
}

function ShellTerminal({ session, onInput, onResize, writeData, hidden, onTerminalOutput }: {
  session: SessionState
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  writeData: string
  hidden: boolean
  onTerminalOutput?: (cb: (data: any) => void) => () => void
}) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  function buildTheme() {
    function v(name: string): string {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    }
    return {
      background: v('--terminal-bg'),
      foreground: v('--terminal-fg'),
      cursor: v('--terminal-cursor'),
      selectionBackground: v('--terminal-selection'),
      black: v('--terminal-black'),
      red: v('--terminal-red'),
      green: v('--terminal-green'),
      yellow: v('--terminal-yellow'),
      blue: v('--terminal-blue'),
      magenta: v('--terminal-magenta'),
      cyan: v('--terminal-cyan'),
      white: v('--terminal-white'),
      brightBlack: v('--terminal-bright-black'),
      brightRed: v('--terminal-bright-red'),
      brightGreen: v('--terminal-bright-green'),
      brightYellow: v('--terminal-bright-yellow'),
      brightBlue: v('--terminal-bright-blue'),
      brightMagenta: v('--terminal-bright-magenta'),
      brightCyan: v('--terminal-bright-cyan'),
      brightWhite: v('--terminal-bright-white'),
    }
  }

  useEffect(() => {
    if (!terminalRef.current) return
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
      theme: buildTheme(),
      allowTransparency: false,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon
    term.open(terminalRef.current)
    function doFit() { try { fitAddon.fit(); term.refresh(0, term.rows - 1) } catch {} }
    setTimeout(doFit, 100)
    term.onData((data) => { onInput(session.id, data) })
    term.onResize(({ cols, rows }) => { onResize(session.id, cols, rows) })
    termInstance.current = term
    const themeObserver = new MutationObserver(() => { try { term.options.theme = buildTheme() } catch {} })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    if (writeData) term.write(writeData)

    const unsub = onTerminalOutput?.(({ sessionId: sid, data }: { sessionId: string, data: string }) => {
      if (sid === session.id && termInstance.current) {
        termInstance.current.write(data)
      }
    })

    return () => {
      unsub?.()
      themeObserver.disconnect()
      term.dispose()
      termInstance.current = null
    }
  }, [session.id, onTerminalOutput])

  useEffect(() => {
    if (terminalRef.current && !hidden && termInstance.current && fitAddonRef.current) {
      try { fitAddonRef.current.fit() } catch {}
    }
  }, [hidden])

  useEffect(() => {
    const el = terminalRef.current
    if (!el || hidden) return
    const ro = new ResizeObserver(() => {
      if (fitAddonRef.current) try { fitAddonRef.current.fit() } catch {}
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hidden])

  return (
    <div className="shell-terminal-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...(hidden ? { display: 'none' } : {}) }}>
      <div className="shell-terminal-header">
        <span className="shell-terminal-title">{session.id.slice(-8)}</span>
      </div>
      <div ref={terminalRef} className="shell-terminal-instance" />
    </div>
  )
}

function ShellTabList({ shells, activeShellId, onSelect, onClose, header }: {
  shells: SessionState[]
  activeShellId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  header?: ReactNode
}) {
  return (
    <div className="shell-tab-list">
      {header}
      {shells.map(s => (
        <div
          key={s.id}
          className={`shell-tab-item ${s.id === activeShellId ? 'active' : ''}`}
          onClick={() => onSelect(s.id)}
        >
          <span className="shell-tab-item-icon">▸</span>
          <span className="shell-tab-item-label">{s.id.slice(-8)}</span>
          <button className="shell-tab-item-close" onClick={(e) => { e.stopPropagation(); onClose(s.id) }} title="Close terminal">✕</button>
        </div>
      ))}
    </div>
  )
}

export default function TerminalArea({
  sessions, shellSessions, onInput, onResize, onRestart, onStartAgent,
  onShowAgentModal, onNewAgent, onSelectAgent, onNewShell, onCloseTab, onActiveSessionChange,
  activeSessionId, writeBuffersRef, agentConfigs,
  focusMode, agentsList, bottomShellOpen, onToggleShell,
  chatSidebarOpen, onToggleChatSidebar, onTerminalOutput,
  pageViews, activeView, onViewChange, shellOnly,
  cavemanEnabled, onToggleCaveman,
}: Props) {
  const [activeGroupTab, setActiveGroupTab] = useState<string>('all')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [activeShellId, setActiveShellId] = useState<string | null>(null)
  const [terminalFullscreen, setTerminalFullscreen] = useState(false)
  const prevShellCount = useRef(shellSessions.length)

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) {
      counts[s.type] = (counts[s.type] || 0) + 1
    }
    return counts
  }, [sessions])

  const filteredSessions = useMemo(() => {
    if (activeGroupTab === 'all') return sessions
    return sessions.filter(s => s.type === activeGroupTab)
  }, [sessions, activeGroupTab])

  useEffect(() => {
    if (activeGroupTab !== 'all' && activeSessionId) {
      const session = sessions.find(s => s.id === activeSessionId)
      if (session && session.type !== activeGroupTab) {
        const firstInGroup = filteredSessions[0]
        if (firstInGroup) onActiveSessionChange(firstInGroup.id)
      }
    }
  }, [activeGroupTab])

  useEffect(() => {
    if (!activeSessionId || filteredSessions.some(s => s.id === activeSessionId)) return
    const session = sessions.find(s => s.id === activeSessionId)
    if (session) setActiveGroupTab('all')
  }, [activeSessionId])

  useEffect(() => {
    if (!activeShellId && shellSessions.length > 0) {
      setActiveShellId(shellSessions[shellSessions.length - 1].id)
    }
  }, [shellSessions])

  useEffect(() => {
    if (shellSessions.length > prevShellCount.current) {
      setActiveShellId(shellSessions[shellSessions.length - 1].id)
    }
    prevShellCount.current = shellSessions.length
  }, [shellSessions])

  const useHorizontalScroll = bottomShellOpen && filteredSessions.length >= 3

  const showAgents = !(terminalFullscreen && bottomShellOpen)

  const activePage = activeView && pageViews?.find(p => p.id === activeView)

  const groupTabs = [
    { id: 'all', label: 'All', icon: '⊞', count: sessions.length },
    ...AGENT_TYPES
      .filter(t => typeCounts[t.id] > 0)
      .map(t => ({ id: t.id, label: t.label, icon: t.icon, count: typeCounts[t.id] })),
  ]

  function handleAddAgentClick() {
    if (agentsList && agentsList.length > 0) {
      setShowDropdown(o => !o)
    } else {
      onNewAgent()
    }
  }

  function handleDropdownSelect(agentId: string) {
    setShowDropdown(false)
    onSelectAgent(agentId)
  }

  function handleDropdownClose() { setShowDropdown(false) }

  function handleShellClose(sessionId: string) {
    const isLast = shellSessions.length <= 1
    onCloseTab(sessionId)
    if (isLast) onToggleShell()
  }

  const activeIdx = activeSessionId
    ? filteredSessions.findIndex(s => s.id === activeSessionId)
    : 0
  const tilingStyle = getTilingStyle(filteredSessions.length)

  if (shellOnly && !bottomShellOpen) return null

  return (
    <div className={`terminal-area-wrapper${terminalFullscreen ? ' fullscreen' : ''}`}>
      {!shellOnly && (
        <div className="tab-bar">
          <div className="tab-bar-tabs">
            {groupTabs.map(tab => {
              const isActive = tab.id === activeGroupTab && !activeView
              return (
                <div
                  key={tab.id}
                  className={`tab-item ${isActive ? 'active' : ''}`}
                  onClick={() => { onViewChange(null); setActiveGroupTab(tab.id); if (terminalFullscreen) setTerminalFullscreen(false) }}
                >
                  {tab.icon === '⊞' ? (
                    <span className="tab-icon">{tab.icon}</span>
                  ) : (
                    <img className="tab-icon-img" src={getAgentColorImage(tab.id)} alt={tab.label} />
                  )}
                  {tab.icon === '⊞' && <span className="tab-label">{tab.label}</span>}
                  <span className="tab-count">{tab.count}</span>
                </div>
              )
            })}
          </div>
          <div className="tab-bar-actions" style={{ position: 'relative' }}>
            {focusMode && <span className="focus-indicator" title="Focus mode active (Cmd+Shift+F)">Focus</span>}
            <button className="new-terminal-btn" onMouseDown={e => e.nativeEvent.stopPropagation()} onClick={handleAddAgentClick}>+ Agent</button>

            <button className={`shell-btn ${chatSidebarOpen ? 'active' : ''}`} onClick={onToggleChatSidebar} title="Chat">
              <i className="codicon codicon-comment-discussion" style={{ fontSize: 16 }}></i>
            </button>
            {showDropdown && agentsList && (
              <AgentPicker
                agents={agentsList}
                onSelect={handleDropdownSelect}
                onClose={handleDropdownClose}
              />
            )}
          </div>
        </div>
      )}

      {activePage ? (
        <div className="terminal-area-page-content">
          {activePage.render()}
        </div>
      ) : shellOnly ? (
        <>
          {bottomShellOpen && (
            <div className="bottom-shell" style={{ flex: 1 }}>
              <div className="bottom-shell-body">
                <div className="bottom-shell-terminal-area">
                  {shellSessions.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                      No shell terminals
                    </div>
                  ) : (
                    shellSessions.map(s => (
                      <ShellTerminal
                        key={s.id}
                        session={s}
                        onInput={onInput}
                        onResize={onResize}
                        writeData={writeBuffersRef.current[s.id] || ''}
                        hidden={s.id !== activeShellId}
                        onTerminalOutput={onTerminalOutput}
                      />
                    ))
                  )}
                </div>
                <ShellTabList
                  shells={shellSessions}
                  activeShellId={activeShellId}
                  onSelect={setActiveShellId}
                  onClose={handleShellClose}
                  header={
                    <div className="shell-tab-list-header">
                      <div className="shell-tab-list-header-actions">
                        <button className="shell-header-btn" onClick={() => onNewShell()} title="New terminal">+</button>
                        <button className={`shell-header-btn ${terminalFullscreen ? 'active' : ''}`} onClick={() => setTerminalFullscreen(o => !o)} title={terminalFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                          {terminalFullscreen ? '⊠' : '⊡'}
                        </button>
                        <button className="shell-header-btn" onClick={onToggleShell} title="Close terminal panel">✕</button>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
          )}
          </>
        ) : sessions.length === 0 ? (
        <div className="terminal-area-empty" style={!showAgents ? { display: 'none' } : {}}>
          <div className="empty-state">
            <p>No agent terminals</p>
            <p className="empty-hint">Add an AI coding agent or open a terminal</p>
            <div className="empty-actions" style={{ position: 'relative' }}>
              <button className="new-terminal-btn" onMouseDown={e => e.nativeEvent.stopPropagation()} onClick={() => {
                if (agentsList && agentsList.length > 0) {
                  setShowAgentDropdown(o => !o)
                }
              }}>+ Agent</button>
              <button className="shell-btn" onClick={onNewShell} title="Open shell terminal">
                <i className="codicon codicon-terminal" style={{ fontSize: 16 }}></i>
              </button>
              {showAgentDropdown && agentsList && (
                <AgentPicker
                  agents={agentsList}
                  onSelect={(agentId) => { setShowAgentDropdown(false); onSelectAgent(agentId) }}
                  onClose={() => setShowAgentDropdown(false)}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {showAgents && (
            <div
              className={useHorizontalScroll ? 'terminal-area-hscroll' : 'terminal-area'}
              style={useHorizontalScroll ? { flex: 1, minHeight: 0 } : tilingStyle}
            >
              {filteredSessions.map((session, i) => (
                <TerminalPane
                  key={session.id}
                  session={session}
                  onInput={onInput}
                  onResize={onResize}
                  onRestart={onRestart}
                  onStartAgent={onStartAgent}
                  onShowAgentModal={onShowAgentModal}
                  writeData={writeBuffersRef.current[session.id] || ''}
                  agentConfigs={agentConfigs}
                  style={useHorizontalScroll ? { flex: '1 0 50%', minWidth: 0, height: '100%' } : getItemStyle(i, filteredSessions.length, activeIdx)}
                  onClose={onCloseTab}
                  dimmed={focusMode && session.id !== activeSessionId}
                  onTerminalOutput={onTerminalOutput}
                  cavemanEnabled={cavemanEnabled?.[session.id]}
                  onToggleCaveman={onToggleCaveman}
                />
              ))}
            </div>
          )}

          {bottomShellOpen && (
            <div className="bottom-shell" style={{ flex: terminalFullscreen ? '1' : '0 0 50%' }}>
              <div className="bottom-shell-body">
                <div className="bottom-shell-terminal-area">
                  {shellSessions.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                      No shell terminals
                    </div>
                  ) : (
                    shellSessions.map(s => (
                      <ShellTerminal
                        key={s.id}
                        session={s}
                        onInput={onInput}
                        onResize={onResize}
                        writeData={writeBuffersRef.current[s.id] || ''}
                        hidden={s.id !== activeShellId}
                        onTerminalOutput={onTerminalOutput}
                      />
                    ))
                  )}
                </div>
                <ShellTabList
                  shells={shellSessions}
                  activeShellId={activeShellId}
                  onSelect={setActiveShellId}
                  onClose={handleShellClose}
                  header={
                    <div className="shell-tab-list-header">
                      <div className="shell-tab-list-header-actions">
                        <button className="shell-header-btn" onClick={() => onNewShell()} title="New terminal">+</button>
                        <button className={`shell-header-btn ${terminalFullscreen ? 'active' : ''}`} onClick={() => setTerminalFullscreen(o => !o)} title={terminalFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                          {terminalFullscreen ? '⊠' : '⊡'}
                        </button>
                        <button className="shell-header-btn" onClick={onToggleShell} title="Close terminal panel">✕</button>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
          )}
          </>
        )}
      </div>
  )
}
