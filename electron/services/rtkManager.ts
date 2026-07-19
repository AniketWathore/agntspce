import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

// ── Constants ────────────────────────────────────────────────────
// Must match EMBEDDED_SECRET in the RTK binary's activation.rs
const HMAC_SECRET = 'agntspce-rtk-integration-v1-do-not-rely-on-this-for-security'
const TOKEN_TTL_SECS = 86400 // 24 hours — covers realistic session lifetimes

// Cached active RTK binary path after installation
let _activeRtkPath: string | null = null
let _rtkBinaryDir: string | null = null

// ── Path Resolution ──────────────────────────────────────────────

function getBundledRtkPath(): string | null {
  const binName = process.platform === 'win32' ? 'rtk.exe' : 'rtk'
  const __dirname = path.dirname(fileURLToPath(import.meta.url))

  const candidates = [
    // Production: extraResources → Resources/rtk/
    path.join(process.resourcesPath || '', 'rtk', binName),
    // Dev build: closeBundle copies to dist-electron/rtk/
    path.join(__dirname, 'rtk', binName),
    // Dev: project bin/ directory
    path.resolve(__dirname, '..', '..', 'bin', binName),
    // Legacy: ~/.local/share/agntspce/rtk/
    path.join(os.homedir(), '.local', 'share', 'agntspce', 'rtk', binName),
  ]

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function getInstalledRtkPath(): string {
  const binName = process.platform === 'win32' ? 'rtk.exe' : 'rtk'
  return path.join(app.getPath('userData'), 'rtk', binName)
}

// ── Version Management ───────────────────────────────────────────

function getBinaryVersion(binaryPath: string): string | null {
  try {
    const result = spawnSync(binaryPath, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    })
    if (result.status === 0 && result.stdout) {
      const v = result.stdout.trim().split(/\s+/)[1]
      return v || null
    }
  } catch {}
  return null
}

function getBundledVersion(): string | null {
  const p = getBundledRtkPath()
  return p ? getBinaryVersion(p) : null
}

function getInstalledVersion(): string | null {
  const p = getInstalledRtkPath()
  return fs.existsSync(p) ? getBinaryVersion(p) : null
}

// ── Installation ─────────────────────────────────────────────────

function installRtk(): string | null {
  const bundled = getBundledRtkPath()
  if (!bundled) {
    console.warn('[agntspce] RTK binary not found in app bundle — skipping install')
    return null
  }

  const installed = getInstalledRtkPath()
  const installDir = path.dirname(installed)
  const bundledVersion = getBundledVersion()
  const installedVersion = getInstalledVersion()

  // Already up to date
  if (bundledVersion && installedVersion === bundledVersion && fs.existsSync(installed)) {
    console.log(`[agntspce] RTK v${bundledVersion} already installed at ${installed}`)
    return installed
  }

  // Install or upgrade
  try {
    fs.mkdirSync(installDir, { recursive: true })

    // Preserve old binary as backup for rollback
    const backupPath = installed + '.prev'
    if (fs.existsSync(installed)) {
      try { fs.copyFileSync(installed, backupPath) } catch {}
    }

    fs.copyFileSync(bundled, installed)
    if (process.platform !== 'win32') {
      fs.chmodSync(installed, 0o755)
    }

    // Remove old backup on success
    try { fs.rmSync(backupPath, { force: true }) } catch {}

    console.log(`[agntspce] RTK v${bundledVersion || '?'} installed → ${installed}`)
    return installed
  } catch (e) {
    console.error('[agntspce] RTK installation failed:', e)

    // Attempt rollback
    const backupPath = installed + '.prev'
    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, installed)
        fs.chmodSync(installed, 0o755)
        console.log('[agntspce] Rolled back to previous RTK version')
      } catch {}
    }

    return installedVersion ? installed : null
  }
}

// ── Agent Detection ──────────────────────────────────────────────

type AgentInfo = {
  id: string
  cliFlag: string
  installCheck: () => boolean
}

const AGENT_CHECKS: AgentInfo[] = [
  {
    id: 'claude',
    cliFlag: '--agent claude',
    installCheck: () => {
      const home = os.homedir()
      return fs.existsSync(path.join(home, '.claude', 'settings.json'))
    },
  },
  {
    id: 'cursor',
    cliFlag: '--agent cursor',
    installCheck: () => {
      const home = os.homedir()
      return (
        fs.existsSync(path.join(home, '.cursor', 'settings.json')) ||
        fs.existsSync(path.join(home, '.cursor', 'config', 'settings.json'))
      )
    },
  },
  {
    id: 'opencode',
    // opencode uses --opencode flag instead of --agent opencode
    cliFlag: '--opencode',
    installCheck: () => {
      const home = os.homedir()
      const configDir = path.join(home, '.config', 'opencode')
      return (
        fs.existsSync(path.join(configDir, 'opencode.jsonc')) ||
        fs.existsSync(path.join(configDir, 'opencode.json')) ||
        fs.existsSync(path.join(configDir, 'config.json'))
      )
    },
  },
  {
    id: 'gemini',
    // gemini uses --gemini flag instead of --agent gemini
    cliFlag: '--gemini',
    installCheck: () => {
      const home = os.homedir()
      return fs.existsSync(path.join(home, '.config', 'gemini'))
    },
  },
  {
    id: 'codex',
    cliFlag: '--agent codex',
    installCheck: () => {
      const home = os.homedir()
      return fs.existsSync(path.join(home, '.codex'))
    },
  },
]

function detectInstalledAgents(): AgentInfo[] {
  return AGENT_CHECKS.filter(a => a.installCheck())
}

// ── Hook Registration ────────────────────────────────────────────

function registerHooks(rtkBinaryPath: string): { registered: string[]; failed: string[] } {
  const agents = detectInstalledAgents()
  const registered: string[] = []
  const failed: string[] = []

  if (agents.length === 0) {
    console.log('[agntspce] No supported AI coding agents detected — skipping hook registration')
    return { registered, failed }
  }

  for (const agent of agents) {
    try {
      // Parse the CLI flag string into args array
      const args = ['init', '-g', ...agent.cliFlag.split(' '), '--auto-patch']
      const result = spawnSync(rtkBinaryPath, args, {
        encoding: 'utf-8',
        timeout: 30000,
        windowsHide: true,
      })

      if (result.status === 0) {
        console.log(`[agntspce] Hook registered for ${agent.id}`)
        registered.push(agent.id)
      } else {
        const err = (result.stderr || result.stdout || '').trim().slice(0, 200)
        console.warn(`[agntspce] Hook registration failed for ${agent.id}: ${err}`)
        failed.push(agent.id)
      }
    } catch (e: any) {
      console.warn(`[agntspce] Hook registration error for ${agent.id}:`, e.message)
      failed.push(agent.id)
    }
  }

  return { registered, failed }
}

// ── Token Generation ─────────────────────────────────────────────

function generateRtkToken(): string {
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + TOKEN_TTL_SECS
  const nonce = crypto.randomBytes(8).toString('hex')
  const payload = `${process.pid}:${expiry}:${nonce}`
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest()
  const combined = Buffer.concat([Buffer.from(payload, 'utf-8'), sig])
  return combined.toString('base64url')
}

// ── Public API ───────────────────────────────────────────────────

function initialize(): string | null {
  const installedPath = installRtk()
  _activeRtkPath = installedPath

  // Derive the binary directory from the found RTK binary
  if (installedPath) {
    _rtkBinaryDir = path.dirname(installedPath)
  }

  if (!installedPath) {
    // Fall back to the bundled path (e.g., if userData is unavailable)
    const bundled = getBundledRtkPath()
    if (bundled) {
      _activeRtkPath = bundled
      _rtkBinaryDir = path.dirname(bundled)
      console.warn('[agntspce] Using bundled RTK path (no userData copy)')
    }
  }

  if (_activeRtkPath) {
    const { failed } = registerHooks(_activeRtkPath)
    if (failed.length > 0) {
      console.warn(`[agntspce] Hook registration had failures: ${failed.join(', ')}`)
    }
  }

  return _activeRtkPath
}

function getActiveRtkPath(): string | null {
  return _activeRtkPath
}

function getRtkBinaryDir(): string | null {
  return _rtkBinaryDir
}

export {
  initialize,
  getActiveRtkPath,
  getRtkBinaryDir,
  getBundledRtkPath,
  getInstalledRtkPath,
  detectInstalledAgents,
  registerHooks,
  generateRtkToken,
  HMAC_SECRET,
  TOKEN_TTL_SECS,
}
