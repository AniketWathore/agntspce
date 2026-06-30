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

  clearCacheForPath(p: string): void {
    this.branchCache.delete(p)
  }

  clearCache(): void {
    this.branchCache.clear()
  }
}
