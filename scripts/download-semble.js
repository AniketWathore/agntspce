#!/usr/bin/env node

/**
 * download-semble.js
 *
 * Downloads a prebuilt agntspce-search portable distribution for the
 * current platform from GitHub Releases and extracts it to <project>/search/.
 *
 * Falls back gracefully if no release URL is configured yet.
 *
 * Usage:  node scripts/download-semble.js
 * Env:    SEARCH_VERSION=0.1.0     (default: 0.1.0)
 *         SEARCH_BASE_URL=...      (default: GitHub releases URL)
 */

import { existsSync, mkdirSync, createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const SEARCH_DIR = join(PROJECT_DIR, 'search')

// ── Config ───────────────────────────────────────────────────────
const VERSION = process.env.SEARCH_VERSION || '0.1.0'

// Platform mapping: Node process.arch/process.platform → archive suffix
const ARCH_MAP = {
  'darwin:arm64': 'darwin-arm64',
  'darwin:x64':   'darwin-x64',
  'linux:x64':    'linux-x86_64',
  'linux:arm64':  'linux-aarch64',
  'win32:x64':    'win32-x86_64',
}

const platformKey = `${process.platform}:${process.arch}`
const archSuffix = ARCH_MAP[platformKey]
if (!archSuffix) {
  console.log(`[agntspce] No prebuilt search for ${platformKey} — run scripts/build-semble.sh`)
  process.exit(0)
}

const BASE_URL = process.env.SEARCH_BASE_URL ||
  `https://github.com/prashik/agntspce-releases/releases/download/search-v${VERSION}`

const ARCHIVE_NAME = `agntspce-search-${archSuffix}-${VERSION}.tar.gz`
const FULL_URL = `${BASE_URL}/${ARCHIVE_NAME}`

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  if (existsSync(join(SEARCH_DIR, 'VERSION'))) {
    const current = require('fs').readFileSync(join(SEARCH_DIR, 'VERSION'), 'utf-8').trim()
    if (current === VERSION && existsSync(join(SEARCH_DIR, 'python', 'bin', 'agntspce-search'))) {
      console.log(`[agntspce] Search v${current} already present — skipping download`)
      return
    }
  }

  const scratch = join(PROJECT_DIR, `search-download-${Date.now()}`)
  const archivePath = join(scratch, ARCHIVE_NAME)

  try {
    mkdirSync(scratch, { recursive: true })

    console.log(`[agntspce] Downloading search v${VERSION} (${ARCHIVE_NAME})...`)
    console.log(`  URL: ${FULL_URL}`)

    const response = await fetch(FULL_URL)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength) {
      console.log(`  Archive size: ${(Number(contentLength) / 1e6).toFixed(0)}MB`)
    }

    // Stream download
    const fileStream = createWriteStream(archivePath)
    await pipeline(response.body, fileStream)
    console.log('  Downloaded, extracting...')

    // Extract
    const result = spawnSync('tar', ['xzf', archivePath, '-C', scratch], {
      stdio: 'inherit',
      encoding: 'utf-8',
      timeout: 120000,
    })

    if (result.status !== 0) {
      throw new Error(`tar extract failed (exit ${result.status})`)
    }

    // Find extracted directory (might have different name)
    const extracted = join(scratch, `agntspce-search-${archSuffix}-${VERSION}`)
    const extractedAlt = join(scratch, 'agntspce-search-dist')
    const extractedSearch = join(scratch, 'search')
    let srcDir = ''
    if (existsSync(extracted)) srcDir = extracted
    else if (existsSync(extractedAlt)) srcDir = extractedAlt
    else if (existsSync(extractedSearch)) srcDir = extractedSearch
    else {
      // Scan for a directory with 'python/bin/agntspce-search'
      const { readdirSync } = await import('node:fs')
      for (const entry of readdirSync(scratch)) {
        const candidate = join(scratch, entry)
        if (existsSync(join(candidate, 'python', 'bin', 'agntspce-search'))) {
          srcDir = candidate
          break
        }
      }
    }

    if (!srcDir) {
      throw new Error('Could not find extracted search directory')
    }

    // Remove old and move new
    await import('node:fs/promises').then(fs =>
      Promise.all([
        fs.rm(SEARCH_DIR, { recursive: true, force: true }).catch(() => {}),
        fs.rename(srcDir, SEARCH_DIR),
      ])
    )

    // Fix permissions
    const binPath = join(SEARCH_DIR, 'python', 'bin', 'agntspce-search')
    if (existsSync(binPath)) {
      await import('node:fs/promises').then(fs => fs.chmod(binPath, 0o755))
    }

    console.log(`[agntspce] Search v${VERSION} installed → ${SEARCH_DIR}`)
    console.log(`  Size: ${(await import('node:fs/promises')).stat(SEARCH_DIR).then(s => 'N/A')}`)
  } catch (err) {
    console.warn(`[agntspce] Search download failed: ${err.message}`)
    console.warn(`[agntspce] Run "bash scripts/build-semble.sh" to build from source`)
  } finally {
    await import('node:fs/promises').then(fs =>
      fs.rm(scratch, { recursive: true, force: true }).catch(() => {})
    )
  }
}

main().catch(() => process.exit(1))
