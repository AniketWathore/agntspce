import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { Workspace } from './types'

export class WorktreeHelper {
  // Validate a namingPattern-derived name: allow letters, digits, dot, dash,
  // underscore and `/` for nesting, but reject anything that could escape the
  // repo (.., absolute paths, whitespace, shell-active characters).
  private safeWorktreeName(pattern: string, n: string): string {
    const name = pattern.replace('{n}', n)
    if (!/^[A-Za-z0-9._\-/]+$/.test(name) || name.includes('..') || name.startsWith('/')) {
      throw new Error(`Unsafe worktree name from namingPattern: "${name}"`)
    }
    return name
  }

  async resolvePrimaryDir(repoPath: string): Promise<string> {
    for (const dir of ['master', 'main']) {
      try {
        await fs.access(path.join(repoPath, dir))
        return path.join(repoPath, dir)
      } catch { }
    }
    return path.join(repoPath, 'master')
  }

  async resolvePreferredBaseBranch(masterPath: string, preferredBranch = 'master'): Promise<string> {
    const candidates = preferredBranch === 'master' ? ['master', 'main'] : [preferredBranch, 'master', 'main']
    for (const branch of candidates) {
      try {
        await this.execGit(`git rev-parse --verify ${branch}`, masterPath)
        return branch
      } catch { }
    }
    throw new Error(`No usable base branch found (${candidates.join(', ')})`)
  }

  async createWorktree(workspace: Workspace, worktreeId: string): Promise<string> {
    const repo = workspace.repository!
    const worktreeName = this.safeWorktreeName(workspace.worktrees!.namingPattern, worktreeId.replace('work', ''))
    const worktreePath = path.join(repo.path, worktreeName)
    const masterPath = await this.resolvePrimaryDir(repo.path)

    try {
      await fs.access(worktreePath)
      return worktreePath
    } catch { }

    await fs.access(masterPath)

    let defaultBranch = repo.masterBranch || 'master'
    try {
      await this.execGit(['rev-parse', '--verify', defaultBranch], masterPath)
    } catch {
      if (defaultBranch === 'master') {
        try {
          await this.execGit(['rev-parse', '--verify', 'main'], masterPath)
          defaultBranch = 'main'
        } catch {
          throw new Error('Neither master nor main branch found')
        }
      } else {
        throw new Error(`Branch ${defaultBranch} not found`)
      }
    }

    const branchName = `${worktreeName}-dev`
    try {
      await this.execGit(['branch', '-D', branchName], masterPath)
    } catch { }

    await this.execGit(['worktree', 'add', `../${worktreeName}`, '-b', branchName, defaultBranch], masterPath)
    await fs.access(worktreePath)
    return worktreePath
  }

  async removeWorktree(workspace: Workspace, worktreeId: string): Promise<void> {
    const worktreeName = this.safeWorktreeName(workspace.worktrees!.namingPattern, worktreeId.replace('work', ''))
    const masterPath = await this.resolvePrimaryDir(workspace.repository!.path)
    await this.execGit(['worktree', 'remove', worktreeName], masterPath)
  }

  async ensureWorktreesExist(workspace: Workspace): Promise<string[]> {
    if (!workspace.repository?.path || !workspace.worktrees?.enabled) return []

    const created: string[] = []
    for (let i = 1; i <= (workspace.terminals?.pairs || 1); i++) {
      const worktreeId = `work${i}`
      let worktreeName: string
      try {
        worktreeName = this.safeWorktreeName(workspace.worktrees.namingPattern, String(i))
      } catch {
        continue
      }
      const worktreePath = path.join(workspace.repository.path, worktreeName)
      try {
        await fs.access(worktreePath)
      } catch {
        if (workspace.worktrees.autoCreate) {
          try {
            await this.createWorktree(workspace, worktreeId)
            created.push(worktreeId)
          } catch { }
        }
      }
    }
    return created
  }

  private execGit(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd, stdio: 'pipe', windowsHide: true })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim())
        else reject(new Error(`Git command failed: git ${args.join(' ')}\nExit: ${code}\n${stderr}`))
      })
      child.on('error', (e) => reject(new Error(`Failed to execute: git ${args.join(' ')}\n${e.message}`)))
    })
  }
}
