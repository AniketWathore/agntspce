import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { SessionState } from '../types'

interface Props {
  sessions: SessionState[]
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onNewShell: () => void
  onCloseShell: () => void
  writeBuffers: Record<string, string>
}

function ShellTerminal({ session, onInput, onResize, onRestart, onClose, writeData }: {
  session: SessionState
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onClose: (sessionId: string) => void
  writeData: string
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
      fontSize: 11,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
      theme: buildTheme(),
      allowTransparency: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(terminalRef.current)

    function doFit() {
      try { fitAddon.fit(); term.refresh(0, term.rows - 1) } catch {}
    }
    setTimeout(doFit, 100)

    term.onData((data) => {
      onInput(session.id, data)
    })

    term.onResize(({ cols, rows }) => {
      onResize(session.id, cols, rows)
    })

    termInstance.current = term

    const themeObserver = new MutationObserver(() => {
      try { term.options.theme = buildTheme() } catch {}
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      themeObserver.disconnect()
      term.dispose()
      termInstance.current = null
    }
  }, [session.id])

  const lastWriteLenRef = useRef(0)
  useEffect(() => {
    if (writeData.length > lastWriteLenRef.current && termInstance.current) {
      const newData = writeData.slice(lastWriteLenRef.current)
      lastWriteLenRef.current = writeData.length
      if (newData) termInstance.current.write(newData)
    }
  }, [writeData])

  return (
    <div className="shell-terminal">
      <div className="shell-terminal-header">
        <span className="shell-terminal-title">{session.id.slice(-8)}</span>
        <button className="shell-terminal-restart" onClick={() => onRestart(session.id)} title="Restart">↻</button>
        <button className="shell-terminal-close" onClick={() => onClose(session.id)} title="Close">✕</button>
      </div>
      <div ref={terminalRef} className="shell-terminal-instance" />
    </div>
  )
}

export default function ShellSidebar({ sessions, onInput, onResize, onRestart, onClose, onNewShell, onCloseShell, writeBuffers }: Props) {
  return (
    <aside className="shell-sidebar">
      <div className="shell-sidebar-header">
        <h3>Shells</h3>
        <div className="shell-header-actions">
          <button className="shell-add-btn" onClick={onNewShell} title="New shell">+</button>
          <button className="shell-close-panel-btn" onClick={onCloseShell} title="Close panel">✕</button>
        </div>
      </div>
      <div className="shell-sidebar-list">
        {sessions.length === 0 ? (
          <div className="shell-sidebar-empty">
            <p>No shell terminals</p>
          </div>
        ) : (
          sessions.map(session => (
            <ShellTerminal
              key={session.id}
              session={session}
              onInput={onInput}
              onResize={onResize}
              onRestart={onRestart}
              onClose={onClose}
              writeData={writeBuffers[session.id] || ''}
            />
          ))
        )}
      </div>
    </aside>
  )
}
