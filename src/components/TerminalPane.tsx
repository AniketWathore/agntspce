import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { SessionState, AgentConfig, AgentStartConfig } from '../types'
import StatusDot from './StatusDot'
import StartupUI from './StartupUI'

interface Props {
  session: SessionState
  onInput: (sessionId: string, data: string) => void
  onResize: (sessionId: string, cols: number, rows: number) => void
  onRestart: (sessionId: string) => void
  onStartAgent: (sessionId: string, config: AgentStartConfig) => void
  onShowAgentModal: (sessionId: string) => void
  writeData: string
  agentConfigs: AgentConfig[]
}

export default function TerminalPane({ session, onInput, onResize, onRestart, onStartAgent, onShowAgentModal, writeData, agentConfigs }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [showStartup, setShowStartup] = useState(false)

  const isAgentType = session.type === 'claude' || session.type === 'codex' || session.type === 'opencode' || session.type === 'gemini'
  const shouldShowStartup = isAgentType && session.status === 'waiting' && showStartup

  useEffect(() => {
    if (session.status === 'waiting' && isAgentType) {
      setShowStartup(true)
    } else {
      setShowStartup(false)
    }
  }, [session.status, session.id])

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
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
      try { fitAddon.fit() } catch { }
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

  useEffect(() => {
    if (!fitAddonRef.current) return
    const observer = new ResizeObserver(() => {
      try { fitAddonRef.current?.fit() } catch { }
    })
    if (terminalRef.current) {
      observer.observe(terminalRef.current)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <div className="terminal-pane">
      <div className="terminal-header">
        <StatusDot status={session.status} />
        <span className="terminal-title">{session.type.toUpperCase()}</span>
        {session.branch && session.branch !== 'unknown' && (
          <span className="terminal-branch">{session.branch}</span>
        )}
        <span className="terminal-session-id">{session.id}</span>
        <button className="terminal-restart-btn" onClick={() => onRestart(session.id)} title="Restart">↻</button>
      </div>
      <div className="terminal-body">
        <div ref={terminalRef} className="terminal-instance" />
        {shouldShowStartup && (
          <div className="terminal-startup-overlay">
            <StartupUI
              sessionId={session.id}
              agentConfigs={agentConfigs}
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
