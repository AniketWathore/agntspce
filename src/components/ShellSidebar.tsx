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

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 11,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
      theme: {
        background: '#1a1b1e',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        selectionBackground: '#3b3f54',
        black: '#1a1b1e',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#3f3f46',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f4f4f5',
      },
      allowTransparency: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(terminalRef.current)

    setTimeout(() => {
      try { fitAddon.fit() } catch {}
    }, 100)

    term.onData((data) => {
      onInput(session.id, data)
    })

    term.onResize(({ cols, rows }) => {
      onResize(session.id, cols, rows)
    })

    termInstance.current = term

    return () => {
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
          <button className="shell-close-panel-btn" onClick={onCloseShell} title="Close shell">&times;</button>
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