import { useMemo } from 'react'

interface DiffLine {
  type: 'add' | 'del' | 'header' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

interface Props {
  diff: string
  filename?: string
  maxLines?: number
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n')
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of lines) {
    const line = raw
    if (line.startsWith('@@')) {
      result.push({ type: 'header', content: line })
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1]) - 1
        newLine = parseInt(match[2]) - 1
      }
      continue
    }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff --git')) {
      result.push({ type: 'header', content: line })
      continue
    }
    if (line.startsWith('+')) {
      newLine++
      result.push({ type: 'add', content: line.slice(1), newLine })
    } else if (line.startsWith('-')) {
      oldLine++
      result.push({ type: 'del', content: line.slice(1), oldLine })
    } else {
      oldLine++
      newLine++
      result.push({ type: 'context', content: line, oldLine, newLine })
    }
  }
  return result
}

export default function DiffViewer({ diff, filename, maxLines = 500 }: Props) {
  const parsed = useMemo(() => {
    const lines = parseDiff(diff)
    return lines.length > maxLines
      ? [...lines.slice(0, maxLines), { type: 'header' as const, content: `... (${lines.length - maxLines} more lines)` }]
      : lines
  }, [diff, maxLines])

  const adds = parsed.filter(l => l.type === 'add').length
  const dels = parsed.filter(l => l.type === 'del').length

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-header">
        {filename && <span className="diff-filename">{filename}</span>}
        <span className="diff-stats">
          <span className="diff-stat-add">+{adds}</span>
          <span className="diff-stat-del">-{dels}</span>
          <span className="diff-stat-total">{parsed.length} lines</span>
        </span>
      </div>
      <div className="diff-viewer-content">
        {parsed.map((line, i) => (
          <div key={i} className={`diff-line diff-line-${line.type}`}>
            <span className="diff-line-number">
              {line.type === 'add' ? `  ${line.newLine}` : line.type === 'del' ? `${line.oldLine}  ` : line.oldLine ? `${line.oldLine} ${line.newLine}` : ''}
            </span>
            <span className="diff-line-prefix">
              {line.type === 'add' ? '+' : line.type === 'del' ? '-' : line.type === 'header' ? '@' : ' '}
            </span>
            <span className="diff-line-content">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
