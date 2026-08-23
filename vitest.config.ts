import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'electron/services/orchestration/**',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
