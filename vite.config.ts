import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
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
        copyPreload()

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
              }
            }
          }
        }
      } catch (e) {
        console.error('[post-build] Error in closeBundle:', e)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['node-pty'],
            } as any,
          },
          plugins: [postBuildPlugin()],
        },
      },
    ]),
    renderer(),
  ],
})
