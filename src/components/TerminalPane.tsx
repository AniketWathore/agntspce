import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import './TerminalPane.css'
import '@xterm/xterm/css/xterm.css'

type Props = {
  id: string
  workspaceName: string
  workspacePath: string
  onClose: () => void
}

const theme = {
  background: '#1a1b26',
  foreground: '#a9b1d6',
  cursor: '#c0caf5',
  selectionBackground: '#2e304a',
  black: '#1d202f',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
}

export default function TerminalPane({ id, workspaceName, workspacePath, onClose }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const el = terminalRef.current
    if (!el) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      theme,
    })

    termRef.current = term

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(el)
    fitAddon.fit()

    term.writeln(`\x1b[1;36m── ${workspaceName} ── ${workspacePath}\x1b[0m`)
    term.writeln('')
    term.writeln(`\x1b[90mShell: /bin/zsh  |  CWD: ${workspacePath}\x1b[0m`)
    term.writeln('')

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(el)

    return () => {
      ro.disconnect()
      termRef.current = null
      term.dispose()
    }
  }, [id])

  return (
    <div className="terminal-pane">
      <div className="pane-header">
        <span className="pane-title">Terminal</span>
        <span className="pane-cwd">{workspacePath}</span>
        <div className="pane-header-spacer" />
        <button className="btn btn-icon-sm" onClick={onClose} title="Close panel">✕</button>
      </div>
      <div className="pane-terminal" ref={terminalRef} />
      <div className="pane-input-bar">
        <span className="pane-prompt">❯</span>
        <input
          className="pane-input"
          type="text"
          placeholder={`$PWD: ${workspacePath} — type a command...`}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const value = (e.target as HTMLInputElement).value
              if (value.trim() && termRef.current) {
                termRef.current.writeln(`\x1b[1;33m❯\x1b[0m ${value}`)
                termRef.current.writeln(`\x1b[90m→ (sent to shell at ${workspacePath})\x1b[0m`)
                termRef.current.writeln('')
                ;(e.target as HTMLInputElement).value = ''
              }
            }
          }}
        />
      </div>
    </div>
  )
}
