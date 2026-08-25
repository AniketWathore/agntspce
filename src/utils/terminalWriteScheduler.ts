import type { Terminal } from '@xterm/xterm'

// Per-terminal write scheduler — simplified port of Orca's
// pane-terminal-output-scheduler. During multi-agent floods, writing every
// coalesced batch straight into xterm saturates the renderer main thread
// (ANSI parse + full-grid canvas repaint per write), which is what made
// scrolling and typing feel laggy everywhere.
//
// Mechanics:
// - FIFO queue of chunks, sliced into ≤16KB writes (xterm parse-friendly).
// - Foreground: zero-delay MessageChannel macrotask ticks (Chromium clamps
//   nested setTimeout(0) to ~4ms), ≤8 writes/tick with an 8ms time budget,
//   and parse-clock pacing — the next tick is scheduled from xterm's write
//   completion callback, not a timer (~30MB/s vs a 2–8MB/s drip).
// - Background (dimmed pane or hidden window): 50ms delay before draining,
//   then 16ms cadence ×2 writes/tick — a flooding hidden terminal can no
//   longer starve the focused one.
// - Hard queue ceiling (2MB): if output outpaces draining past the cap while
//   hidden/unfocused, oldest queued data is replaced with a one-line skip
//   warning (agent TUIs repaint constantly, so this self-heals). This bounds
//   renderer memory when timers are throttled in hidden windows — Superset's
//   "hidden-window rAF/timer stall = otherwise unbounded buffer" fix.

const CHUNK_CHARS = 16 * 1024
const FG_MAX_WRITES_PER_TICK = 8
const BG_MAX_WRITES_PER_TICK = 2
const DRAIN_TIME_BUDGET_MS = 8
const BG_FLUSH_DELAY_MS = 50
const BG_DRAIN_INTERVAL_MS = 16
const PARSE_CALLBACK_SAFETY_MS = 250
const BACKLOG_HARD_CAP_CHARS = 2 * 1024 * 1024
const SKIP_WARNING = '\r\n[agntspce: skipped terminal output while the view was busy]\r\n'
const COMPACT_THRESHOLD_CHUNKS = 64

export interface TerminalWriteScheduler {
  write(data: string): void
  setForeground(foreground: boolean): void
  pendingChars(): number
  dispose(): void
}

export function createTerminalWriteScheduler(
  term: Terminal,
  initialForeground = true,
): TerminalWriteScheduler {
  let chunks: string[] = []
  let head = 0 // consumption cursor — avoids O(n²) Array.shift
  let queued = 0
  let foregroundRequested = initialForeground
  let disposed = false

  let mc: MessageChannel | null = null
  let tickScheduled = false
  let tickTimer: ReturnType<typeof setTimeout> | null = null
  let bgDelayTimer: ReturnType<typeof setTimeout> | null = null

  let outstandingWrites = 0
  let parseSafetyTimer: ReturnType<typeof setTimeout> | null = null

  function effectiveForeground(): boolean {
    return foregroundRequested && !document.hidden
  }

  function ensureChannel(): void {
    if (mc) return
    try {
      mc = new MessageChannel()
      mc.port1.onmessage = () => {
        tickScheduled = false
        drain()
      }
      mc.port1.start()
    } catch {
      mc = null
    }
  }

  function scheduleTick(): void {
    if (disposed || parseSafetyTimer) return
    if (effectiveForeground()) {
      ensureChannel()
      if (mc && !tickScheduled) {
        tickScheduled = true
        try { mc.port2.postMessage(0) } catch { tickScheduled = false }
      }
      if (!mc && !tickTimer && !tickScheduled) {
        // MessageChannel unavailable — fall back to near-zero timer.
        tickTimer = setTimeout(() => { tickTimer = null; drain() }, 0)
      }
    } else {
      if (!tickTimer) {
        tickTimer = setTimeout(() => { tickTimer = null; drain() }, BG_DRAIN_INTERVAL_MS)
      }
    }
  }

  function onParseSettled(): void {
    if (parseSafetyTimer) {
      clearTimeout(parseSafetyTimer)
      parseSafetyTimer = null
    }
    scheduleTick()
  }

  function takeNextChunk(): string | null {
    while (head < chunks.length) {
      const raw = chunks[head]
      if (raw.length <= CHUNK_CHARS) {
        head++
        queued -= raw.length
        return raw
      }
      const slice = raw.slice(0, CHUNK_CHARS)
      chunks[head] = raw.slice(CHUNK_CHARS)
      queued -= slice.length
      return slice
    }
    return null
  }

  function compact(): void {
    if (head >= COMPACT_THRESHOLD_CHUNKS) {
      chunks = chunks.slice(head)
      head = 0
    }
  }

  /** Drop-oldest enforcement: keeps the queue under BACKLOG_HARD_CAP_CHARS.
   *  Uses the maintained `queued` total — O(1), no per-write recompute. */
  function enforceCap(): void {
    compact()
    if (queued <= BACKLOG_HARD_CAP_CHARS) return
    // Replace the whole backlog with the warning — ordering after it stays FIFO.
    chunks = [SKIP_WARNING]
    head = 0
    queued = SKIP_WARNING.length
  }

  function drain(): void {
    if (disposed) return
    if (outstandingWrites > 0 || queued === 0) return
    const maxWrites = effectiveForeground() ? FG_MAX_WRITES_PER_TICK : BG_MAX_WRITES_PER_TICK
    const start = performance.now()
    let writes = 0
    while (writes < maxWrites && queued > 0) {
      const chunk = takeNextChunk()
      if (!chunk) break
      outstandingWrites++
      writes++
      try {
        term.write(chunk, () => {
          outstandingWrites = Math.max(0, outstandingWrites - 1)
          if (outstandingWrites === 0 && parseSafetyTimer) onParseSettled()
        })
      } catch {
        outstandingWrites = Math.max(0, outstandingWrites - 1)
      }
      if (performance.now() - start > DRAIN_TIME_BUDGET_MS) break
    }
    if (writes > 0 && outstandingWrites > 0) {
      // Safety net: if xterm never invokes a completion callback (e.g. the
      // terminal died mid-batch), un-wedge the queue instead of stalling.
      if (!parseSafetyTimer) {
        parseSafetyTimer = setTimeout(() => {
          parseSafetyTimer = null
          outstandingWrites = 0
          scheduleTick()
        }, PARSE_CALLBACK_SAFETY_MS)
      }
    }
    if (queued > 0 && outstandingWrites === 0) {
      // No callbacks in flight (e.g. every write threw) — keep going via tick.
      scheduleTick()
    }
    if (queued === 0 && outstandingWrites === 0) compact()
  }

  const scheduler: TerminalWriteScheduler = {
    write(data: string): void {
      if (disposed || !data) return
      chunks.push(data)
      queued += data.length
      enforceCap()
      if (effectiveForeground()) {
        if (!tickScheduled && !tickTimer && outstandingWrites === 0) scheduleTick()
      } else if (
        // Queue was idle before this chunk → start the background delay so
        // brief non-focused blips don't wake the drain loop.
        queued === data.length && !bgDelayTimer && !tickTimer && outstandingWrites === 0
      ) {
        bgDelayTimer = setTimeout(() => { bgDelayTimer = null; drain() }, BG_FLUSH_DELAY_MS)
      }
    },

    setForeground(fg: boolean): void {
      if (disposed || foregroundRequested === fg) return
      foregroundRequested = fg
      if (fg) {
        if (bgDelayTimer) { clearTimeout(bgDelayTimer); bgDelayTimer = null }
        if (!tickScheduled && !tickTimer && outstandingWrites === 0) scheduleTick()
      } else if (queued > 0 && !bgDelayTimer && !tickTimer && outstandingWrites === 0) {
        bgDelayTimer = setTimeout(() => { bgDelayTimer = null; drain() }, BG_FLUSH_DELAY_MS)
      }
    },

    pendingChars(): number {
      return queued
    },

    dispose(): void {
      disposed = true
      chunks = []
      head = 0
      queued = 0
      if (tickTimer) { clearTimeout(tickTimer); tickTimer = null }
      if (bgDelayTimer) { clearTimeout(bgDelayTimer); bgDelayTimer = null }
      if (parseSafetyTimer) { clearTimeout(parseSafetyTimer); parseSafetyTimer = null }
      if (mc) {
        try { mc.port1.close(); mc.port2.close() } catch {}
        mc = null
      }
    },
  }

  // Hidden windows throttle timers AND stop painting; treat them as background
  // so flood output drains slowly and the hard cap protects memory.
  const onVisibility = () => {
    if (disposed) return
    if (!document.hidden && foregroundRequested) {
      if (bgDelayTimer) { clearTimeout(bgDelayTimer); bgDelayTimer = null }
      if (!tickScheduled && !tickTimer && outstandingWrites === 0) scheduleTick()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const innerDispose = scheduler.dispose
  scheduler.dispose = () => {
    document.removeEventListener('visibilitychange', onVisibility)
    innerDispose()
  }

  return scheduler
}
