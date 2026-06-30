import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { copyFileSync, mkdirSync, existsSync, readdirSync, chmodSync, constants } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function postBuildPlugin(): Plugin {
  return {
    name: 'post-build-copy',
    closeBundle() {
      // Copy node-pty native prebuilds to dist-electron/
      const src = join(__dirname, 'node_modules', 'node-pty', 'prebuilds')
      const dest = join(__dirname, 'dist-electron', 'prebuilds')
      if (existsSync(src)) {
        mkdirSync(dest, { recursive: true })
        for (const entry of readdirSync(src, { withFileTypes: true })) {
          const srcDir = join(src, entry.name)
          const destDir = join(dest, entry.name)
          mkdirSync(destDir, { recursive: true })
          for (const file of readdirSync(srcDir, { withFileTypes: true })) {
            if (file.isFile()) {
              copyFileSync(join(srcDir, file.name), join(destDir, file.name))
              // Ensure executable bits for native binaries (pty.node, spawn-helper)
              try { chmodSync(join(destDir, file.name), constants.S_IRWXU | constants.S_IRGRP | constants.S_IXGRP | constants.S_IROTH | constants.S_IXOTH) } catch {}
            }
          }
        }
      }

      // Copy CJS preload script (overwrites any ESM output from Vite)
      copyFileSync(
        join(__dirname, 'electron', 'preload.cjs'),
        join(__dirname, 'dist-electron', 'preload.js')
      )
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
        },
      },
    ]),
    renderer(),
    postBuildPlugin(),
  ],
})
