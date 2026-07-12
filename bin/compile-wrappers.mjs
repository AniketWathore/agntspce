import { execSync } from 'child_process'
import { platform } from 'os'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

if (platform() !== 'win32') {
  process.exit(0)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const psScript = join(__dirname, 'compile-wrappers.ps1')
if (!existsSync(psScript)) {
  console.error('compile-wrappers.ps1 not found at', psScript)
  process.exit(1)
}

try {
  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`,
    { stdio: 'inherit' }
  )
} catch (e) {
  console.error('Failed to compile wrapper executables:', e.message)
  process.exit(1)
}
