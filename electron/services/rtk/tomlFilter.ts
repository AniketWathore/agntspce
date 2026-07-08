import { stripAnsi, truncate } from './utils'

export interface MatchOutputRule {
  pattern: string
  message: string
  unless?: string
}

export interface ReplaceRule {
  pattern: string
  replacement: string
}

export interface FilterDefinition {
  description?: string
  matchCommand: string
  stripAnsi?: boolean
  replace?: ReplaceRule[]
  matchOutput?: MatchOutputRule[]
  stripLinesMatching?: string[]
  keepLinesMatching?: string[]
  truncateLinesAt?: number
  headLines?: number
  tailLines?: number
  maxLines?: number
  onEmpty?: string
}

export interface CompiledFilter {
  name: string
  description?: string
  matchRegex: RegExp
  stripAnsi: boolean
  replace: CompiledReplaceRule[]
  matchOutput: CompiledMatchOutputRule[]
  lineFilter: LineFilter
  truncateLinesAt?: number
  headLines?: number
  tailLines?: number
  maxLines?: number
  onEmpty?: string
}

export interface CompiledMatchOutputRule {
  pattern: RegExp
  message: string
  unless: RegExp | null
}

export interface CompiledReplaceRule {
  pattern: RegExp
  replacement: string
}

export type LineFilter = { type: 'none' } | { type: 'strip'; patterns: RegExp[] } | { type: 'keep'; patterns: RegExp[] }

export function compileFilter(name: string, def: FilterDefinition): CompiledFilter {
  if (def.stripLinesMatching && def.stripLinesMatching.length > 0 &&
      def.keepLinesMatching && def.keepLinesMatching.length > 0) {
    throw new Error(`filter '${name}': stripLinesMatching and keepLinesMatching are mutually exclusive`)
  }

  const matchRegex = new RegExp(def.matchCommand)

  const replace = (def.replace || []).map(r => ({
    pattern: new RegExp(r.pattern, 'g'),
    replacement: r.replacement,
  }))

  const matchOutput = (def.matchOutput || []).map(r => ({
    pattern: new RegExp(r.pattern),
    message: r.message,
    unless: r.unless ? new RegExp(r.unless) : null,
  }))

  let lineFilter: LineFilter = { type: 'none' }
  if (def.stripLinesMatching && def.stripLinesMatching.length > 0) {
    lineFilter = {
      type: 'strip',
      patterns: def.stripLinesMatching.map(p => new RegExp(p)),
    }
  } else if (def.keepLinesMatching && def.keepLinesMatching.length > 0) {
    lineFilter = {
      type: 'keep',
      patterns: def.keepLinesMatching.map(p => new RegExp(p)),
    }
  }

  return {
    name,
    description: def.description,
    matchRegex,
    stripAnsi: def.stripAnsi || false,
    replace,
    matchOutput,
    lineFilter,
    truncateLinesAt: def.truncateLinesAt,
    headLines: def.headLines,
    tailLines: def.tailLines,
    maxLines: def.maxLines,
    onEmpty: def.onEmpty,
  }
}

export function findFilterIn(command: string, filters: CompiledFilter[]): CompiledFilter | undefined {
  return filters.find(f => f.matchRegex.test(command))
}

export function applyFilter(filter: CompiledFilter, stdout: string): string {
  let lines: string[] = stdout.split('\n')

  if (filter.stripAnsi) {
    lines = lines.map(l => stripAnsi(l))
  }

  if (filter.replace.length > 0) {
    lines = lines.map(line => {
      let result = line
      for (const rule of filter.replace) {
        result = result.replace(rule.pattern, rule.replacement)
      }
      return result
    })
  }

  if (filter.matchOutput.length > 0) {
    const blob = lines.join('\n')
    for (const rule of filter.matchOutput) {
      if (rule.pattern.test(blob)) {
        if (rule.unless && rule.unless.test(blob)) continue
        return rule.message
      }
    }
  }

  if (filter.lineFilter.type === 'strip') {
    lines = lines.filter(line => !filter.lineFilter!.patterns.some(p => p.test(line)))
  } else if (filter.lineFilter.type === 'keep') {
    lines = lines.filter(line => filter.lineFilter!.patterns.some(p => p.test(line)))
  }

  if (filter.truncateLinesAt !== undefined) {
    lines = lines.map(l => truncate(l, filter.truncateLinesAt!))
  }

  const total = lines.length
  if (filter.headLines !== undefined && filter.tailLines !== undefined) {
    if (total > filter.headLines + filter.tailLines) {
      const head = lines.slice(0, filter.headLines)
      const tail = lines.slice(total - filter.tailLines)
      lines = [...head, `... (${total - filter.headLines - filter.tailLines} lines omitted)`, ...tail]
    }
  } else if (filter.headLines !== undefined) {
    if (total > filter.headLines) {
      lines = [...lines.slice(0, filter.headLines), `... (${total - filter.headLines} lines omitted)`]
    }
  } else if (filter.tailLines !== undefined) {
    if (total > filter.tailLines) {
      lines = [`... (${total - filter.tailLines} lines omitted)`, ...lines.slice(total - filter.tailLines)]
    }
  }

  if (filter.maxLines !== undefined && lines.length > filter.maxLines) {
    const truncated = lines.length - filter.maxLines
    lines = [...lines.slice(0, filter.maxLines), `... (${truncated} lines truncated)`]
  }

  const result = lines.join('\n')
  if (result.trim() === '' && filter.onEmpty !== undefined) {
    return filter.onEmpty
  }

  return result
}

export class FilterRegistry {
  filters: CompiledFilter[] = []

  constructor(filters?: CompiledFilter[]) {
    if (filters) this.filters = filters
  }

  addFilter(name: string, def: FilterDefinition): void {
    try {
      const compiled = compileFilter(name, def)
      this.filters.push(compiled)
    } catch (e) {
      console.warn(`[filter] warning: filter '${name}' compilation error:`, e)
    }
  }

  findFilter(command: string): CompiledFilter | undefined {
    return findFilterIn(command, this.filters)
  }

  /// Check if a command matches any non-catch-all filter.
  /// Used by processCommandLine to distinguish shell commands from natural-language prompts.
  hasSpecificFilter(command: string): boolean {
    for (const filter of this.filters) {
      if (filter.name === 'strip-ansi') continue
      if (filter.matchRegex.test(command)) return true
    }
    return false
  }

  apply(command: string, output: string): { filtered: string; filterName: string | null } {
    const filter = this.findFilter(command)
    if (!filter) return { filtered: output, filterName: null }
    const filtered = applyFilter(filter, output)
    return { filtered, filterName: filter.name }
  }
}
