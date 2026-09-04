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

import { existsSync, mkdirSync, createWriteStream, readFileSync, copyFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')
const SEARCH_DIR = join(PROJECT_DIR, 'search')
const PACKAGES_DIR = join(PROJECT_DIR, 'packages')

// ── Config ───────────────────────────────────────────────────────
const VERSION = process.env.SEARCH_VERSION || '0.1.1'

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

function patchDownloadedMcp(searchDir) {
  // The upstream semble pip package ships FastMCP("semble") which appears
  // as mcp__semble__search. Patch it to agntspce-search so the MCP is
  // exposed as mcp__agntspce-search__search.
  const candidates = [
    join(searchDir, 'python', 'Lib', 'site-packages', 'semble', 'mcp.py'),
    join(searchDir, 'python', 'lib', 'python3.13', 'site-packages', 'semble', 'mcp.py'),
    join(searchDir, 'python', 'lib', 'python3.12', 'site-packages', 'semble', 'mcp.py'),
  ]
  for (const mcpPath of candidates) {
    if (!existsSync(mcpPath)) continue
    try {
      let content = readFileSync(mcpPath, 'utf-8')
      if (content.includes('FastMCP("semble"') || content.includes("FastMCP('semble'")) {
        content = content.replace(/FastMCP\(\s*["']semble["']/, 'FastMCP("agntspce-search"')
        writeFileSync(mcpPath, content, 'utf-8')
        console.log(`  Patched MCP server name in ${mcpPath}`)
      }
    } catch {}
  }
  // Also patch the installer docs that still mention mcp__semble__
  const installerCandidates = [
    join(searchDir, 'python', 'Lib', 'site-packages', 'semble', 'installer', 'agents.py'),
    join(searchDir, 'python', 'lib', 'python3.13', 'site-packages', 'semble', 'installer', 'agents.py'),
  ]
  for (const p of installerCandidates) {
    if (!existsSync(p)) continue
    try {
      let c = readFileSync(p, 'utf-8')
      if (c.includes('mcp__semble__')) {
        c = c.replace(/mcp__semble__/g, 'mcp__agntspce-search__')
        c = c.replace(/## Semble Code Search/g, '## Agntspce Search')
        c = c.replace(/A `semble` MCP server/g, 'A `agntspce-search` MCP server')
        writeFileSync(p, c, 'utf-8')
        console.log(`  Patched installer in ${p}`)
      }
    } catch {}
  }
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

    // Extract in-place via cwd instead of `-C <abs-path>`: GNU tar on Windows
    // interprets a drive-letter argument like "E:\..." as a remote host spec
    // ("Cannot connect to E: resolve failed"). The bare archive name contains
    // no colon, and cwd pins both input and output to the scratch dir.
    const result = spawnSync('tar', ['xzf', ARCHIVE_NAME], {
      stdio: 'inherit',
      encoding: 'utf-8',
      timeout: 120000,
      cwd: scratch,
      windowsHide: true,
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

    // Patch upstream semble → agntspce-search (tarball still ships "semble")
    try { patchDownloadedMcp(SEARCH_DIR) } catch {}

    // Fix permissions and create PYTHONHOME-aware wrapper
    const pythonDir = join(SEARCH_DIR, 'python')
    const fsPromises = await import('node:fs/promises')

    if (process.platform === 'win32') {
      // Windows: locate the console-script entry point (the cross-built bundle
      // ships it under bin/, pip-style installs use Scripts/) and create a
      // .cmd/.bat wrapper pair next to python.exe.
      const scriptsDir = join(pythonDir, 'Scripts')
      const binDir = join(pythonDir, 'bin')
      const pythonExe = join(pythonDir, 'python.exe')
      const entryPoints = [
        join(scriptsDir, 'agntspce-search'),
        join(scriptsDir, 'agntspce-search.exe'),
        join(binDir, 'agntspce-search'),
      ]
      for (const epPath of entryPoints) {
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

      // The MCP SDK declares pywin32 only for native builds; the portable
      // bundle is assembled on macOS so the dependency is missing. Without it,
      // importing mcp fails on Windows (`No module named 'pywintypes'`).
      if (existsSync(pythonExe)) {
        const probe = spawnSync(pythonExe, ['-c', 'import pywintypes'], { encoding: 'utf-8' })
        if (probe.status !== 0) {
          console.log('  Installing pywin32 (required by the MCP SDK on Windows)...')
          const pipResult = spawnSync(
            pythonExe,
            ['-m', 'pip', 'install', '--no-warn-script-location', '--quiet', 'pywin32'],
            { stdio: 'inherit', timeout: 300000, windowsHide: true },
          )
          if (pipResult.status !== 0) {
            console.warn('  [warn] pywin32 install failed — agntspce-search MCP may not start')
          }
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
      if (err.message.includes('HTTP 404')) {
        console.log('[agntspce] No prebuilt search binary for this platform — skipping download')
      } else {
        console.warn(`[agntspce] Search download failed: ${err.message}`)
      }
    console.log('[agntspce] Run "bash scripts/build-semble.sh" to build search from source')
  } finally {
    await import('node:fs/promises').then(fs =>
      fs.rm(scratch, { recursive: true, force: true }).catch(() => {})
    )
  }
}

main().catch(() => process.exit(1))
