import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // vite-plugin-electron builds preload in library mode and picks
            // the output format from build.lib.formats (because package.json
            // has "type": "module", it defaults to ["es"]). Overriding
            // rollupOptions.output.format alone does NOT change this, since
            // lib-mode formats win over rollupOptions.output.format here.
            // Preload always needs to run as CJS in Electron's sandboxed
            // preload context, regardless of the app's own module type.
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
              fileName: () => '[name].js',
            },
            rollupOptions: {
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
})