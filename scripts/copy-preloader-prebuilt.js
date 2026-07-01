import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'node_modules', 'node-pty', 'prebuilds')
const dest = join(root, 'dist-electron', 'prebuilds')

if (existsSync(src)) {
  mkdirSync(dest, { recursive: true })

  const entries = readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcDir = join(src, entry.name)
    const destDir = join(dest, entry.name)
    mkdirSync(destDir, { recursive: true })
    const files = readdirSync(srcDir)
    for (const file of files) {
      copyFileSync(join(srcDir, file), join(destDir, file))
    }
  }
  console.log('Copied node-pty prebuilds to dist-electron/prebuilds/')
}
