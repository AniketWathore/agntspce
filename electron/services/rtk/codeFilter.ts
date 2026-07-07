export type FilterLevel = 'none' | 'minimal' | 'aggressive'

export type Language =
  | 'rust'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'c'
  | 'cpp'
  | 'java'
  | 'ruby'
  | 'shell'
  | 'data'
  | 'unknown'

const EXT_MAP: Record<string, Language> = {
  rs: 'rust',
  py: 'python', pyw: 'python',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  go: 'go',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  java: 'java',
  rb: 'ruby',
  sh: 'shell', bash: 'shell', zsh: 'shell',
}

const DATA_EXTENSIONS = new Set([
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv',
  'graphql', 'gql', 'sql', 'md', 'markdown', 'txt', 'env', 'lock',
])

export function detectLanguage(ext: string): Language {
  const lower = ext.toLowerCase()
  if (DATA_EXTENSIONS.has(lower)) return 'data'
  return EXT_MAP[lower] || 'unknown'
}

interface CommentPatterns {
  line: string | null
  blockStart: string | null
  blockEnd: string | null
  docLine: string | null
  docBlockStart: string | null
}

function getCommentPatterns(lang: Language): CommentPatterns {
  switch (lang) {
    case 'rust':
      return { line: '//', blockStart: '/*', blockEnd: '*/', docLine: '///', docBlockStart: '/**' }
    case 'python':
      return { line: '#', blockStart: '"""', blockEnd: '"""', docLine: null, docBlockStart: '"""' }
    case 'javascript':
    case 'typescript':
    case 'go':
    case 'c':
    case 'cpp':
    case 'java':
      return { line: '//', blockStart: '/*', blockEnd: '*/', docLine: null, docBlockStart: '/**' }
    case 'ruby':
      return { line: '#', blockStart: '=begin', blockEnd: '=end', docLine: null, docBlockStart: null }
    case 'shell':
      return { line: '#', blockStart: null, blockEnd: null, docLine: null, docBlockStart: null }
    case 'data':
      return { line: null, blockStart: null, blockEnd: null, docLine: null, docBlockStart: null }
    default:
      return { line: '//', blockStart: '/*', blockEnd: '*/', docLine: null, docBlockStart: null }
  }
}

export interface FilterStrategy {
  filter(content: string, lang: Language): string
}

export class NoFilter implements FilterStrategy {
  filter(content: string, _lang: Language): string {
    return content
  }
}

export class MinimalFilter implements FilterStrategy {
  filter(content: string, lang: Language): string {
    const patterns = getCommentPatterns(lang)
    const lines = content.split('\n')
    const result: string[] = []
    let inBlockComment = false
    let inDocstring = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (patterns.blockStart && patterns.blockEnd) {
        if (!inDocstring && trimmed.includes(patterns.blockStart) &&
            !(patterns.docBlockStart && trimmed.startsWith(patterns.docBlockStart))) {
          inBlockComment = true
        }
        if (inBlockComment) {
          if (trimmed.includes(patterns.blockEnd)) inBlockComment = false
          continue
        }
      }

      if (lang === 'python' && trimmed.startsWith('"""')) {
        inDocstring = !inDocstring
        result.push(line)
        continue
      }
      if (inDocstring) {
        result.push(line)
        continue
      }

      if (patterns.line && trimmed.startsWith(patterns.line)) {
        if (patterns.docLine && trimmed.startsWith(patterns.docLine)) {
          result.push(line)
        }
        continue
      }

      result.push(line)
    }

    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }
}

export class AggressiveFilter implements FilterStrategy {
  private static IMPORT_RE = /^(use |import |from |require\(|#include)/
  private static FUNC_RE = /^(pub\s+)?(async\s+)?(fn|def|function|func|class|struct|enum|trait|interface|type)\s+\w+/

  filter(content: string, lang: Language): string {
    if (lang === 'data') return new MinimalFilter().filter(content, lang)

    const minimal = new MinimalFilter().filter(content, lang)
    const lines = minimal.split('\n')
    const result: string[] = []
    let braceDepth = 0
    let inImplBody = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (AggressiveFilter.IMPORT_RE.test(trimmed)) {
        result.push(line)
        continue
      }

      if (AggressiveFilter.FUNC_RE.test(trimmed)) {
        result.push(line)
        inImplBody = true
        braceDepth = 0
        continue
      }

      const openBraces = (trimmed.match(/\{/g) || []).length
      const closeBraces = (trimmed.match(/\}/g) || []).length

      if (inImplBody) {
        braceDepth += openBraces - closeBraces
        if (braceDepth <= 1 && (trimmed === '{' || trimmed === '}' || trimmed.endsWith('{'))) {
          result.push(line)
        }
        if (braceDepth <= 0) {
          inImplBody = false
          if (trimmed && trimmed !== '}') result.push('    // ... implementation')
        }
        continue
      }

      if (/^(const |static |let |pub const |pub static )/.test(trimmed)) {
        result.push(line)
      }
    }

    return result.join('\n').trim()
  }
}

export function getFilter(level: FilterLevel): FilterStrategy {
  switch (level) {
    case 'none': return new NoFilter()
    case 'minimal': return new MinimalFilter()
    case 'aggressive': return new AggressiveFilter()
  }
}

export function smartTruncate(content: string, maxLines: number, _lang: Language): string {
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content

  const result: string[] = []
  let keptLines = 0
  const IMPORT_RE = /^(use |import |from |require\(|#include)/
  const FUNC_RE = /^(pub\s+)?(async\s+)?(fn|def|function|func|class|struct|enum|trait|interface|type)\s+\w+/

  for (const line of lines) {
    const trimmed = line.trim()
    const isImportant = FUNC_RE.test(trimmed) || IMPORT_RE.test(trimmed) ||
      trimmed.startsWith('pub ') || trimmed.startsWith('export ') ||
      trimmed === '}' || trimmed === '{'

    if (isImportant || keptLines < maxLines / 2) {
      result.push(line)
      keptLines++
    }
    if (keptLines >= maxLines - 1) break
  }

  result.push(`[${lines.length - keptLines} more lines]`)
  return result.join('\n')
}
