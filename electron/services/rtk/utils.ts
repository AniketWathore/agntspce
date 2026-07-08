let ansiRegex: RegExp | null = null
function getAnsiRegex(): RegExp {
  if (!ansiRegex) {
    ansiRegex = new RegExp(
      '(?:' +
      '\\x1b\\[[\\x30-\\x3f]*[\\x20-\\x2f]*[\\x40-\\x7e]|' +
      '\\x1b\\][\\s\\S]*?(?:\\x1b\\\\|\\x07|\\x1b)|' +
      '\\x1b[PX^_][\\s\\S]*?(?:\\x1b\\\\|\\x07)|' +
      '\\x1b[\\x40-\\x5f]|' +
      '[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\x80-\\x9f]' +
      ')',
      'g'
    )
  }
  return ansiRegex
}

export function stripAnsi(text: string): string {
  return text.replace(getAnsiRegex(), '')
}

export function stripAllControl(text: string): string {
  return text
    .replace(getAnsiRegex(), '')
    .replace(/[\u200b-\u200f\u2028-\u202f\ufeff]/g, '')
    .replace(/[⬝⬞▪▫◆◇◈◉◊○◌◍◎●◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◢◣◤◥◦◧◨◩◪◫◬◭◮◯⣀⣁⣂⣃⣄⣅⣆⣇⣈⣉⣊⣋⣌⣍⣎⣏⣐⣑⣒⣓⣔⣕⣖⣗⣘⣙]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/(?<!\n)\r(?!\n)/g, '\n')
    .replace(/[\x00\x08\x0b\x0c\x0e\x0f]/g, '')
}

export function truncate(s: string, maxLen: number): string {
  const charCount = [...s].length
  if (charCount <= maxLen) return s
  if (maxLen < 3) return '...'
  return [...s].slice(0, maxLen - 3).join('') + '...'
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

export function formatUsd(amount: number): string {
  if (!isFinite(amount)) return '$0.00'
  if (amount >= 0.01) return `$${amount.toFixed(2)}`
  return `$${amount.toFixed(4)}`
}

export function formatCpt(cpt: number): string {
  if (!isFinite(cpt) || cpt <= 0) return '$0.00/MTok'
  return `$${(cpt * 1_000_000).toFixed(2)}/MTok`
}

export function joinWithOverflow(items: string[], total: number, max: number, label: string): string {
  let out = items.join('\n')
  if (total > max) out += `\n… +${total - max} more ${label}`
  return out
}

export function okConfirmation(action: string, detail: string): string {
  return detail ? `ok ${action} ${detail}` : `ok ${action}`
}

export function humanBytes(bytes: number): string {
  const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024
  if (bytes >= TB) return `${(bytes / TB).toFixed(1)} TB`
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`
  return `${bytes} B`
}

export function shortenArn(arn: string): string {
  const slashResult = arn.split('/').pop() || arn
  if (slashResult === arn) return arn.split(':').pop() || arn
  return slashResult
}

export function detectPackageManager(): string {
  const fs = require('fs')
  if (fs.existsSync('pnpm-lock.yaml')) return 'pnpm'
  if (fs.existsSync('yarn.lock')) return 'yarn'
  return 'npm'
}

export function toolExists(name: string): boolean {
  try {
    const { execSync } = require('child_process')
    if (process.platform === 'win32') {
      execSync(`where ${name}`, { stdio: 'ignore' })
    } else {
      execSync(`which ${name}`, { stdio: 'ignore' })
    }
    return true
  } catch {
    return false
  }
}
