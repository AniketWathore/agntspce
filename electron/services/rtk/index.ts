export * from './utils'
export * from './guard'
export * from './constants'
export * from './tee'
export * from './tracking'
export * from './stream'
export * from './runner'
export * from './tomlFilter'
export * from './codeFilter'
export * from './filters'

import { FilterRegistry } from './tomlFilter'
import { BUILTIN_FILTERS } from './filters'
import { Tracker } from './tracking'

let _registry: FilterRegistry | null = null
let _tracker: Tracker | null = null

export function getRegistry(): FilterRegistry {
  if (!_registry) {
    _registry = new FilterRegistry()
    for (const [name, def] of Object.entries(BUILTIN_FILTERS)) {
      _registry.addFilter(name, def)
    }
  }
  return _registry
}

export function getTracker(): Tracker {
  if (!_tracker) _tracker = new Tracker()
  return _tracker
}

export function detectCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const parts = trimmed.split(/\s+/)
  if (parts.length === 0) return null
  return { command: parts[0], args: parts.slice(1) }
}

export function filterCommandOutput(command: string, output: string): { filtered: string; filterName: string | null } {
  return getRegistry().apply(command, output)
}

export function hasSpecificFilter(command: string): boolean {
  return getRegistry().hasSpecificFilter(command)
}
