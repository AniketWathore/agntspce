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
    .replace(/\[\d+(?:;\d+)*[A-Za-z]/g, '')
}

export function truncate(s: string, maxLen: number): string {
  const charCount = [...s].length
  if (charCount <= maxLen) return s
  if (maxLen < 3) return '...'
  return [...s].slice(0, maxLen - 3).join('') + '...'
}

// Estimate LLM tokens from text. Strip ANSI/control/zero-width characters first
// so terminal TUI redraws and cursor sequences never inflate token counts.
export function estimateTokens(text: string): number {
  const clean = String(text || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][\s\S]*?(?:\x1b\\|\x07|\x1b)/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x80-\x9f]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u200b-\u200f\u2028-\u202f\ufeff]/g, '')
  return Math.max(1, Math.ceil(clean.length / 4))
}
