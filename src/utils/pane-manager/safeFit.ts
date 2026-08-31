import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'

const MIN_PANE_FIT_WIDTH_PX = 48
const MIN_PANE_FIT_COLS = 8
const MIN_PANE_FIT_ROWS = 4

export function getProposedDimensions(fitAddon: FitAddon): { cols: number; rows: number } | null {
  try {
    return fitAddon.proposeDimensions() ?? null
  } catch {
    return null
  }
}

export function canMeasurePaneForFit(paneEl: HTMLElement | null, fitAddon: FitAddon): boolean {
  if (paneEl) {
    const rect = paneEl.getBoundingClientRect()
    if (rect.width < MIN_PANE_FIT_WIDTH_PX) return false
  }
  const dims = getProposedDimensions(fitAddon)
  if (!dims) return false
  return dims.cols >= MIN_PANE_FIT_COLS && dims.rows >= MIN_PANE_FIT_ROWS
}

export function safeFit(
  fitAddon: FitAddon,
  term: Terminal,
  paneEl: HTMLElement | null,
  force = false
): boolean {
  if (!canMeasurePaneForFit(paneEl, fitAddon)) return false
  const dims = getProposedDimensions(fitAddon)
  if (!force && dims && dims.cols === term.cols && dims.rows === term.rows) return false
  try {
    fitAddon.fit()
    return true
  } catch {
    return false
  }
}
