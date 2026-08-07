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
  const cmdDown = e.metaKey || (IS_MAC ? false : e.ctrlKey)
  const wantCmd = !!combo.meta
  if (e.ctrlKey !== !!combo.ctrl) return false
  if (e.altKey !== !!combo.alt) return false
  if (e.shiftKey !== !!combo.shift) return false
  return cmdDown === wantCmd
}