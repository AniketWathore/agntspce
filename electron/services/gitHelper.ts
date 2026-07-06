import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const execFileAsync = promisify(execFile)
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024
const GIT_CACHE_TIMEOUT_MS = 30000
const GIT_COMMAND_TIMEOUT_MS = 5000

export interface GitStatus {
  clean: boolean
  modified: number
  added: number
  deleted: number
  untracked: number
  total: number
}

export interface FileStatus {
  filePath: string
  stagedStatus: string
  workingStatus: string
  status: 'M' | 'A' | 'D' | 'R' | 'U' | 'C'
  additions: number
  deletions: number
  staged: boolean
}

export interface FullStatus {
  branch: string
  ahead: number
  behind: number
  files: FileStatus[]
  clean: boolean
  total: number
}

export class GitHelper {
  private branchCache = new Map<string, { branch: string; timestamp: number }>()
  private cacheTimeout = GIT_CACHE_TIMEOUT_MS
  private basePath: string

  constructor() {
    this.basePath = process.env.WORKTREE_BASE_PATH || process.env.HOME || os.homedir()
  }

  private async execGit(args: string[], opts: { cwd?: string; timeout?: number } = {}) {
    return execFileAsync('git', args, {
      cwd: opts.cwd,
      timeout: opts.timeout ?? GIT_COMMAND_TIMEOUT_MS,
      maxBuffer: DEFAULT_MAX_BUFFER,
    })
  }

  private getPathState(worktreePath: string | undefined | null): { ok: boolean; reason: string; normalized: string } {
    const raw = String(worktreePath || '').trim()
    if (!raw) return { ok: false, reason: 'empty', normalized: '' }
    let normalized = raw
    try { normalized = path.resolve(raw) } catch { return { ok: false, reason: 'invalid', normalized: raw } }
    if (!this.isValidPath(normalized)) return { ok: false, reason: 'invalid', normalized }
    try {
      if (!fs.existsSync(normalized)) return { ok: false, reason: 'missing', normalized }
    } catch { return { ok: false, reason: 'missing', normalized } }
    return { ok: true, reason: null, normalized }
  }

  private isValidPath(p: string): boolean {
    const normalized = path.resolve(p)
    const prefixes = [this.basePath, '/tmp']
    const resolvedPrefixes = prefixes.filter(Boolean).map(p => path.resolve(p))
    return resolvedPrefixes.some(prefix => normalized === prefix || normalized.startsWith(prefix + path.sep))
  }

  private getCachedBranch(p: string): string | null {
    const cached = this.branchCache.get(p)
    if (!cached) return null
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.branchCache.delete(p)
      return null
    }
    return cached.branch
  }

  private setCachedBranch(p: string, branch: string): void {
    this.branchCache.set(p, { branch, timestamp: Date.now() })
  }

  async getCurrentBranch(worktreePath: string, skipCache = false): Promise<string> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return state.reason === 'invalid' ? 'invalid-path' : state.reason === 'missing' ? 'missing' : 'unknown'

    if (!skipCache) {
      const cached = this.getCachedBranch(state.normalized)
      if (cached) return cached
    }

    try {
      const { stdout } = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: state.normalized })

      const branch = stdout.trim()
      if (branch === 'HEAD') {
        const { stdout: hash } = await this.execGit(['rev-parse', '--short', 'HEAD'], { cwd: state.normalized })
        const shortHash = hash.trim()
        this.setCachedBranch(state.normalized, `detached@${shortHash}`)
        return `detached@${shortHash}`
      }

      this.setCachedBranch(state.normalized, branch)
      return branch
    } catch (error: any) {
      if (String(error?.message || '').includes('not a git repository')) return 'no-git'
      return 'unknown'
    }
  }

  async getStatus(worktreePath: string): Promise<GitStatus | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null

    try {
      const { stdout } = await this.execGit(['status', '--porcelain'], { cwd: state.normalized, timeout: 5000 })
      const lines = stdout.trim().split('\n').filter(l => l.length > 0)
      return {
        clean: lines.length === 0,
        modified: lines.filter(l => l.startsWith(' M')).length,
        added: lines.filter(l => l.startsWith('A ')).length,
        deleted: lines.filter(l => l.startsWith(' D')).length,
        untracked: lines.filter(l => l.startsWith('??')).length,
        total: lines.length,
      }
    } catch {
      return null
    }
  }

  async getLog(worktreePath: string, maxCount = 20): Promise<{ hash: string, message: string, author: string, date: string }[] | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      const { stdout } = await this.execGit(
        ['log', `--max-count=${maxCount}`, '--format=%H|%s|%an|%ar'],
        { cwd: state.normalized, timeout: 10000 },
      )
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date] = line.split('|')
        return { hash: hash?.slice(0, 8) || '', message: message || '', author: author || '', date: date || '' }
      })
    } catch { return null }
  }

  async getDiff(worktreePath: string, base = 'HEAD', head?: string): Promise<string | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      const args = ['diff', base]
      if (head) args.push(head)
      const { stdout } = await this.execGit(args, { cwd: state.normalized, timeout: 15000 })
      return stdout
    } catch { return null }
  }

  async getWorkingTreeDiff(worktreePath: string): Promise<string | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      const { stdout } = await this.execGit(['diff'], { cwd: state.normalized, timeout: 15000 })
      return stdout
    } catch { return null }
  }

  async getBranches(worktreePath: string): Promise<{ name: string, current: boolean, date: string }[] | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      const { stdout } = await this.execGit(
        ['branch', '--sort=-committerdate', '--format=%(HEAD)|%(refname:short)|%(committerdate:relative)'],
        { cwd: state.normalized, timeout: 10000 },
      )
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const [head, name, date] = line.split('|')
        return { name: name || '', current: head === '*', date: date || '' }
      })
    } catch { return null }
  }

  async getCommitFiles(worktreePath: string, commitHash: string): Promise<{ filePath: string, status: string, additions: number, deletions: number }[] | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      const { stdout } = await this.execGit(
        ['diff-tree', '--no-commit-id', '-r', '--numstat', commitHash],
        { cwd: state.normalized, timeout: 10000 },
      )
      if (!stdout.trim()) return []
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split('\t')
        const adds = parseInt(parts[0])
        const dels = parseInt(parts[1])
        const filePath = parts[2] || ''
        const status = adds === 0 && dels === 0 ? 'M' : adds > 0 && dels === 0 ? 'A' : adds === 0 && dels > 0 ? 'D' : 'M'
        return { filePath, status, additions: isNaN(adds) ? 0 : adds, deletions: isNaN(dels) ? 0 : dels }
      })
    } catch { return null }
  }

  async getWorkingTreeFiles(worktreePath: string): Promise<{ filePath: string, status: string, additions: number, deletions: number }[] | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      const [statusResult, unstagedResult, stagedResult] = await Promise.all([
        this.execGit(['status', '--porcelain'], { cwd: state.normalized, timeout: 5000 }),
        this.execGit(['diff', '--numstat'], { cwd: state.normalized, timeout: 10000 }).catch(() => ({ stdout: '' })),
        this.execGit(['diff', '--cached', '--numstat'], { cwd: state.normalized, timeout: 10000 }).catch(() => ({ stdout: '' })),
      ])

      const numstatMap = new Map<string, { additions: number, deletions: number }>()
      const addNumstat = (output: string) => {
        for (const line of output.trim().split('\n').filter(Boolean)) {
          const parts = line.split('\t')
          const adds = parseInt(parts[0])
          const dels = parseInt(parts[1])
          const fp = parts.slice(2).join('\t')
          if (!fp) continue
          const existing = numstatMap.get(fp) || { additions: 0, deletions: 0 }
          existing.additions += isNaN(adds) ? 0 : adds
          existing.deletions += isNaN(dels) ? 0 : dels
          numstatMap.set(fp, existing)
        }
      }
      addNumstat(unstagedResult.stdout)
      addNumstat(stagedResult.stdout)

      const statusLines = statusResult.stdout.trim().split('\n').filter(Boolean)
      const files: { filePath: string, status: string, additions: number, deletions: number }[] = []
      for (const line of statusLines) {
        const stagedStatus = line[0]
        const workingStatus = line[1]
        let rawPath = line.slice(3).trim()
        if (stagedStatus === 'R' || workingStatus === 'R') {
          const parts = rawPath.split(' -> ')
          rawPath = parts[parts.length - 1].trim()
        }
        let status: string
        if (stagedStatus === '?' && workingStatus === '?') {
          status = 'U'
        } else if (stagedStatus === 'A' || workingStatus === 'A' || stagedStatus === '?') {
          status = 'A'
        } else if (stagedStatus === 'D' || workingStatus === 'D') {
          status = 'D'
        } else {
          status = 'M'
        }
        const stats = numstatMap.get(rawPath) || { additions: 0, deletions: 0 }
        files.push({ filePath: rawPath, status, additions: stats.additions, deletions: stats.deletions })
      }
      return files
    } catch { return null }
  }

  async getFileDiff(worktreePath: string, filePath: string, base?: string, head?: string): Promise<string | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      if (base === 'EMPTY') {
        const fullPath = path.resolve(state.normalized, filePath)
        if (!fs.existsSync(fullPath)) return null
        const content = await fs.promises.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        const header = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n`
        const body = lines.map((l, i) => `+${l}`).join('\n')
        return header + body + '\n'
      }
      const args = base ? ['diff', base] : ['diff']
      if (head) args.push(head)
      args.push('--', filePath)
      const { stdout } = await this.execGit(args, { cwd: state.normalized, timeout: 15000 })
      return stdout
    } catch { return null }
  }

  async getFullStatus(worktreePath: string): Promise<FullStatus | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null

    try {
      const [branchOut, statusOut, stagedOut, unstagedOut] = await Promise.all([
        this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: state.normalized, timeout: 5000 }),
        this.execGit(['status', '--porcelain'], { cwd: state.normalized, timeout: 5000 }),
        this.execGit(['diff', '--cached', '--numstat'], { cwd: state.normalized, timeout: 10000 }).catch(() => ({ stdout: '' })),
        this.execGit(['diff', '--numstat'], { cwd: state.normalized, timeout: 10000 }).catch(() => ({ stdout: '' })),
      ])

      const branch = branchOut.stdout.trim() === 'HEAD'
        ? `detached@${(await this.execGit(['rev-parse', '--short', 'HEAD'], { cwd: state.normalized })).stdout.trim()}`
        : branchOut.stdout.trim()

      let ahead = 0, behind = 0
      try {
        const { stdout: revOut } = await this.execGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { cwd: state.normalized, timeout: 8000 })
        const parts = revOut.trim().split('\t')
        ahead = parseInt(parts[0]) || 0
        behind = parseInt(parts[1]) || 0
      } catch {}

      const numstatMap = new Map<string, { additions: number, deletions: number }>()
      const addNumstat = (output: string) => {
        for (const line of output.trim().split('\n').filter(Boolean)) {
          const parts = line.split('\t')
          const adds = parseInt(parts[0])
          const dels = parseInt(parts[1])
          const fp = parts.slice(2).join('\t')
          if (!fp) continue
          const existing = numstatMap.get(fp) || { additions: 0, deletions: 0 }
          existing.additions += isNaN(adds) ? 0 : adds
          existing.deletions += isNaN(dels) ? 0 : dels
          numstatMap.set(fp, existing)
        }
      }
      addNumstat(stagedOut.stdout)
      addNumstat(unstagedOut.stdout)

      const statusLines = statusOut.stdout.trim().split('\n').filter(Boolean)
      const files: FileStatus[] = []
      for (const line of statusLines) {
        const stagedStatus = line[0]
        const workingStatus = line[1]
        let rawPath = line.slice(3).trim()
        if (stagedStatus === 'R' || workingStatus === 'R') {
          const parts = rawPath.split(' -> ')
          rawPath = parts[parts.length - 1].trim()
        }
        let status: 'M' | 'A' | 'D' | 'R' | 'U' | 'C'
        if (stagedStatus === '?' && workingStatus === '?') {
          status = 'U'
        } else if (stagedStatus === 'A' || stagedStatus === '?') {
          status = 'A'
        } else if (stagedStatus === 'D' || workingStatus === 'D') {
          status = 'D'
        } else if (stagedStatus === 'R' || workingStatus === 'R') {
          status = 'R'
        } else if (stagedStatus === 'C' || workingStatus === 'C') {
          status = 'C'
        } else {
          status = 'M'
        }
        const stats = numstatMap.get(rawPath) || { additions: 0, deletions: 0 }
        files.push({
          filePath: rawPath,
          stagedStatus,
          workingStatus,
          status,
          additions: stats.additions,
          deletions: stats.deletions,
          staged: stagedStatus !== ' ' && stagedStatus !== '?',
        })
      }

      return {
        branch,
        ahead,
        behind,
        files,
        clean: statusLines.length === 0,
        total: statusLines.length,
      }
    } catch { return null }
  }

  async revertFile(worktreePath: string, filePath: string): Promise<boolean> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return false
    try {
      await this.execGit(['checkout', '--', filePath], { cwd: state.normalized, timeout: 10000 })
      return true
    } catch { return false }
  }

  async stageFile(worktreePath: string, filePath: string): Promise<boolean> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return false
    try {
      await this.execGit(['add', filePath], { cwd: state.normalized, timeout: 10000 })
      return true
    } catch { return false }
  }

  async unstageFile(worktreePath: string, filePath: string): Promise<boolean> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return false
    try {
      await this.execGit(['reset', 'HEAD', '--', filePath], { cwd: state.normalized, timeout: 10000 })
      return true
    } catch { return false }
  }

  async stageAll(worktreePath: string): Promise<boolean> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return false
    try {
      await this.execGit(['add', '-A'], { cwd: state.normalized, timeout: 30000 })
      return true
    } catch { return false }
  }

  async unstageAll(worktreePath: string): Promise<boolean> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return false
    try {
      await this.execGit(['reset'], { cwd: state.normalized, timeout: 10000 })
      return true
    } catch { return false }
  }

  async commit(worktreePath: string, message: string): Promise<{ ok: boolean; hash?: string; error?: string }> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return { ok: false, error: state.reason }
    try {
      const { stdout } = await this.execGit(['commit', '-m', message], { cwd: state.normalized, timeout: 15000 })
      const match = stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/)
      return { ok: true, hash: match?.[1] }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'commit failed' }
    }
  }

  async pull(worktreePath: string): Promise<{ ok: boolean; output?: string; error?: string }> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return { ok: false, error: state.reason }
    try {
      const { stdout, stderr } = await this.execGit(['pull'], { cwd: state.normalized, timeout: 60000 })
      return { ok: true, output: stdout + stderr }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'pull failed' }
    }
  }

  async push(worktreePath: string): Promise<{ ok: boolean; output?: string; error?: string }> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return { ok: false, error: state.reason }
    try {
      const { stdout, stderr } = await this.execGit(['push'], { cwd: state.normalized, timeout: 60000 })
      return { ok: true, output: stdout + stderr }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'push failed' }
    }
  }

  async fetch(worktreePath: string): Promise<{ ok: boolean; output?: string; error?: string }> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return { ok: false, error: state.reason }
    try {
      const { stdout, stderr } = await this.execGit(['fetch'], { cwd: state.normalized, timeout: 60000 })
      return { ok: true, output: stdout + stderr }
    } catch (e: any) {
      return { ok: false, error: e?.message || 'fetch failed' }
    }
  }

  async discardAll(worktreePath: string): Promise<boolean> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return false
    try {
      await this.execGit(['checkout', '--', '.'], { cwd: state.normalized, timeout: 30000 })
      await this.execGit(['clean', '-fd'], { cwd: state.normalized, timeout: 30000 }).catch(() => {})
      return true
    } catch { return false }
  }

  async getDiffWithWordHighlight(worktreePath: string, filePath: string, base?: string, head?: string): Promise<string | null> {
    const state = this.getPathState(worktreePath)
    if (!state.ok) return null
    try {
      if (base === 'EMPTY') {
        const fullPath = path.resolve(state.normalized, filePath)
        if (!fs.existsSync(fullPath)) return null
        const content = await fs.promises.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        const header = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n`
        const body = lines.map((l, i) => `+${l}`).join('\n')
        return header + body + '\n'
      }
      const args = base ? ['diff', '--word-diff=color', base] : ['diff', '--word-diff=color']
      if (head) args.push(head)
      args.push('--', filePath)
      const { stdout } = await this.execGit(args, { cwd: state.normalized, timeout: 15000 })
      return stdout
    } catch { return null }
  }

  clearCacheForPath(p: string): void {
    this.branchCache.delete(p)
  }

  clearCache(): void {
    this.branchCache.clear()
  }
}
