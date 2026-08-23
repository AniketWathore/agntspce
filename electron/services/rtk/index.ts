export * from './utils'
export * from './tomlFilter'
export * from './filters'

import { FilterRegistry } from './tomlFilter'
import { BUILTIN_FILTERS } from './filters'

let _registry: FilterRegistry | null = null

export function getRegistry(): FilterRegistry {
  if (!_registry) {
    _registry = new FilterRegistry()
    for (const [name, def] of Object.entries(BUILTIN_FILTERS)) {
      _registry.addFilter(name, def)
    }
  }
  return _registry
}

export function filterCommandOutput(command: string, output: string): { filtered: string; filterName: string | null } {
  return getRegistry().apply(command, output)
}

export function hasSpecificFilter(command: string): boolean {
  return getRegistry().hasSpecificFilter(command)
}
