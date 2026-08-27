export interface ShortcutCombo {
  meta?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  key: string
}

export interface RegisteredShortcut {
  id: string
  combo?: ShortcutCombo
  display: string
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

export function parseCombo(str: string): { combo: ShortcutCombo; display: string } | null {
  const parts = str.split('+').map(p => p.trim())
  const key = parts.pop()
  if (!key) return null
  const combo: ShortcutCombo = { key }
  const prefix: string[] = []
  for (const p of parts) {
    const lower = p.toLowerCase()
    if (lower === 'cmd' || lower === 'meta' || lower === 'command' || lower === '⌘') {
      combo.meta = true
      prefix.push(IS_MAC ? '⌘' : 'Ctrl')
    } else if (lower === 'ctrl' || lower === '⌃') {
      combo.ctrl = true
      prefix.push(IS_MAC ? '^' : 'Ctrl')
    } else if (lower === 'alt' || lower === '⌥') {
      combo.alt = true
      prefix.push(IS_MAC ? '⌥' : 'Alt')
    } else if (lower === 'shift' || lower === '⇧') {
      combo.shift = true
      prefix.push(IS_MAC ? '⇧' : 'Shift')
    } else {
      return null
    }
  }
  const display = `${prefix.join('+')}+${key.toUpperCase()}`
  return { combo, display }
}

export function eventMatches(e: KeyboardEvent, combo: ShortcutCombo): boolean {
  if (e.key.toLowerCase() !== combo.key.toLowerCase()) return false
  if (e.altKey !== !!combo.alt) return false
  if (e.shiftKey !== !!combo.shift) return false
  if (IS_MAC) {
    if (e.metaKey !== !!combo.meta) return false
    if (e.ctrlKey !== !!combo.ctrl) return false
  } else {
    // Windows/Linux: Cmd maps to Ctrl (CtrlOrCmd). Treat both combo.meta and combo.ctrl
    // as requiring Ctrl (or Meta/Win key) — preserves existing 'cmd+k' definitions on Windows.
    const wantCtrl = !!combo.meta || !!combo.ctrl
    const hasCtrl = e.ctrlKey || e.metaKey
    if (hasCtrl !== wantCtrl) return false
  }
  return true
}

// ── Global shortcut registry ──────────────────────────────────────────
// xterm.js captures Ctrl+key events internally and sends them to the PTY
// before the document keydown handler fires. On Windows, this means Ctrl+D
// becomes ^D in the terminal instead of triggering the app shortcut.
// The xterm attachCustomKeyEventHandler queries this registry to intercept
// registered app shortcuts before xterm processes them.
const shortcutCombos: ShortcutCombo[] = []

export function registerShortcutCombos(combos: ShortcutCombo[]): void {
  shortcutCombos.length = 0
  shortcutCombos.push(...combos)
}

export function eventMatchesRegisteredAppShortcut(e: KeyboardEvent): boolean {
  if (!IS_MAC && !(e.ctrlKey || e.metaKey)) return false
  if (IS_MAC && !e.metaKey) return false
  for (const combo of shortcutCombos) {
    if (eventMatches(e, combo)) return true
  }
  return false
}