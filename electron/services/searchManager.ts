import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'node:crypto'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'node:url'

const HMAC_SECRET = 'agntspce-search-integration-v1-do-not-rely-on-this-for-security'
const TOKEN_TTL_SECS = 86400
const SEARCH_VERSION = '0.1.0'

let _activeSearchPath: string | null = null
let _activeSearchDir: string | null = null

function writeWithBackup(filePath: string, content: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, filePath + '.bak')
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (e) {
    console.error(`[agntspce] Failed to write ${filePath}:`, e)
    const backup = filePath + '.bak'
    if (fs.existsSync(backup)) {
      try { fs.copyFileSync(backup, filePath); fs.rmSync(backup) } catch {}
    }
    return false
  }
}

const AGNENT_CHECKS = [
  {
    id: 'claude',
    configDir: () => path.join(os.homedir(), '.claude'),
    check: () => fs.existsSync(path.join(os.homedir(), '.claude', 'settings.json')),
  },
  {
    id: 'opencode',
    configDir: () => path.join(os.homedir(), '.config', 'opencode'),
    check: () => fs.existsSync(path.join(os.homedir(), '.config', 'opencode', 'config.json')),
  },
]

type AgentCheck = (typeof AGNENT_CHECKS)[number]

function getBundledSearchDir(): string | null {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // Production: extraResources → <app>/Resources/search/
    path.join(process.resourcesPath || '', 'search'),
    // Dev (Vite-bundled): dist-electron/  →  <project>/search/
    path.join(__dirname, '..', 'search'),
    // Dev (tsc-compiled): dist-electron/services/  →  <project>/search/
    path.join(__dirname, '..', '..', 'search'),
    // Dev fallback: project root via electron API
    path.join(app.getAppPath(), 'search'),
    // Dev fallback: <project>/bin/search/
    path.resolve(__dirname, '..', '..', 'bin', 'search'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function getInstalledSearchDir(): string {
  return path.join(app.getPath('userData'), 'search')
}

function getInstalledBinaryPath(): string {
  const searchDir = getInstalledSearchDir()
  if (process.platform === 'win32') {
    return path.join(searchDir, 'python', 'Scripts', 'agntspce-search.exe')
  }
  return path.join(searchDir, 'python', 'bin', 'agntspce-search')
}

function findInstalledBinary(candidates: string[]): string | null {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function getBundledVersion(): string | null {
  const dir = getBundledSearchDir()
  if (!dir) return null
  const vFile = path.join(dir, 'VERSION')
  try {
    return fs.readFileSync(vFile, 'utf-8').trim()
  } catch {
    return null
  }
}

function getInstalledVersion(): string | null {
  const vFile = path.join(getInstalledSearchDir(), 'VERSION')
  try {
    return fs.readFileSync(vFile, 'utf-8').trim()
  } catch {
    return null
  }
}

function getInstalledBinaryCandidates(): string[] {
  const searchDir = getInstalledSearchDir()
  if (process.platform === 'win32') {
    return [
      path.join(searchDir, 'python', 'Scripts', 'agntspce-search.exe'),
      path.join(searchDir, 'python', 'Scripts', 'agntspce-search'),
      path.join(searchDir, 'python', 'bin', 'agntspce-search'),
    ]
  }
  return [path.join(searchDir, 'python', 'bin', 'agntspce-search')]
}

function fixSearchBinary(binPath: string, searchDir: string): void {
  if (process.platform === 'win32') return
  const pythonBin = path.join(searchDir, 'python', 'bin', 'python3')
  if (!fs.existsSync(pythonBin)) return
  try {
    const content = fs.readFileSync(binPath, 'utf-8')
    if (!content.startsWith('#!')) return
    const shebang = content.split('\n')[0]
    const interpreterPath = shebang.slice(2).trim().split(' ')[0]
    const pyPath = binPath + '.py'
    if (interpreterPath && fs.existsSync(interpreterPath)) {
      if (content.startsWith('#!/bin/sh') && fs.existsSync(pyPath)) return
      fs.writeFileSync(pyPath, content, 'utf-8')
      fs.chmodSync(pyPath, 0o755)
    } else {
      const name = path.basename(binPath)
      const lines = content.split('\n')
      lines[0] = `#!${pythonBin}`
      fs.writeFileSync(pyPath, lines.join('\n'), 'utf-8')
      fs.chmodSync(pyPath, 0o755)
    }
    const wrapper = `#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONHOME="$SCRIPT_DIR/.."
exec "$SCRIPT_DIR/python3" "${pyPath}" "$@"
`
    fs.writeFileSync(binPath, wrapper, 'utf-8')
    fs.chmodSync(binPath, 0o755)
  } catch (e) {
    console.warn('[agntspce] Failed to fix search binary:', e)
  }
}

function cleanupStaleSitePackages(searchDir: string): void {
  const sitePkgs = path.join(searchDir, 'python', 'lib', 'python3.13', 'site-packages')
  if (!fs.existsSync(sitePkgs)) return
  try {
    for (const entry of fs.readdirSync(sitePkgs)) {
      if (!entry.endsWith('.pth')) continue
      const pthPath = path.join(sitePkgs, entry)
      const content = fs.readFileSync(pthPath, 'utf-8').trim()
      if (!content) continue
      if (content.startsWith('/') || content.startsWith('file://')) {
        const dirToCheck = content.startsWith('file://') ? content.slice(7) : content
        if (!fs.existsSync(decodeURIComponent(dirToCheck))) {
          fs.rmSync(pthPath)
          console.log(`[agntspce] Removed stale .pth: ${entry} → ${content}`)
        }
      }
    }
  } catch {}
}

function isPackageBroken(searchDir: string): boolean {
  const sitePkgs = path.join(searchDir, 'python', 'lib', 'python3.13', 'site-packages')
  return !fs.existsSync(path.join(sitePkgs, 'agntspce_search'))
}

function installSearch(): string | null {
  const bundled = getBundledSearchDir()
  if (!bundled) {
    const installedBinary = findInstalledBinary(getInstalledBinaryCandidates())
    if (installedBinary) {
      const installedVersion = getInstalledVersion()
      console.log(`[agntspce] Search v${installedVersion || '?'} already installed (no bundle)`)
      fixSearchBinary(installedBinary, getInstalledSearchDir())
      return installedBinary
    }
    console.warn('[agntspce] Search bundle not found — skipping install')
    return null
  }

  const installed = getInstalledSearchDir()
  const bundledVersion = getBundledVersion()
  const installedVersion = getInstalledVersion()

  const currentBinary = findInstalledBinary(getInstalledBinaryCandidates())
  if (bundledVersion && installedVersion === bundledVersion && currentBinary) {
    cleanupStaleSitePackages(installed)
    if (!isPackageBroken(installed)) {
      console.log(`[agntspce] Search v${bundledVersion} already installed at ${installed}`)
      fixSearchBinary(currentBinary, installed)
      return currentBinary
    }
    console.warn(`[agntspce] Search v${bundledVersion} is broken — reinstalling`)
  }

  try {
    if (fs.existsSync(installed)) {
      const backup = installed + '.prev'
      try { fs.rmSync(backup, { recursive: true, force: true }) } catch {}
      try { fs.renameSync(installed, backup) } catch {}
    }

    fs.cpSync(bundled, installed, { recursive: true })

    const binPath = findInstalledBinary(getInstalledBinaryCandidates())
    if (binPath) {
      try { fs.chmodSync(binPath, 0o755) } catch {}
      fixSearchBinary(binPath, installed)
    }

    const backup = installed + '.prev'
    try { fs.rmSync(backup, { recursive: true, force: true }) } catch {}

    console.log(`[agntspce] Search v${bundledVersion || '?'} installed → ${installed}`)
    return binPath
  } catch (e) {
    console.error('[agntspce] Search installation failed:', e)
    const backup = installed + '.prev'
    if (fs.existsSync(backup)) {
      try {
        fs.rmSync(installed, { recursive: true, force: true })
        fs.renameSync(backup, installed)
        console.log('[agntspce] Rolled back to previous search version')
      } catch {}
    }
    return null
  }
}

function detectInstalledAgents(): AgentCheck[] {
  return AGNENT_CHECKS.filter((a) => a.check())
}

function generateSessionToken(pid?: number): string {
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + TOKEN_TTL_SECS
  const nonce = crypto.randomBytes(8).toString('hex')
  const effectivePid = pid ?? process.pid
  const payload = `${effectivePid}:${expiry}:${nonce}`
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest()
  const combined = Buffer.concat([Buffer.from(payload, 'utf-8'), sig])
  return combined.toString('base64url')
}

type InjectResult = { agent: string; action: 'created' | 'updated' | 'unchanged' | 'error' }

function injectClaudeCodeConfig(projectPath: string): InjectResult {
  const mcpPath = path.resolve(projectPath, '.mcp.json')
  const binaryPath = getInstalledBinaryPath()
  if (!binaryPath) return { agent: 'claude', action: 'error' }
  if (!fs.existsSync(binaryPath)) {
    try { if (fs.existsSync(mcpPath)) fs.rmSync(mcpPath) } catch {}
    return { agent: 'claude', action: 'error' }
  }

  const entry = {
    mcpServers: {
      'agntspce-search': {
        command: binaryPath,
        type: 'stdio',
      },
    },
  }

  const newContent = JSON.stringify(entry, null, 2) + '\n'

  if (fs.existsSync(mcpPath)) {
    const existing = fs.readFileSync(mcpPath, 'utf-8').trim()
    if (existing === newContent.trim()) return { agent: 'claude', action: 'unchanged' }
  }

  if (writeWithBackup(mcpPath, newContent)) {
    return { agent: 'claude', action: 'created' }
  }
  return { agent: 'claude', action: 'error' }
}

function removeClaudeCodeConfig(projectPath: string): InjectResult {
  const mcpPath = path.resolve(projectPath, '.mcp.json')
  if (!fs.existsSync(mcpPath)) return { agent: 'claude', action: 'unchanged' }

  try {
    const content = fs.readFileSync(mcpPath, 'utf-8')
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      return { agent: 'claude', action: 'error' }
    }

    if (parsed?.mcpServers?.['agntspce-search']) {
      delete parsed.mcpServers['agntspce-search']
      if (Object.keys(parsed.mcpServers).length === 0) {
        if (fs.existsSync(mcpPath)) {
          try { fs.rmSync(mcpPath) } catch { return { agent: 'claude', action: 'error' } }
        }
      } else if (!writeWithBackup(mcpPath, JSON.stringify(parsed, null, 2) + '\n')) {
        return { agent: 'claude', action: 'error' }
      }
      return { agent: 'claude', action: 'updated' }
    }

    return { agent: 'claude', action: 'unchanged' }
  } catch (e) {
    console.error('[agntspce] Failed to remove Claude Code .mcp.json:', e)
    return { agent: 'claude', action: 'error' }
  }
}

function injectOpenCodeConfig(): InjectResult {
  const binaryPath = getInstalledBinaryPath()
  if (!binaryPath) return { agent: 'opencode', action: 'error' }
  if (!fs.existsSync(binaryPath)) {
    removeOpenCodeConfig()
    return { agent: 'opencode', action: 'error' }
  }

  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc')
  const mcpKey = 'agntspce-search'
  const entryValue = {
    command: [binaryPath],
    type: 'local',
    enabled: true,
  }

  if (!fs.existsSync(configPath)) {
    const newConfig = {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        [mcpKey]: entryValue,
      },
    }
    if (writeWithBackup(configPath, JSON.stringify(newConfig, null, 2) + '\n')) {
      return { agent: 'opencode', action: 'created' }
    }
    return { agent: 'opencode', action: 'error' }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const jsonc = stripJsoncComments(raw)
    let config: any
    try {
      config = JSON.parse(jsonc)
    } catch {
      console.warn('[agntspce] Failed to parse OpenCode config — injecting new mcp section via text')
      return injectOpenCodeConfigTextFallback(configPath, binaryPath)
    }

    if (!config.mcp) config.mcp = {}

    const existing = JSON.stringify(config.mcp[mcpKey])
    const newValue = JSON.stringify(entryValue)
    if (existing === newValue) return { agent: 'opencode', action: 'unchanged' }

    config.mcp[mcpKey] = entryValue
    if (!writeWithBackup(configPath, JSON.stringify(config, null, 2) + '\n')) {
      return { agent: 'opencode', action: 'error' }
    }
    return { agent: 'opencode', action: 'updated' }
  } catch (e) {
    console.error('[agntspce] Failed to merge OpenCode config:', e)
    return { agent: 'opencode', action: 'error' }
  }
}

function injectOpenCodeConfigTextFallback(configPath: string, binaryPath: string): InjectResult {
  const entryText = `"agntspce-search": ${JSON.stringify({ command: [binaryPath], type: 'local', enabled: true }, null, 2)}`

  let raw: string
  try {
    raw = fs.readFileSync(configPath, 'utf-8')
  } catch {
    return { agent: 'opencode', action: 'error' }
  }

  const mcpSectionRegex = /"mcp"\s*:/;
  const hasMcp = mcpSectionRegex.test(raw)

  let newRaw: string
  if (hasMcp) {
    if (raw.includes('"agntspce-search"')) {
      return { agent: 'opencode', action: 'unchanged' }
    }
    newRaw = raw.replace(/"mcp"\s*:\s*\{/, `"mcp": {\n    ${entryText},`)
  } else {
    const lastBrace = raw.lastIndexOf('}')
    if (lastBrace === -1) return { agent: 'opencode', action: 'error' }
    const before = raw.slice(0, lastBrace).trimEnd()
    const after = raw.slice(lastBrace)
    newRaw = `${before},\n  "mcp": {\n    ${entryText}\n  }\n${after}`
  }

  if (writeWithBackup(configPath, newRaw)) {
    return { agent: 'opencode', action: 'updated' }
  }
  return { agent: 'opencode', action: 'error' }
}

function removeOpenCodeConfig(): InjectResult {
  const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc')
  if (!fs.existsSync(configPath)) return { agent: 'opencode', action: 'unchanged' }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const jsonc = stripJsoncComments(raw)
    let config: any
    try {
      config = JSON.parse(jsonc)
    } catch {
      return removeOpenCodeConfigTextFallback(configPath, raw)
    }

    if (!config.mcp?.['agntspce-search']) return { agent: 'opencode', action: 'unchanged' }

    delete config.mcp['agntspce-search']
    if (Object.keys(config.mcp).length === 0) {
      delete config.mcp
    }

    if (!writeWithBackup(configPath, JSON.stringify(config, null, 2) + '\n')) {
      return { agent: 'opencode', action: 'error' }
    }
    return { agent: 'opencode', action: 'updated' }
  } catch {
    return { agent: 'opencode', action: 'error' }
  }
}

function removeOpenCodeConfigTextFallback(configPath: string, raw: string): InjectResult {
  if (!raw.includes('"agntspce-search"')) return { agent: 'opencode', action: 'unchanged' }

  const sectionRegex = /,\s*"agntspce-search"\s*:\s*\{[^}]*}/g
  const removed = raw.replace(sectionRegex, '').replace(/"agntspce-search"\s*:\s*\{[^}]*},\s*/g, '')
  if (writeWithBackup(configPath, removed)) {
    return { agent: 'opencode', action: 'updated' }
  }
  return { agent: 'opencode', action: 'error' }
}

function stripJsoncComments(text: string): string {
  const lines: string[] = []
  let inString = false
  let stringChar = ''
  let inBlockComment = false
  let current = ''

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1] || ''

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      current += ch
      if (ch === '\\' && next) {
        current += next
        i++
      } else if (ch === stringChar) {
        inString = false
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      current += ch
      inString = true
      stringChar = ch
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      lines.push(current)
      current = ''
      continue
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }

    if (ch === '\n') {
      lines.push(current)
      current = ''
      continue
    }

    current += ch
  }

  if (current.trim()) lines.push(current)
  return lines.filter(l => l.trim()).join('\n')
}

function initialize(): string | null {
  const installedPath = installSearch()
  _activeSearchPath = installedPath
  if (installedPath) {
    _activeSearchDir = path.dirname(path.dirname(installedPath))
  }
  return _activeSearchPath
}

function getActiveSearchPath(): string | null {
  return _activeSearchPath
}

function getActiveSearchDir(): string | null {
  return _activeSearchDir
}

export {
  initialize,
  getActiveSearchPath,
  getActiveSearchDir,
  generateSessionToken,
  injectClaudeCodeConfig,
  removeClaudeCodeConfig,
  injectOpenCodeConfig,
  removeOpenCodeConfig,
  detectInstalledAgents,
  HMAC_SECRET,
  TOKEN_TTL_SECS,
  SEARCH_VERSION,
}
