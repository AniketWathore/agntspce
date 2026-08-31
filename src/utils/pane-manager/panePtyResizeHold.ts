// Orca pane-pty-resize-hold.ts port — holds PTY SIGWINCH during divider drag
export type PanePtyResizeHoldFlushDetail = { cols: number; rows: number }
export const PANE_PTY_RESIZE_HOLD_FLUSH_EVENT = 'pane-pty-resize-hold-flush'

type ResizeHoldState = { depth: number; pending: PanePtyResizeHoldFlushDetail | null }
const resizeHolds = new WeakMap<HTMLElement, ResizeHoldState>()

function getOrCreateHoldState(el: HTMLElement): ResizeHoldState {
  const existing = resizeHolds.get(el)
  if (existing) return existing
  const next: ResizeHoldState = { depth: 0, pending: null }
  resizeHolds.set(el, next)
  return next
}
function beginPanePtyResizeHold(el: HTMLElement): void {
  const s = getOrCreateHoldState(el)
  s.depth += 1
}
export function queuePanePtyResizeIfHeld(
  paneElement: HTMLElement,
  cols: number,
  rows: number
): boolean {
  const state = resizeHolds.get(paneElement)
  if (!state || state.depth <= 0) return false
  state.pending = { cols, rows }
  return true
}
function flushPanePtyResizeHold(el: HTMLElement): void {
  const state = resizeHolds.get(el)
  if (!state) return
  state.depth -= 1
  if (state.depth > 0) return
  resizeHolds.delete(el)
  if (!state.pending) return
  el.dispatchEvent(
    new CustomEvent<PanePtyResizeHoldFlushDetail>(PANE_PTY_RESIZE_HOLD_FLUSH_EVENT, {
      detail: state.pending,
    })
  )
}
function cancelPanePtyResizeHold(el: HTMLElement): void {
  const state = resizeHolds.get(el)
  if (!state) return
  state.depth -= 1
  state.pending = null
  if (state.depth <= 0) resizeHolds.delete(el)
}
function collectPaneElements(root: HTMLElement | null, panes: Set<HTMLElement>): void {
  if (!root) return
  if (root.classList.contains('terminal-pane')) {
    panes.add(root)
    return
  }
  for (const pane of root.querySelectorAll<HTMLElement>('.terminal-pane')) panes.add(pane)
}
export function holdPtyResizesForPaneSubtrees(roots: (HTMLElement | null)[]): {
  flush: () => void
  cancel: () => void
} {
  const panes = new Set<HTMLElement>()
  for (const root of roots) collectPaneElements(root, panes)
  for (const pane of panes) beginPanePtyResizeHold(pane)
  const held = Array.from(panes)
  let released = false
  const release = (doFlush: boolean): void => {
    if (released) return
    released = true
    for (const pane of held) {
      if (doFlush) flushPanePtyResizeHold(pane)
      else cancelPanePtyResizeHold(pane)
    }
  }
  return { flush: () => release(true), cancel: () => release(false) }
}
