export function formatCommand(command: string, args: string[], prefix?: string): string {
  const cmdStr = `${command} ${args.join(' ')}`.trim()
  const p = prefix || 'agntspce'
  return `${p} $ ${cmdStr}`
}
