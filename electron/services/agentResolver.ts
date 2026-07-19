import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const RESOLVED_PATHS = new Map<string, string | null>()
let _loginShellPath: string | null = null

const AGENT_COMMANDS: Record<string, string> = {
  claude: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  gemini: 'gemini',
  'cursor-agent': 'cursor',
  copilot: 'github-copilot-cli',
  mastracode: 'mastra',
  droid: 'droid',
  amp: 'amp',
  pi: 'pi',
}

function getLoginShell(): string {
  if (process.platform === 'win32') {
    return process.env.SHELL || 'cmd.exe'
  }
  const shell = process.env.SHELL || '/bin/bash'
  return fs.existsSync(shell) ? shell : '/bin/bash'
}

function resolveLoginShellPath(): string {
  if (_loginShellPath) return _loginShellPath

  if (process.platform === 'win32') {
    const dirs = new Set<string>()
    if (process.env.PATH) {
      process.env.PATH.split(path.delimiter).forEach(d => { if (d) dirs.add(d) })
    }
    const extra = [
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
      path.join(os.homedir(), 'AppData', 'Local', 'npm'),
      'C:\\Program Files\\Git\\bin',
      'C:\\Program Files\\Git\\cmd',
      'C:\\Windows\\System32',
    ]
    extra.forEach(d => { if (fs.existsSync(d)) dirs.add(d) })
    const result = Array.from(dirs).join(path.delimiter)
    _loginShellPath = result
    return result
  }

  const shell = getLoginShell()
  for (const cmd of [
    `${shell} -l -c 'echo "$PATH"' 2>/dev/null`,
    `/bin/bash -l -c 'echo "$PATH"' 2>/dev/null`,
  ]) {
    try {
      const result = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const trimmed = result.trim().split('\n').pop() || ''
      if (trimmed.length > 15) {
        _loginShellPath = trimmed
        return trimmed
      }
    } catch {}
  }
  let npmGlobalBin = ''
  try {
    const npmResult = execSync('npm root -g 2>/dev/null', { encoding: 'utf-8', timeout: 3000 })
    if (npmResult.trim()) npmGlobalBin = path.join(npmResult.trim(), '..', 'bin')
  } catch {}
  const fallback = [
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.npm-global', 'bin'),
    npmGlobalBin,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(d => d && fs.existsSync(d)).join(':')
  _loginShellPath = fallback
  return fallback
}

function findExecutable(name: string): string | null {
  if ((name.includes('/') || name.includes('\\')) && fs.existsSync(name)) return path.resolve(name)
  const pathStr = _loginShellPath || resolveLoginShellPath()
  const dirs = pathStr.split(path.delimiter)
  const candidates = [name]
  if (process.platform === 'win32' && !path.extname(name)) {
    candidates.push(name + '.exe', name + '.cmd', name + '.bat', name + '.com')
  }
  for (const dir of dirs) {
    if (!dir) continue
    for (const cand of candidates) {
      try {
        const fullPath = path.resolve(dir, cand)
        fs.accessSync(fullPath, fs.constants.F_OK)
        if (fs.statSync(fullPath).isFile()) return fullPath
      } catch {}
    }
  }
  // Direct shell fallback — uses login shell's actual PATH resolution
  if (process.platform !== 'win32') {
    for (const shell of [getLoginShell(), '/bin/bash']) {
      try {
        const result = execSync(`${shell} -l -c 'command -v ${name}' 2>/dev/null`, {
          encoding: 'utf-8',
          timeout: 5000,
        })
        const trimmed = result.trim()
        if (trimmed && fs.existsSync(trimmed)) return trimmed
      } catch {}
    }
  }
  return null
}

export function resolveAgent(agentId: string): string | null {
  const cmdName = AGENT_COMMANDS[agentId] || agentId
  if (!RESOLVED_PATHS.has(cmdName)) {
    RESOLVED_PATHS.set(cmdName, findExecutable(cmdName))
  }
  return RESOLVED_PATHS.get(cmdName) || null
}

function resolveAllAgents(): void {
  for (const cmdName of Object.values(AGENT_COMMANDS)) {
    if (!RESOLVED_PATHS.has(cmdName)) {
      RESOLVED_PATHS.set(cmdName, findExecutable(cmdName))
    }
  }
}

export function getAllAgentBinaryDirs(): string[] {
  resolveAllAgents()
  const dirs = new Set<string>()
  for (const resolvedPath of RESOLVED_PATHS.values()) {
    if (resolvedPath) dirs.add(path.dirname(resolvedPath))
  }
  return Array.from(dirs)
}

export function getAllAgentPaths(): Record<string, string | null> {
  resolveAllAgents()
  const result: Record<string, string | null> = {}
  for (const cmdName of Object.values(AGENT_COMMANDS)) {
    result[cmdName] = RESOLVED_PATHS.get(cmdName) || null
  }
  return result
}

export function getLoginPath(): string {
  return _loginShellPath || resolveLoginShellPath()
}

export function checkAgentsInstalled(agentIds: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const id of agentIds) {
    const cmdName = AGENT_COMMANDS[id]
    if (!cmdName) {
      result[id] = false
      continue
    }
    if (!RESOLVED_PATHS.has(cmdName)) {
      RESOLVED_PATHS.set(cmdName, findExecutable(cmdName))
    }
    result[id] = RESOLVED_PATHS.get(cmdName) !== null
  }
  return result
}

export function resetCache(): void {
  RESOLVED_PATHS.clear()
  _loginShellPath = null
}
