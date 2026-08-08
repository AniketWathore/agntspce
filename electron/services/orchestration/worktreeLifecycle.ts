import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

function detectPackageManager(repoPath: string): string {
  if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(repoPath, 'package-lock.json'))) return 'npm'
  if (fs.existsSync(path.join(repoPath, 'Cargo.lock'))) return 'cargo'
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) return 'go'
  if (fs.existsSync(path.join(repoPath, 'Gemfile.lock'))) return 'bundle'
  return ''
}

function detectInstallCommand(pm: string): string[] | null {
  switch (pm) {
    case 'pnpm': return ['pnpm', 'install', '--frozen-lockfile']
    case 'yarn': return ['yarn', 'install', '--frozen-lockfile']
    case 'npm': return ['npm', 'ci']
    case 'cargo': return ['cargo', 'build']
    case 'go': return ['go', 'mod', 'download']
    case 'bundle': return ['bundle', 'install']
    default: return null
  }
}

export function detectBuildCommand(repoPath: string): { build: string[] | null; test: string[] | null } {
  const pkg = path.join(repoPath, 'package.json')
  try {
    const json = JSON.parse(fs.readFileSync(pkg, 'utf-8'))
    return {
      build: json.scripts?.build ? ['npm', 'run', 'build'] : null,
      test: json.scripts?.test ? ['npm', 'run', 'test'] : null,
    }
  } catch {
    return { build: null, test: null }
  }
}

export function runCommands(repoPath: string, cmds: string[][]): { ok: boolean; output?: string; error?: string } {
  let allOutput = ''
  for (const cmd of cmds) {
    try {
      const label = cmd.join(' ')
      const output = execFileSync(cmd[0], cmd.slice(1), {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024,
      })
      allOutput += `$ ${label}\n${output.slice(0, 1000)}\n`
    } catch (e) {
      const err = (e as Error).message
      return { ok: false, error: `Command failed: ${cmd.join(' ')}: ${err.slice(0, 1000)}` }
    }
  }
  return { ok: true, output: allOutput }
}

export interface WorktreeResult {
  worktreePath: string
  branchName: string
  branchPoint: string
}

export interface ScratchWorktreeResult {
  worktreePath: string
  branchName: string
}

export class WorktreeLifecycle {
  private repoPath: string
  private baseDir: string

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.baseDir = path.join(path.dirname(path.resolve(repoPath)), '.agntspce', 'worktrees')
    fs.mkdirSync(this.baseDir, { recursive: true })
  }

  private execGit(args: string[], cwd?: string): string {
    return execFileSync('git', args, {
      cwd: cwd || this.repoPath,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim()
  }

  getRepoPath(): string {
    return this.repoPath
  }

  createWorktree(id: string, sourceRef: string): WorktreeResult {
    const branchName = `worktree/${id}`
    const worktreePath = path.join(this.baseDir, id)

    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree path already exists: ${worktreePath}`)
    }

    const branchPoint = this.execGit(['rev-parse', sourceRef])

    this.execGit(['worktree', 'add', '-b', branchName, worktreePath, branchPoint])

    return { worktreePath, branchName, branchPoint }
  }

  createScratchWorktree(sourceRef: string): ScratchWorktreeResult {
    const shortRef = sourceRef.slice(0, 8)
    const ts = Date.now()
    const branchName = `agntspce-scratch-merge-${shortRef}-${ts}`
    const dirName = `scratch-merge-${shortRef}-${ts}`
    const worktreePath = path.join(this.baseDir, dirName)

    if (fs.existsSync(worktreePath)) {
      this.removeScratchWorktree(worktreePath)
    }

    this.execGit(['worktree', 'add', '-b', branchName, worktreePath, sourceRef])

    return { worktreePath, branchName }
  }

  // 5.4 no-worktree mode: create the task branch in the main repo (checked out
  // by the agent working in-place) instead of a detached git worktree.
  createInRepoBranch(taskId: string, sourceRef: string): void {
    const branchName = `worktree/${taskId}`
    try {
      this.execGit(['branch', '-D', branchName])
    } catch {}
    this.execGit(['branch', branchName, sourceRef])
    this.execGit(['checkout', branchName])
  }

  // 5.4 no-worktree teardown: after a successful merge, return the repo working
  // tree to the integration branch and delete the (now-merged) task branch.
  // A checked-out branch cannot be deleted, so checkout must come first.
  cleanupInRepoTaskBranch(taskId: string, integrationBranch: string): void {
    const branchName = `worktree/${taskId}`
    try {
      this.execGit(['checkout', integrationBranch])
    } catch {}
    try {
      this.execGit(['branch', '-D', branchName])
    } catch {}
  }

  removeScratchWorktree(worktreePath: string): void {
    if (!fs.existsSync(worktreePath)) return
    try {
      const branch = this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath)
      this.execGit(['worktree', 'remove', '--force', worktreePath])
      if (branch && branch !== 'HEAD') {
        this.execGit(['branch', '-D', branch])
      }
    } catch {}
    try { fs.rmSync(worktreePath, { recursive: true, force: true }) } catch {}
  }

  installDependencies(worktreePath: string): { ok: boolean; output?: string; error?: string } {
    const pm = detectPackageManager(worktreePath)
    if (!pm) return { ok: true, output: 'No package manager detected, skipping install' }

    const cmd = detectInstallCommand(pm)
    if (!cmd) return { ok: true, output: 'No install command for detected package manager, skipping' }

    try {
      const output = execFileSync(cmd[0], cmd.slice(1), {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      })
      return { ok: true, output: output.slice(0, 2000) }
    } catch (e) {
      return { ok: false, error: `Dependency install failed for ${pm}: ${(e as Error).message.slice(0, 1000)}` }
    }
  }

  removeWorktree(id: string, integrationBranch?: string): void {
    const branchName = `worktree/${id}`
    const worktreePath = path.join(this.baseDir, id)

    if (!fs.existsSync(worktreePath)) {
      this.deleteBranchIfMerged(branchName, integrationBranch)
      return
    }

    try {
      this.execGit(['worktree', 'remove', worktreePath])
    } catch {
      try {
        this.execGit(['worktree', 'remove', '--force', worktreePath])
      } catch {}
    }

    this.deleteBranchIfMerged(branchName, integrationBranch)

    try {
      fs.rmSync(worktreePath, { recursive: true, force: true })
    } catch {}
  }

  private deleteBranchIfMerged(branchName: string, integrationBranch?: string): void {
    if (!integrationBranch) return
    try {
      // git merge-base --is-ancestor exits 0 (true) when the branch has been
      // merged into the integration branch. Only delete merged branches so
      // unmerged work is never destroyed by teardown.
      this.execGit(['merge-base', '--is-ancestor', branchName, integrationBranch])
      this.execGit(['branch', '-D', branchName])
    } catch {
      // Branch is unmerged (or missing) — keep it so the work survives.
    }
  }

  worktreeExists(id: string): boolean {
    return fs.existsSync(path.join(this.baseDir, id))
  }

  getWorktreePath(id: string): string {
    return path.join(this.baseDir, id)
  }

  getBranchName(id: string): string {
    return `worktree/${id}`
  }

  cleanupScratchWorktrees(): void {
    if (!fs.existsSync(this.baseDir)) return
    for (const entry of fs.readdirSync(this.baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('scratch-')) continue
      this.removeScratchWorktree(path.join(this.baseDir, entry.name))
    }
  }

  // 5.1 crash recovery: remove task worktrees whose task is no longer active
  // (done / abandoned / missing). Follows the merged-branch-only rule so an
  // unmerged branch's work survives. Returns the count removed.
  sweepOrphanWorktrees(activeTaskIds: Set<string>, integrationBranch?: string): number {
    if (!fs.existsSync(this.baseDir)) return 0
    let removed = 0
    for (const entry of fs.readdirSync(this.baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('scratch-')) continue
      const taskId = entry.name
      if (activeTaskIds.has(taskId)) continue
      try {
        this.removeWorktree(taskId, integrationBranch)
        removed++
      } catch {}
    }
    return removed
  }
}
