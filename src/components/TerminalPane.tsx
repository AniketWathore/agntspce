import { useEffect, useRef, useState, memo } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
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
  onResumeSession?: (sessionId: string) => void
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
  onResizeStart?: (sessionId: string, edge: 'left' | 'right' | 'top' | 'bottom', x: number, y: number) => void
  onResizeMove?: (sessionId: string, edge: 'left' | 'right' | 'top' | 'bottom', x: number, y: number) => void
  onResizeEnd?: () => void
  edgeHandles?: ('left' | 'right' | 'top' | 'bottom')[]
}

export default memo(function TerminalPane(props: Props) {
  const { session, onInput, onResize, onResumeSession, onStartAgent, onShowAgentModal, onClose, writeData, agentConfigs, style, dimmed, onTerminalOutput, layoutMode = 'grid', onLayoutChange, onResizeStart, onResizeMove, onResizeEnd, edgeHandles } = props
  const terminalRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [showStartup, setShowStartup] = useState(false)
  const onTerminalOutputRef = useRef(onTerminalOutput)
  useEffect(() => { onTerminalOutputRef.current = onTerminalOutput })

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
    // Restorable placeholders have no PTY — skip creating an xterm instance
    // (saves GPU/memory for many saved-but-not-running sessions).
    if (session.restorable) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 16,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: buildTheme(),
      allowTransparency: false,
      scrollback: 200,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(terminalRef.current)

    // GPU-accelerated rendering: dramatically faster for large scrollback and
    // multi-terminal layouts. Falls back to the default renderer on failure.
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        try { webglAddon.dispose() } catch {}
        try { term.loadAddon(new WebglAddon()) } catch {}
      })
      term.loadAddon(webglAddon)
    } catch {}

    function doFit() {
      try { fitAddon.fit() } catch { }
    }
    let fitRaf = 0
    let fitAttempts = 0
    function retryFit() {
      doFit()
      const container = terminalRef.current
      const hasSize = !!container && container.clientWidth > 0 && container.clientHeight > 0
      if ((!hasSize || term.cols < 2 || term.rows < 2) && fitAttempts < 30) {
        fitAttempts++
        fitRaf = requestAnimationFrame(retryFit)
      }
    }
    fitRaf = requestAnimationFrame(retryFit)

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

    if (writeData) {
      // Clear scrollback before loading saved buffer
      term.write('\x1b[3J')
      // Chunk large buffers to avoid blocking the renderer thread
      const chunkSize = 4096
      let offset = 0
      function loadChunk() {
        const chunk = writeData.slice(offset, offset + chunkSize)
        if (chunk) term.write(chunk)
        offset += chunkSize
        if (offset < writeData.length) requestAnimationFrame(loadChunk)
      }
      loadChunk()
    }

    const unsub = onTerminalOutputRef.current?.(({ sessionId: sid, data }: { sessionId: string, data: string }) => {
      if (sid === session.id && termInstance.current) {
        termInstance.current.write(data)
      }
    })

    const themeObserver = new MutationObserver(() => {
      try { term.options.theme = buildTheme() } catch { }
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      cancelAnimationFrame(fitRaf)
      unsub?.()
      themeObserver.disconnect()
      term.dispose()
      termInstance.current = null
    }
  }, [session.id, session.restorable])

  useEffect(() => {
    if (!fitAddonRef.current || !paneRef.current) return
    let raf = 0
    const observer = new ResizeObserver(() => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        try {
          fitAddonRef.current?.fit()
        } catch { }
      })
    })
    observer.observe(paneRef.current)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

function handleResizeDown(edge: 'left' | 'right' | 'top' | 'bottom', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!onResizeStart || !onResizeMove) return
    const startX = e.clientX
    const startY = e.clientY
    onResizeStart(session.id, edge, startX, startY)
    document.body.style.cursor = edge === 'left' || edge === 'right' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev: MouseEvent) {
      onResizeMove?.(session.id, edge, ev.clientX, ev.clientY)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onResizeEnd?.()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handles = edgeHandles ?? ['left', 'right', 'top', 'bottom']
  const showHandle = (edge: 'left' | 'right' | 'top' | 'bottom') =>
    handles.includes(edge) && onResizeStart && onResizeMove

  return (
    <div className={`terminal-pane${dimmed ? ' dimmed' : ''}${session.sessionGroupId ? ' grouped' : ''}`} ref={paneRef} style={session.sessionGroupId ? { ...style, borderLeftColor: groupColor } : style}>
      {showHandle('left') && <div className="pane-resize-handle pane-resize-left" onMouseDown={(e) => handleResizeDown('left', e)} />}
      {showHandle('right') && <div className="pane-resize-handle pane-resize-right" onMouseDown={(e) => handleResizeDown('right', e)} />}
      {showHandle('top') && <div className="pane-resize-handle pane-resize-top" onMouseDown={(e) => handleResizeDown('top', e)} />}
      {showHandle('bottom') && <div className="pane-resize-handle pane-resize-bottom" onMouseDown={(e) => handleResizeDown('bottom', e)} />}
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
        {session.restorable && (
          <div className="terminal-resume-overlay">
            <div className="terminal-resume-content">
              <div className="terminal-resume-icon">
                <i className="codicon codicon-history" style={{ fontSize: 28 }}></i>
              </div>
              <div className="terminal-resume-title">Session saved — not running</div>
              <div className="terminal-resume-desc">Start this agent again to continue where it left off.</div>
              <button
                className="terminal-resume-btn"
                onClick={(e) => { e.stopPropagation(); onResumeSession?.(session.id) }}
              >
                <i className="codicon codicon-play" style={{ fontSize: 12 }}></i>
                Resume Session
              </button>
            </div>
          </div>
        )}
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
}, areTerminalPanePropsEqual)

// Custom memo comparator: volatile props (inline callbacks, fresh style objects,
// writeData strings) change on every parent render and would defeat memo,
// forcing ALL panes to re-render when any session updates. Only re-render when
// the things that actually affect this pane change.
function areTerminalPanePropsEqual(prev: Props, next: Props): boolean {
  if (prev.session !== next.session) return false
  if (prev.writeData !== next.writeData) return false
  if (prev.dimmed !== next.dimmed) return false
  if (prev.layoutMode !== next.layoutMode) return false
  if (prev.agentConfigs !== next.agentConfigs) return false
  const ps = prev.style
  const ns = next.style
  if (ps?.flex !== ns?.flex) return false
  if (ps?.gridColumn !== ns?.gridColumn) return false
  if (ps?.gridRow !== ns?.gridRow) return false
  if (ps?.display !== ns?.display) return false
  return true
}
