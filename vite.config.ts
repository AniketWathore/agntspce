import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { copyFileSync, mkdirSync, existsSync, readdirSync, chmodSync, cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function copyPreload(): void {
  const src = join(__dirname, 'electron', 'preload.cjs')
  const dest = join(__dirname, 'dist-electron', 'preload.js')
  try {
    mkdirSync(join(__dirname, 'dist-electron'), { recursive: true })
    copyFileSync(src, dest)
    console.log('[post-build] Copied preload.cjs → dist-electron/preload.js')
  } catch (e) {
    console.error('[post-build] Failed to copy preload:', e)
  }
}

function postBuildPlugin(): Plugin {
  return {
    name: 'post-build-copy',
    closeBundle() {
      try {
        // Copy node-pty native prebuilds to dist-electron/
        const src = join(__dirname, 'node_modules', 'node-pty', 'prebuilds')
        const dest = join(__dirname, 'dist-electron', 'prebuilds')
        if (existsSync(src)) {
          mkdirSync(dest, { recursive: true })
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            const srcDir = join(src, entry.name)
            const destDir = join(dest, entry.name)
            mkdirSync(destDir, { recursive: true })
            for (const file of readdirSync(srcDir, { withFileTypes: true })) {
              if (file.isFile()) {
                copyFileSync(join(srcDir, file.name), join(destDir, file.name))
                if (file.name === 'spawn-helper') {
                  try { chmodSync(join(destDir, file.name), 0o755) } catch {}
                }
              }
            }
          }
        } else {
          console.warn('[post-build] node-pty prebuilds not found at', src)
        }
        // Copy RTK binary + wrapper scripts to dist-electron/rtk/
        const rtkDir = join(__dirname, 'dist-electron', 'rtk')
        mkdirSync(rtkDir, { recursive: true })
        const isWin = process.platform === 'win32'
        const rtkFiles = isWin ? ['rtk.exe'] : ['rtk']
        const filesToCopy = [...rtkFiles, 'agntspce', 'agntspce.mjs']
        if (isWin) {
          filesToCopy.push('agntspce.cmd', 'git.cmd', 'ls.cmd')
        }
        for (const file of filesToCopy) {
          const srcFile = join(__dirname, 'bin', file)
          if (existsSync(srcFile)) {
            copyFileSync(srcFile, join(rtkDir, file))
            try { chmodSync(join(rtkDir, file), 0o755) } catch {}
            console.log(`[post-build] Copied bin/${file} → dist-electron/rtk/${file}`)
          }
        }
        // Copy search distribution to dist-electron/search/ for production
        const searchDir = join(__dirname, 'search')
        const searchDest = join(__dirname, 'dist-electron', 'search')
        if (existsSync(searchDir)) {
          rmSync(searchDest, { recursive: true, force: true })
          cpSync(searchDir, searchDest, { recursive: true })
          // Create PYTHONHOME-aware wrapper in the built copy
          const binPath = join(searchDest, 'python', 'bin', 'agntspce-search')
          const pythonBin = join(searchDest, 'python', 'bin', 'python3')
          if (existsSync(binPath) && existsSync(pythonBin) && process.platform !== 'win32') {
            const pyPath = binPath + '.py'
            try {
              const content = readFileSync(binPath, 'utf-8')
              if (content.startsWith('#!')) {
                writeFileSync(pyPath, content, 'utf-8')
                chmodSync(pyPath, 0o755)
              }
            } catch {}
            const wrapper = `#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONHOME="$SCRIPT_DIR/.."
exec "$SCRIPT_DIR/python3" "${pyPath}" "$@"
`
            writeFileSync(binPath, wrapper, 'utf-8')
            chmodSync(binPath, 0o755)
          }
          console.log('[post-build] Copied search/ → dist-electron/search/')
        } else {
          console.warn('[post-build] search/ not found — skipping copy')
        }

        copyPreload()
      } catch (e) {
        console.error('[post-build] Error in closeBundle:', e)
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          plugins: [postBuildPlugin()],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['node-pty'],
            } as any,
          },
        },
      },
    ]),
    renderer(),
  ],
})
