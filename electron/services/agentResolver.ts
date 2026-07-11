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
  const shell = process.env.SHELL || '/bin/bash'
  return fs.existsSync(shell) ? shell : '/bin/bash'
}

function resolveLoginShellPath(): string {
  if (_loginShellPath) return _loginShellPath
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
  const fallback = [
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(d => fs.existsSync(d)).join(':')
  _loginShellPath = fallback
  return fallback
}

function findExecutable(name: string): string | null {
  if (name.includes('/') && fs.existsSync(name)) return path.resolve(name)
  const pathStr = _loginShellPath || resolveLoginShellPath()
  const dirs = pathStr.split(':')
  for (const dir of dirs) {
    if (!dir) continue
    try {
      const fullPath = path.resolve(dir, name)
      fs.accessSync(fullPath, fs.constants.X_OK)
      if (fs.statSync(fullPath).isFile()) return fullPath
    } catch {}
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

export function resetCache(): void {
  RESOLVED_PATHS.clear()
  _loginShellPath = null
}
