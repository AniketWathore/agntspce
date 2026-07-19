import { platform } from 'os'
import { existsSync, rmSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

if (platform() !== 'win32') {
  process.exit(0)
}

// .cmd shims handle all wrapping — the .exe wrappers are unnecessary and
// PATHEXT resolves .EXE before .CMD, so they shadow the working shims.
// Clean up any stale .exe wrappers left from previous builds.
const __dirname = dirname(fileURLToPath(import.meta.url))
const STALE_WRAPPERS = ['agntspce', 'cargo', 'docker', 'git', 'kubectl', 'ls', 'make', 'npm', 'pip', 'pytest', 'terraform', 'wrapper']
for (const name of STALE_WRAPPERS) {
  const p = join(__dirname, name + '.exe')
  if (existsSync(p)) {
    rmSync(p)
    console.log(`[compile-wrappers] Removed stale wrapper: ${name}.exe`)
  }
}
console.log('[compile-wrappers] .cmd shims active — .exe wrappers deleted')
