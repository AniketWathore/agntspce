import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const TEE_DIR = path.join(os.homedir(), '.local', 'share', 'rtk', 'tee')

function ensureTeeDir(): void {
  try { fs.mkdirSync(TEE_DIR, { recursive: true }) } catch { }
}

export function teeAndHint(raw: string, label: string, exitCode: number): string | undefined {
  if (exitCode === 0) return undefined
  ensureTeeDir()
  const timestamp = Date.now()
  const filename = `${timestamp}-${label.replace(/[^a-zA-Z0-9_-]/g, '_')}.raw`
  const filepath = path.join(TEE_DIR, filename)
  try {
    fs.writeFileSync(filepath, raw, 'utf-8')
    if (exitCode !== 0) {
      return `[hint: full output saved to ${filepath}]`
    }
  } catch { }
  return undefined
}
