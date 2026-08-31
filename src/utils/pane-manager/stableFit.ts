import type { FitAddon } from '@xterm/addon-fit'

const MAX_STABLE_ATTEMPTS = 8

export function requestStablePaneFit(
  fitAddon: FitAddon,
  paneEl: HTMLElement,
  doFit: () => boolean
): void {
  let attempts = 0
  let lastCols: number | null = null
  let lastRows: number | null = null
  let stableCount = 0

  function tick() {
    let dims: { cols: number; rows: number } | null = null
    try {
      dims = fitAddon.proposeDimensions() ?? null
    } catch {
      dims = null
    }
    if (!dims) {
      if (attempts < MAX_STABLE_ATTEMPTS) {
        attempts++
        requestAnimationFrame(tick)
      }
      return
    }
    const rect = paneEl.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) {
      if (attempts < MAX_STABLE_ATTEMPTS) {
        attempts++
        requestAnimationFrame(tick)
      }
      return
    }
    if (dims.cols === lastCols && dims.rows === lastRows) {
      stableCount++
    } else {
      stableCount = 0
      lastCols = dims.cols
      lastRows = dims.rows
    }
    if (stableCount >= 1) {
      doFit()
      return
    }
    if (attempts >= MAX_STABLE_ATTEMPTS) {
      doFit()
      return
    }
    attempts++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
