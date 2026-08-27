import { useState, useEffect, useMemo, useRef, useCallback, memo, type CSSProperties, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import type { SessionState, AgentConfig, AgentStartConfig } from '../types'
import TerminalPane from './TerminalPane'
import AgentPicker from './AgentPicker'
import { getAgentColorImage } from '../agentImages'
import { copyToClipboard, readFromClipboard } from '../utils/clipboard'
import { eventMatchesRegisteredAppShortcut } from '../utils/shortcuts'
import { createTerminalWriteScheduler, type TerminalWriteScheduler } from '../utils/terminalWriteScheduler'

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
  onResumeSession: (sessionId: string) => void
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
  onTerminalResizerMouseDown?: (e: React.MouseEvent) => void
  terminalHeight?: number
  terminalDrag?: boolean
  agentPickerTrigger?: number
}

const AGENT_TYPES = [
  { id: 'claude', label: 'Claude Code', icon: '🤖' },
  { id: 'opencode', label: 'Opencode', icon: '🔧' },
  { id: 'codex', label: 'Codex', icon: '⚡' },
  { id: 'gemini', label: 'Gemini CLI', icon: '✨' },
]

interface CellPlacement {
  col: number
  row: number
  rowSpan?: number
  colSpan?: number
}

interface GridDef {
  cols: number
  rows: number
  cells: CellPlacement[]
}

// Deterministic tiling layouts. Odd counts use a "master-stack" arrangement
// (agent 1 spans the full height on the left, remaining agents stack in a grid
// on the right, Hyprland/tmux-style). Even counts use equal-sized grids.
function gridDefForCount(count: number): GridDef {
  if (count <= 1) return { cols: 1, rows: 1, cells: [{ col: 1, row: 1 }] }
  if (count === 2) return { cols: 2, rows: 1, cells: [{ col: 1, row: 1 }, { col: 2, row: 1 }] }
  if (count === 3) return {
    cols: 2, rows: 2,
    cells: [
      { col: 1, row: 1, rowSpan: 2 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
    ],
  }
  if (count === 4) return {
    cols: 2, rows: 2,
    cells: [
      { col: 1, row: 1 }, { col: 2, row: 1 },
      { col: 1, row: 2 }, { col: 2, row: 2 },
    ],
  }
  if (count === 5) return {
    cols: 3, rows: 2,
    cells: [
      { col: 1, row: 1, rowSpan: 2 },
      { col: 2, row: 1 }, { col: 3, row: 1 },
      { col: 2, row: 2 }, { col: 3, row: 2 },
    ],
  }
  if (count === 6) return {
    cols: 3, rows: 2,
    cells: [
      { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
      { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 },
    ],
  }
  if (count === 7) return {
    cols: 4, rows: 2,
    cells: [
      { col: 1, row: 1, rowSpan: 2 },
      { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 },
      { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 },
    ],
  }
  if (count === 8) return {
    cols: 4, rows: 2,
    cells: [
      { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 },
      { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 },
    ],
  }
  if (count === 9) return {
    cols: 5, rows: 2,
    cells: [
      { col: 1, row: 1, rowSpan: 2 },
      { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 },
      { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 },
    ],
  }
  if (count === 10) return {
    cols: 5, rows: 2,
    cells: [
      { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 },
      { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 },
    ],
  }
  const cols = Math.min(Math.ceil(Math.sqrt(count)), 4)
  const rows = Math.ceil(count / cols)
  const cells: CellPlacement[] = []
  for (let i = 0; i < count; i++) {
    cells.push({ col: (i % cols) + 1, row: Math.floor(i / cols) + 1 })
  }
  return { cols, rows, cells }
}

function getTilingStyle(count: number, paneSizes: Record<string, number>, sessionIds: string[]): CSSProperties {
  const base: CSSProperties = { display: 'grid', gap: 4, padding: '0 4px 4px', minHeight: 0, flex: 1 }
  const w = sessionIds.map(id => Math.max(0.3, paneSizes[id] || 1))

  if (count <= 1) return { ...base, gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
  if (count === 2) return { ...base, gridTemplateColumns: `${w[0]}fr ${w[1]}fr`, gridTemplateRows: '1fr' }
  if (count === 3) return { ...base, gridTemplateColumns: `${w[0]}fr ${w[1] + w[2]}fr`, gridTemplateRows: `${w[1]}fr ${w[2]}fr` }
  if (count === 4) return { ...base, gridTemplateColumns: `${w[0] + w[2]}fr ${w[1] + w[3]}fr`, gridTemplateRows: `${w[0] + w[1]}fr ${w[2] + w[3]}fr` }
  if (count === 5) return { ...base, gridTemplateColumns: `${w[0]}fr 1fr 1fr`, gridTemplateRows: '1fr 1fr' }
  if (count === 6) return { ...base, gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
  if (count === 7) return { ...base, gridTemplateColumns: `${w[0]}fr 1fr 1fr 1fr`, gridTemplateRows: 'repeat(2, 1fr)' }
  if (count === 9) return { ...base, gridTemplateColumns: `${w[0]}fr 1fr 1fr 1fr 1fr`, gridTemplateRows: 'repeat(2, 1fr)' }
  const cols = Math.min(Math.ceil(Math.sqrt(count)), 4)
  const rows = Math.ceil(count / cols)
  return { ...base, gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }
}

function getItemStyle(index: number, count: number, _activeIndex: number): CSSProperties {
  // First agent spans full height in its column (not 2 cols)
  if ((count === 3 || count === 5 || count === 7 || count === 9) && index === 0) {
    return { gridRow: 'span 2' }
  }
  return {}
}

// Resize handles only appear on interior dividers so every edge has exactly one
// grabbable surface on either side of it.
function getGridEdgeHandles(index: number, count: number): ('left' | 'right' | 'top' | 'bottom')[] {
  const def = gridDefForCount(count)
  const cell = def.cells[index]
  if (!cell) return []
  const handles: ('left' | 'right' | 'top' | 'bottom')[] = []
  if (cell.col > 1) handles.push('left')
  if (cell.col + (cell.colSpan || 1) <= def.cols) handles.push('right')
  if (cell.row > 1) handles.push('top')
  if (cell.row + (cell.rowSpan || 1) <= def.rows) handles.push('bottom')
  return handles
}

const ShellTerminal = memo(function ShellTerminal({ session, onInput, onResize, writeData, hidden, onTerminalOutput }: {
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
  const shellSchedulerRef = useRef<TerminalWriteScheduler | null>(null)
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
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
      theme: buildTheme(),
      allowTransparency: false,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon
    term.open(terminalRef.current)
    // GPU rendering with the same hygiene rules as agent panes (context-loss
    // falls back to canvas). Keeps shell output cheap to draw while agents
    // flood other panes.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => { try { webgl.dispose() } catch {} })
      term.loadAddon(webgl)
    } catch {}

    // Route live output through the per-pane scheduler (parse-paced, capped)
    // instead of writing straight into xterm — otherwise N flooding agents +
    // an active shell saturate the main thread together.
    let shellScheduler: ReturnType<typeof createTerminalWriteScheduler> | null = null
    try {
      shellScheduler = createTerminalWriteScheduler(term, true)
      shellSchedulerRef.current = shellScheduler
    } catch { shellScheduler = null }
    function doFit() { try { fitAddon.fit() } catch {} }
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
    term.onData((data) => { onInput(session.id, data) })
    term.onResize(({ cols, rows }) => { onResize(session.id, cols, rows) })
    termInstance.current = term

    term.focus()

    if (navigator.platform?.startsWith('Win')) {
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true
        const ctrl = e.ctrlKey || e.metaKey
        if (!ctrl) return true

        // Block xterm from processing registered app shortcuts so the global
        // keydown handler in App.tsx can fire instead.
        if (eventMatchesRegisteredAppShortcut(e)) {
          e.preventDefault()
          return false
        }

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

    const themeObserver = new MutationObserver(() => { try { term.options.theme = buildTheme() } catch {} })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    if (writeData) term.write(writeData)

    const unsub = onTerminalOutput?.(({ sessionId: sid, data }: { sessionId: string, data: string }) => {
      if (sid === session.id) {
        if (shellScheduler) shellScheduler.write(data)
        else termInstance.current?.write(data)
      }
    })

    return () => {
      cancelAnimationFrame(fitRaf)
      shellScheduler?.dispose()
      if (shellSchedulerRef.current === shellScheduler) shellSchedulerRef.current = null
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
    let raf = 0
    const ro = new ResizeObserver(() => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (fitAddonRef.current) try { fitAddonRef.current.fit() } catch {}
      })
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [hidden])

  return (
    <div className="shell-terminal-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...(hidden ? { display: 'none' } : {}) }}>
      <div className="shell-terminal-header">
        <span className="shell-terminal-title">{session.id.slice(-8)}</span>
      </div>
      <div ref={terminalRef} className="shell-terminal-instance" />
    </div>
  )
})

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

export default memo(function TerminalArea({
  sessions, shellSessions, onInput, onResize, onRestart, onResumeSession,
  onStartAgent, onShowAgentModal, onNewAgent, onSelectAgent, onNewShell, onCloseTab, onActiveSessionChange,
  activeSessionId, writeBuffersRef, agentConfigs,
  focusMode, agentsList, bottomShellOpen, onToggleShell,
  chatSidebarOpen, onToggleChatSidebar, onTerminalOutput,
  pageViews, activeView, onViewChange, shellOnly,
  onTerminalResizerMouseDown, terminalHeight = 40, terminalDrag,
  agentPickerTrigger = 0,
}: Props) {
  const [activeGroupTab, setActiveGroupTab] = useState<string>('all')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [activeShellId, setActiveShellId] = useState<string | null>(null)
  const [terminalFullscreen, setTerminalFullscreen] = useState(false)
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null)
  const [splitLayout, setSplitLayout] = useState<'grid' | 'side-left' | 'side-right'>('grid')
  const prevShellCount = useRef(shellSessions.length)
  const [paneSizes, setPaneSizes] = useState<Record<string, number>>({})

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

  // Reset the pane sizes whenever the agent count changes (layout restructuring).
  useEffect(() => {
    const count = filteredSessions.length
    setPaneSizes(prev => {
      const prevIds = new Set(Object.keys(prev))
      const countChanged = prevIds.size !== count || !prevIds.has(filteredSessions[0]?.id || '')
      if (!countChanged) {
        // Only add new sessions without resetting existing ones
        const next = { ...prev }
        filteredSessions.forEach((s, i) => {
          if (next[s.id] === undefined) {
            if (count === 3) next[s.id] = i === 0 ? 2 : 1
            else if (count === 5) next[s.id] = i === 0 ? 2 : 1
            else if (count === 7) next[s.id] = i === 0 ? 2 : 1
            else next[s.id] = 1
          }
        })
        return next
      }
      // Full reset: compute new layout based on count
      const next: Record<string, number> = {}
      filteredSessions.forEach((s, i) => {
        if (count === 3) next[s.id] = i === 0 ? 2 : 1
        else if (count === 5) next[s.id] = i === 0 ? 2 : 1
        else if (count === 7) next[s.id] = i === 0 ? 2 : 1
        else next[s.id] = 1
      })
      return next
    })
  }, [filteredSessions])

  // Exit full screen (and side splits) if the focused session is closed.
  useEffect(() => {
    if (focusSessionId && !filteredSessions.some(s => s.id === focusSessionId)) {
      setFocusSessionId(null)
      setSplitLayout('grid')
    }
  }, [filteredSessions, focusSessionId])

  const showAgents = !(terminalFullscreen && bottomShellOpen)

  const activePage = activeView && pageViews?.find(p => p.id === activeView)

  const groupTabs = [
    { id: 'all', label: 'All', icon: '⊞', count: sessions.length },
    ...AGENT_TYPES
      .filter(t => typeCounts[t.id] > 0)
      .map(t => ({ id: t.id, label: t.label, icon: t.icon, count: typeCounts[t.id] })),
  ]

  const [dragging, setDragging] = useState(false)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ sessionId: string; edge: string; startX: number; startY: number; startSize: number } | null>(null)
  const dragSizeRef = useRef<{ [sessionId: string]: number }>({})

  function handleResizeStart(sessionId: string, edge: 'left' | 'right' | 'top' | 'bottom', x: number, y: number) {
    dragRef.current = { sessionId, edge, startX: x, startY: y, startSize: paneSizes[sessionId] || 1 }
    dragSizeRef.current[sessionId] = paneSizes[sessionId] || 1
    setDragging(true)
  }

  function handleResizeMove(sessionId: string, _edge: string, x: number, y: number) {
    const drag = dragRef.current
    if (!drag || drag.sessionId !== sessionId) return
    const container = gridContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const deltaX = x - drag.startX
    const deltaY = y - drag.startY
    let factorX = 0
    let factorY = 0
    if (_edge === 'left' || _edge === 'right') {
      factorX = deltaX / rect.width
      if (_edge === 'left') factorX = -factorX
    } else {
      factorY = deltaY / rect.height
      if (_edge === 'top') factorY = -factorY
    }
    const factor = (_edge === 'left' || _edge === 'right') ? factorX : factorY
    const newSize = Math.max(0.25, Math.min(8, drag.startSize + factor))
    dragSizeRef.current[sessionId] = newSize

    // Direct DOM manipulation during drag to avoid React re-renders
    const w = filteredSessions.map(s => {
      if (s.id === sessionId) return Math.max(0.3, newSize)
      return Math.max(0.3, paneSizes[s.id] || 1)
    })

    const count = filteredSessions.length

    if (count === 2) {
      container.style.gridTemplateColumns = `${w[0]}fr ${w[1]}fr`
    } else if (count === 3) {
      container.style.gridTemplateColumns = `${w[0]}fr ${w[1] + w[2]}fr`
      container.style.gridTemplateRows = `${w[1]}fr ${w[2]}fr`
    } else if (count === 4) {
      container.style.gridTemplateColumns = `${w[0] + w[2]}fr ${w[1] + w[3]}fr`
      container.style.gridTemplateRows = `${w[0] + w[1]}fr ${w[2] + w[3]}fr`
    } else if (count === 5) {
      container.style.gridTemplateColumns = `${w[0]}fr 1fr 1fr`
      container.style.gridTemplateRows = '1fr 1fr'
    } else if (count === 7) {
      container.style.gridTemplateColumns = `${w[0]}fr 1fr 1fr 1fr 1fr`
      container.style.gridTemplateRows = '1fr 1fr'
    } else if (count === 9) {
      container.style.gridTemplateColumns = `${w[0]}fr 1fr 1fr 1fr 1fr`
      container.style.gridTemplateRows = '1fr 1fr'
    } else {
      const cols = Math.ceil(Math.sqrt(count))
      container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
      const rows = Math.ceil(count / cols)
      container.style.gridTemplateRows = `repeat(${rows}, 1fr)`
    }
  }

  const handleResizeEnd = useCallback(() => {
    const drag = dragRef.current
    if (drag) {
      const finalSize = dragSizeRef.current[drag.sessionId]
      if (finalSize !== undefined) {
        setPaneSizes(prev => ({ ...prev, [drag.sessionId]: finalSize }))
      }
    }
    setDragging(false)
    dragRef.current = null
    dragSizeRef.current = {}
  }, [])

  function handleAddAgentClick() {
    if (agentsList && agentsList.length > 0) {
      setShowDropdown(o => !o)
    } else {
      onNewAgent()
    }
  }

  const prevPickerTrigger = useRef(agentPickerTrigger)
  useEffect(() => {
    if (agentPickerTrigger !== prevPickerTrigger.current) {
      prevPickerTrigger.current = agentPickerTrigger
      handleAddAgentClick()
    }
  }, [agentPickerTrigger])

  function handleDropdownSelect(agentId: string) {
    setShowDropdown(false)
    onSelectAgent(agentId)
  }

  function handleDropdownClose() { setShowDropdown(false) }

  function handleShellClose(sessionId: string) {
    const isLast = shellSessions.length <= 1
    const remainingShells = shellSessions.filter(s => s.id !== sessionId)
    onCloseTab(sessionId)
    if (isLast) {
      onToggleShell()
    } else if (remainingShells.length > 0) {
      // Show the next remaining shell (or previous if closing last)
      const nextShell = remainingShells[remainingShells.length - 1] || remainingShells[0]
      if (nextShell) setActiveShellId(nextShell.id)
    }
  }

  const activeIdx = activeSessionId
    ? filteredSessions.findIndex(s => s.id === activeSessionId)
    : 0
  const sessionIds = filteredSessions.map(s => s.id)
  // While a pane resize drag is in flight, fold the in-progress size into the
  // computed style so any React re-render (status flip etc.) doesn't snap the
  // grid back to pre-drag sizes and fight handleResizeMove's direct DOM writes.
  const effectivePaneSizes = dragging ? { ...paneSizes, ...dragSizeRef.current } : paneSizes
  const tilingStyle = getTilingStyle(filteredSessions.length, effectivePaneSizes, sessionIds)
  const useHorizontalScroll = bottomShellOpen && filteredSessions.length >= 3
  const isFullScreen = focusSessionId !== null && splitLayout === 'grid'

  if (shellOnly) {
    return (
      <div
        className="terminal-area-wrapper"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 5,
          height: activePage || terminalFullscreen ? '100%' : bottomShellOpen ? `${terminalHeight}%` : 0,
          overflow: 'hidden',
        }}
      >
        <div className="bottom-shell" style={{ flex: 1, height: '100%' }}>
          {onTerminalResizerMouseDown && bottomShellOpen && (
            <div className="terminal-resizer" onMouseDown={onTerminalResizerMouseDown} />
          )}
          <div className="bottom-shell-body" style={{ display: bottomShellOpen ? 'flex' : 'none' }}>
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
        {activePage && (
          <div className="terminal-area-page-content" style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {activePage.render()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`terminal-area-wrapper${terminalFullscreen ? ' fullscreen' : ''}`} style={{ position: 'relative' }}>
      {/* Terminal content — always mounted, never unmounted */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        pointerEvents: activePage ? 'none' : 'auto',
      }}>
        {!shellOnly && !activePage && (
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

        {sessions.length === 0 ? (
          <>
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
            {bottomShellOpen && (
              <div className="bottom-shell" style={{ flex: terminalFullscreen ? '1' : `0 0 ${terminalHeight}%` }}>
                {onTerminalResizerMouseDown && (
                  <div className="terminal-resizer" onMouseDown={onTerminalResizerMouseDown} />
                )}
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
        ) : (
          <>
            {showAgents && (
              splitLayout !== 'grid' && focusSessionId ? (
                <div className={`terminal-area${dragging ? ' no-transition' : ''}`} style={{ display: 'flex', flex: 1, minHeight: 0, gap: 4, padding: '0 4px 4px' }}>
                  {splitLayout === 'side-left' ? (
                    <>
                      {filteredSessions.filter(s => s.id === focusSessionId).map(session => (
                        <TerminalPane key={session.id} session={session} onInput={onInput} onResize={onResize} onRestart={onRestart} onResumeSession={onResumeSession} onStartAgent={onStartAgent} onShowAgentModal={onShowAgentModal} writeData={writeBuffersRef.current[session.id] || ''} agentConfigs={agentConfigs} layoutMode="side-left" onLayoutChange={(m) => { if (m === 'grid') { setFocusSessionId(null); setSplitLayout('grid') } else if (m === 'focus') setFocusSessionId(null); else { setFocusSessionId(session.id); setSplitLayout(m) } }} style={{ flex: 1, minWidth: 0, willChange: 'transform' }} onClose={onCloseTab} dimmed={false} onTerminalOutput={onTerminalOutput} onResizeStart={handleResizeStart} onResizeMove={handleResizeMove} onResizeEnd={handleResizeEnd} />
                      ))}
                      <div className="terminal-area" style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', alignContent: 'start' }}>
                        {filteredSessions.filter(s => s.id !== focusSessionId).map(session => (
                          <TerminalPane key={session.id} session={session} onInput={onInput} onResize={onResize} onRestart={onRestart} onResumeSession={onResumeSession} onStartAgent={onStartAgent} onShowAgentModal={onShowAgentModal} writeData={writeBuffersRef.current[session.id] || ''} agentConfigs={agentConfigs} layoutMode="grid" onLayoutChange={(m) => { if (m === 'grid') { setFocusSessionId(null); setSplitLayout('grid') } else if (m === 'focus') { setFocusSessionId(session.id); setSplitLayout('grid') } else { setFocusSessionId(session.id); setSplitLayout(m) } }} style={{ willChange: 'transform' }} onClose={onCloseTab} dimmed={focusMode && session.id !== activeSessionId} onTerminalOutput={onTerminalOutput} onResizeStart={handleResizeStart} onResizeMove={handleResizeMove} onResizeEnd={handleResizeEnd} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="terminal-area" style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', alignContent: 'start' }}>
                        {filteredSessions.filter(s => s.id !== focusSessionId).map(session => (
                          <TerminalPane key={session.id} session={session} onInput={onInput} onResize={onResize} onRestart={onRestart} onResumeSession={onResumeSession} onStartAgent={onStartAgent} onShowAgentModal={onShowAgentModal} writeData={writeBuffersRef.current[session.id] || ''} agentConfigs={agentConfigs} layoutMode="grid" onLayoutChange={(m) => { if (m === 'grid') { setFocusSessionId(null); setSplitLayout('grid') } else if (m === 'focus') { setFocusSessionId(session.id); setSplitLayout('grid') } else { setFocusSessionId(session.id); setSplitLayout(m) } }} style={{ willChange: 'transform' }} onClose={onCloseTab} dimmed={focusMode && session.id !== activeSessionId} onTerminalOutput={onTerminalOutput} onResizeStart={handleResizeStart} onResizeMove={handleResizeMove} onResizeEnd={handleResizeEnd} />
                        ))}
                      </div>
                      {filteredSessions.filter(s => s.id === focusSessionId).map(session => (
                        <TerminalPane key={session.id} session={session} onInput={onInput} onResize={onResize} onRestart={onRestart} onResumeSession={onResumeSession} onStartAgent={onStartAgent} onShowAgentModal={onShowAgentModal} writeData={writeBuffersRef.current[session.id] || ''} agentConfigs={agentConfigs} layoutMode="side-right" onLayoutChange={(m) => { if (m === 'grid') { setFocusSessionId(null); setSplitLayout('grid') } else if (m === 'focus') setFocusSessionId(null); else { setFocusSessionId(session.id); setSplitLayout(m) } }} style={{ flex: 1, minWidth: 0, willChange: 'transform' }} onClose={onCloseTab} dimmed={false} onTerminalOutput={onTerminalOutput} onResizeStart={handleResizeStart} onResizeMove={handleResizeMove} onResizeEnd={handleResizeEnd} />
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="agent-fullscreen-bar" style={{ display: isFullScreen ? 'flex' : 'none' }}>
                    <div className="agent-fullscreen-tabs">
                      {filteredSessions.map(s => (
                        <div
                          key={s.id}
                          className={`agent-fullscreen-tab ${s.id === focusSessionId ? 'active' : ''}`}
                          onClick={() => { setFocusSessionId(s.id); onActiveSessionChange(s.id) }}
                          title={s.id.slice(-8)}
                        >
                          <img className="tab-icon-img" src={getAgentColorImage(s.type)} alt={s.type} />
                          <span className="agent-fullscreen-tab-label">{s.type.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="agent-fullscreen-actions">
                      <button className="agent-fullscreen-btn" onClick={() => { setFocusSessionId(null); setSplitLayout('grid') }} title="Restore the tiled layout">
                        <i className="codicon codicon-split-horizontal" style={{ fontSize: 14 }}></i>
                        Split Agents
                      </button>
                    </div>
                  </div>
                  <div
                    className={`${useHorizontalScroll ? 'terminal-area-hscroll' : `terminal-area${dragging ? ' no-transition' : ''}`}`}
                    ref={gridContainerRef}
                    style={useHorizontalScroll ? undefined : tilingStyle}
                  >
                    {filteredSessions.map((session, i) => (
                      <TerminalPane
                        key={session.id}
                        session={session}
                        onInput={onInput}
                        onResize={onResize}
                        onRestart={onRestart}
                        onResumeSession={onResumeSession}
                        onStartAgent={onStartAgent}
                        onShowAgentModal={onShowAgentModal}
                        writeData={writeBuffersRef.current[session.id] || ''}
                        agentConfigs={agentConfigs}
                        layoutMode={isFullScreen && session.id === focusSessionId ? 'focus' : 'grid'}
                        onLayoutChange={(mode) => {
                          if (mode === 'focus') { setFocusSessionId(session.id); setSplitLayout('grid') }
                          else if (mode === 'side-left' || mode === 'side-right') { setFocusSessionId(session.id); setSplitLayout(mode) }
                          else { setFocusSessionId(null); setSplitLayout('grid') }
                        }}
                        style={isFullScreen
                          ? (session.id === focusSessionId
                              ? { gridColumn: '1 / -1', gridRow: '1 / -1', willChange: 'transform' }
                              : { display: 'none' })
                          : useHorizontalScroll
                            ? { flex: '1 0 50%', minWidth: 0, height: '100%' }
                            : { ...getItemStyle(i, filteredSessions.length, activeIdx), willChange: 'transform' }}
                        onClose={onCloseTab}
                        dimmed={focusMode && session.id !== activeSessionId && !isFullScreen}
                        onTerminalOutput={onTerminalOutput}
                        onResizeStart={handleResizeStart}
                        onResizeMove={handleResizeMove}
                        onResizeEnd={handleResizeEnd}
                        edgeHandles={isFullScreen ? [] : getGridEdgeHandles(i, filteredSessions.length)}
                      />
                    ))}
                  </div>
                </>
              )
            )}

            <div className={`bottom-shell${terminalDrag ? ' no-transition' : ''}`} style={{ flex: bottomShellOpen ? (terminalFullscreen ? '1' : `0 0 ${terminalHeight}%`) : '0 0 0', overflow: 'hidden', minHeight: bottomShellOpen ? 80 : 0 }}>
              {onTerminalResizerMouseDown && (
                <div className="terminal-resizer" onMouseDown={onTerminalResizerMouseDown} />
              )}
              <div className="bottom-shell-body" style={{ display: bottomShellOpen ? 'flex' : 'none' }}>
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
          </>
        )}
      </div>

      {/* Page view overlay — positioned on top of terminals when active */}
      {activePage && (
        <div className="terminal-area-page-content" style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {activePage.render()}
        </div>
      )}
    </div>
  )
})
