export function formatCommand(command: string, args: string[]): string {
  const cmdStr = `${command} ${args.join(' ')}`.trim()
  return `agntspce $ ${cmdStr}`
}
