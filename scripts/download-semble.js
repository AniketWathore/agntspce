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

import { existsSync, mkdirSync, createWriteStream, readFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const SEARCH_DIR = join(PROJECT_DIR, 'search')
const PACKAGES_DIR = join(PROJECT_DIR, 'packages')

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

const ARCHIVE_NAME = `agntspce-search-${archSuffix}-${VERSION}.tar.gz`
const LOCAL_PACKAGE = join(PACKAGES_DIR, ARCHIVE_NAME)
const BASE_URL = process.env.SEARCH_BASE_URL ||
  `https://github.com/AniketWathore/agntspce/releases/download/search-v${VERSION}`
const FULL_URL = `${BASE_URL}/${ARCHIVE_NAME}`



// ── Main ─────────────────────────────────────────────────────────
function binaryExists(dir) {
  if (existsSync(join(dir, 'python', 'bin', 'agntspce-search'))) return true
  if (process.platform === 'win32') {
    if (existsSync(join(dir, 'python', 'Scripts', 'agntspce-search.exe'))) return true
    if (existsSync(join(dir, 'python', 'Scripts', 'agntspce-search'))) return true
  }
  return false
}

async function main() {
  if (existsSync(join(SEARCH_DIR, 'VERSION'))) {
    const current = readFileSync(join(SEARCH_DIR, 'VERSION'), 'utf-8').trim()
    if (current === VERSION && binaryExists(SEARCH_DIR)) {
      console.log(`[agntspce] Search v${current} already present — skipping download`)
      return
    }
  }

  const scratch = join(PROJECT_DIR, `search-download-${Date.now()}`)
  const archivePath = join(scratch, ARCHIVE_NAME)

  try {
    mkdirSync(scratch, { recursive: true })

    // Check if the bundle exists locally in packages/ first
    if (existsSync(LOCAL_PACKAGE)) {
      console.log(`[agntspce] Installing search v${VERSION} from packages/${ARCHIVE_NAME}...`)
      await copyFileSync(LOCAL_PACKAGE, archivePath)
    } else {
      console.log(`[agntspce] Downloading search v${VERSION} (${ARCHIVE_NAME})...`)
      console.log(`  URL: ${FULL_URL}`)

      const response = await fetch(FULL_URL)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} (URL: ${FULL_URL})`)
      }

      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        console.log(`  Archive size: ${(Number(contentLength) / 1e6).toFixed(0)}MB`)
      }

      // Stream download
      const fileStream = createWriteStream(archivePath)
      await pipeline(response.body, fileStream)
    }
    console.log('  Extracting...')

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
      // Scan for a directory with the search binary
      const { readdirSync } = await import('node:fs')
      for (const entry of readdirSync(scratch)) {
        const candidate = join(scratch, entry)
        if (binaryExists(candidate)) {
          srcDir = candidate
          break
        }
      }
    }

    if (!srcDir) {
      throw new Error('Could not find extracted search directory')
    }

    // Remove old and move new (sequential — never in parallel, same path)
    const fsP = await import('node:fs/promises')
    await fsP.rm(SEARCH_DIR, { recursive: true, force: true }).catch(() => {})
    await fsP.rename(srcDir, SEARCH_DIR)

    // Fix permissions and create PYTHONHOME-aware wrapper
    const pythonDir = join(SEARCH_DIR, 'python')
    const fsPromises = await import('node:fs/promises')

    if (process.platform === 'win32') {
      // Windows: locate and create .bat wrapper
      const scriptsDir = join(pythonDir, 'Scripts')
      const pythonExe = join(pythonDir, 'python.exe')
      const entryPoints = ['agntspce-search', 'agntspce-search.exe']
      for (const ep of entryPoints) {
        const epPath = join(scriptsDir, ep)
        if (existsSync(epPath) && existsSync(pythonExe)) {
          const pyPath = join(scriptsDir, 'agntspce-search.py')
          try {
            await fsPromises.copyFile(epPath, pyPath).catch(() => {})
          } catch {}
          const batWrapper = `@echo off
set PYTHONHOME=%~dp0..
"%~dp0python.exe" "%~dp0agntspce-search.py" %*
`
          await fsPromises.writeFile(join(scriptsDir, 'agntspce-search.cmd'), batWrapper, 'utf-8')
          // Also write a .bat for legacy compat
          await fsPromises.writeFile(join(scriptsDir, 'agntspce-search.bat'), batWrapper, 'utf-8')
          console.log('  Created Windows .bat wrapper')
          break
        }
      }
    } else {
      // Unix: create PYTHONHOME-aware shell wrapper
      const binPath = join(pythonDir, 'bin', 'agntspce-search')
      const pythonBin = join(pythonDir, 'bin', 'python3')
      if (existsSync(binPath) && existsSync(pythonBin)) {
        await fsPromises.chmod(binPath, 0o755)
        const pyPath = binPath + '.py'
        try {
          const content = await fsPromises.readFile(binPath, 'utf-8')
          const shebang = content.split('\n')[0]
          if (shebang.startsWith('#!')) {
            const interpreterPath = shebang.slice(2).trim().split(' ')[0]
            if (!interpreterPath || !existsSync(interpreterPath)) {
              // Fix shebang to local python3 instead of build-machine path
              const lines = content.split('\n')
              lines[0] = `#!${pythonBin}`
              await fsPromises.writeFile(pyPath, lines.join('\n'), 'utf-8')
            } else if (content.startsWith('#!/bin/sh') && existsSync(pyPath)) {
              // Already has a wrapper, skip
            } else {
              // Shebang already valid — still write .py copy for the wrapper
              await fsPromises.copyFile(binPath, pyPath)
            }
            await fsPromises.chmod(pyPath, 0o755)
          }
        } catch {}
        // Write shell wrapper that sets PYTHONHOME
        const wrapper = `#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONHOME="$SCRIPT_DIR/.."
exec "$SCRIPT_DIR/python3" "${pyPath}" "$@"
`
        await fsPromises.writeFile(binPath, wrapper, 'utf-8')
        await fsPromises.chmod(binPath, 0o755)
      }
    }

    console.log(`[agntspce] Search v${VERSION} installed → ${SEARCH_DIR}`)
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
