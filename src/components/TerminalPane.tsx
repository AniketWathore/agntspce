import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { SessionState, AgentConfig, AgentStartConfig } from '../types'
import StatusDot from './StatusDot'
import { getAgentColorImage, getAgentTextImage } from '../agentImages'
import StartupUI from './StartupUI'
import { copyToClipboard, readFromClipboard } from '../utils/clipboard'

interface Props {
  session: SessionState
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onStartAgent: (sessionId: string, config: AgentStartConfig) => void
  onShowAgentModal: (sessionId: string) => void
  onClose?: (sessionId: string) => void
  writeData: string
  agentConfigs?: AgentConfig[]
  style?: React.CSSProperties
  dimmed?: boolean
  onTerminalOutput?: (cb: (event: { sessionId: string, data: string }) => void) => () => void
  layoutMode?: 'grid' | 'focus' | 'side-left' | 'side-right'
  onLayoutChange?: (mode: 'grid' | 'focus' | 'side-left' | 'side-right') => void
}

export default function TerminalPane({ session, onInput, onResize, onStartAgent, onShowAgentModal, onClose, writeData, agentConfigs, style, dimmed, onTerminalOutput, layoutMode = 'grid', onLayoutChange }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [showStartup, setShowStartup] = useState(false)

  const isAgentType = session.type === 'claude' || session.type === 'codex' || session.type === 'opencode' || session.type === 'gemini'
  const shouldShowStartup = isAgentType && session.status === 'waiting' && showStartup
  const groupColor = session.sessionGroupId
    ? ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316'][
        session.sessionGroupId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 7
      ]
    : undefined

  useEffect(() => {
    if (session.status === 'waiting' && isAgentType) {
      setShowStartup(true)
    } else {
      setShowStartup(false)
    }
  }, [session.status, session.id])

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
      fontSize: 16,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: buildTheme(),
      allowTransparency: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(terminalRef.current)

    function doFit() {
      try { fitAddon.fit(); term.refresh(0, term.rows - 1) } catch { }
    }
    setTimeout(doFit, 100)

    term.onData((data) => {
      onInput(session.id, data)
    })

    term.onResize(({ cols, rows }) => {
      onResize(session.id, cols, rows)
    })

    termInstance.current = term

    term.focus()

    // Windows: handle Ctrl+C/V manually since menu roles with accelerators
    // would intercept the key events before xterm.js's textarea can handle them.
    if (navigator.platform?.startsWith('Win')) {
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true
        const ctrl = e.ctrlKey || e.metaKey
        if (!ctrl) return true
        const key = e.key.toLowerCase()
        if (key === 'c') {
          if (e.shiftKey || term.hasSelection()) {
            e.preventDefault()
            const sel = term.getSelection()
            if (sel) copyToClipboard(sel)
            return false
          }
          return true
        }
        if (key === 'v') {
          e.preventDefault()
          readFromClipboard().then(text => { if (text) term.paste(text) })
          return false
        }
        return true
      })
    }

    if (writeData) term.write(writeData)

    const unsub = onTerminalOutput?.(({ sessionId: sid, data }: { sessionId: string, data: string }) => {
      if (sid === session.id && termInstance.current) {
        termInstance.current.write(data)
      }
    })

    const themeObserver = new MutationObserver(() => {
      try { term.options.theme = buildTheme() } catch { }
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      unsub?.()
      themeObserver.disconnect()
      term.dispose()
      termInstance.current = null
    }
  }, [session.id, onTerminalOutput])

  useEffect(() => {
    if (!fitAddonRef.current || !paneRef.current) return
    const observer = new ResizeObserver(() => {
      try {
        fitAddonRef.current?.fit()
        termInstance.current?.refresh(0, termInstance.current.rows - 1)
      } catch { }
    })
    observer.observe(paneRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={`terminal-pane${dimmed ? ' dimmed' : ''}${session.sessionGroupId ? ' grouped' : ''}`} ref={paneRef} style={session.sessionGroupId ? { ...style, borderLeftColor: groupColor } : style}>
      <div className="terminal-header">
        <StatusDot status={session.status} />
        {isAgentType ? (
          <span className="terminal-agent-badge">
            <img className="terminal-color-img" src={getAgentColorImage(session.type)} alt={session.type} />
            <img className="terminal-title-img" src={getAgentTextImage(session.type)} alt={session.type} />
          </span>
        ) : (
          <span className="terminal-title">{session.type.toUpperCase()}</span>
        )}
        {session.branch && session.branch !== 'unknown' && (
          <span className="terminal-branch">{session.branch}</span>
        )}

        <span className="terminal-layout-btns">
          <button
            className={`terminal-layout-btn ${layoutMode === 'focus' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onLayoutChange?.(layoutMode === 'focus' ? 'grid' : 'focus') }}
            title="Full screen"
          >⊞</button>
          <button
            className={`terminal-layout-btn ${layoutMode === 'side-left' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onLayoutChange?.(layoutMode === 'side-left' ? 'grid' : 'side-left') }}
            title="Left side"
          >◧</button>
          <button
            className={`terminal-layout-btn ${layoutMode === 'side-right' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onLayoutChange?.(layoutMode === 'side-right' ? 'grid' : 'side-right') }}
            title="Right side"
          >◨</button>
        </span>
        {onClose && (
          <button className="terminal-close-btn" onClick={() => onClose(session.id)} title="Close">✕</button>
        )}
      </div>
      <div className="terminal-body">
        <div ref={terminalRef} className="terminal-instance" />
        {shouldShowStartup && (
          <div className="terminal-startup-overlay">
            <StartupUI
              sessionId={session.id}
              agentConfigs={agentConfigs ?? []}
              onStart={onStartAgent}
              onAdvanced={() => onShowAgentModal(session.id)}
              onDismiss={() => setShowStartup(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
