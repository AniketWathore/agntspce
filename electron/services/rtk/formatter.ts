import path from 'path'

export function formatCommand(command: string, args: string[], prefix?: string): string {
  const normalized = path.isAbsolute(command) ? path.basename(command) : command
  const cmdStr = `${normalized} ${args.join(' ')}`.trim()
  const p = prefix || 'agntspce'
  return `${p} $ ${cmdStr}`
}
