import type { Socket } from 'socket.io'
import type { ServerContext } from '../context'

export function registerGitHandlers(ctx: ServerContext, socket: Socket): void {
  socket.on('get-git-log', async ({ worktreePath, maxCount }: { worktreePath: string, maxCount?: number }, callback?: Function) => {
    try {
      const log = await ctx.gitHelper.getLog(worktreePath, maxCount)
      callback?.({ ok: true, log })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-diff', async ({ worktreePath, base, head }: { worktreePath: string, base?: string, head?: string }, callback?: Function) => {
    try {
      const diff = await ctx.gitHelper.getDiff(worktreePath, base, head)
      callback?.({ ok: true, diff })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-branches', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const branches = await ctx.gitHelper.getBranches(worktreePath)
      callback?.({ ok: true, branches })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-working-tree-diff', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const diff = await ctx.gitHelper.getWorkingTreeDiff(worktreePath)
      callback?.({ ok: true, diff })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-commit-files', async ({ worktreePath, commitHash }: { worktreePath: string, commitHash: string }, callback?: Function) => {
    try {
      const files = await ctx.gitHelper.getCommitFiles(worktreePath, commitHash)
      callback?.({ ok: true, files })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-working-tree-files', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const files = await ctx.gitHelper.getWorkingTreeFiles(worktreePath)
      callback?.({ ok: true, files })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-file-diff', async ({ worktreePath, filePath, base, head }: { worktreePath: string, filePath: string, base?: string, head?: string }, callback?: Function) => {
    try {
      const diff = await ctx.gitHelper.getFileDiff(worktreePath, filePath, base, head)
      callback?.({ ok: true, diff })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-full-status', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const status = await ctx.gitHelper.getFullStatus(worktreePath)
      callback?.({ ok: true, status })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-revert-file', async ({ worktreePath, filePath }: { worktreePath: string, filePath: string }, callback?: Function) => {
    try {
      const ok = await ctx.gitHelper.revertFile(worktreePath, filePath)
      callback?.({ ok })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-stage-file', async ({ worktreePath, filePath }: { worktreePath: string, filePath: string }, callback?: Function) => {
    try {
      const ok = await ctx.gitHelper.stageFile(worktreePath, filePath)
      callback?.({ ok })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-unstage-file', async ({ worktreePath, filePath }: { worktreePath: string, filePath: string }, callback?: Function) => {
    try {
      const ok = await ctx.gitHelper.unstageFile(worktreePath, filePath)
      callback?.({ ok })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-stage-all', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const ok = await ctx.gitHelper.stageAll(worktreePath)
      callback?.({ ok })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-unstage-all', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const ok = await ctx.gitHelper.unstageAll(worktreePath)
      callback?.({ ok })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-commit', async ({ worktreePath, message }: { worktreePath: string, message: string }, callback?: Function) => {
    try {
      const result = await ctx.gitHelper.commit(worktreePath, message)
      callback?.(result)
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-pull', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const result = await ctx.gitHelper.pull(worktreePath)
      callback?.(result)
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-push', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const result = await ctx.gitHelper.push(worktreePath)
      callback?.(result)
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-fetch', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const result = await ctx.gitHelper.fetch(worktreePath)
      callback?.(result)
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })

  socket.on('git-discard-all', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const ok = await ctx.gitHelper.discardAll(worktreePath)
      callback?.({ ok })
    } catch (error: any) {
      if (callback) callback?.({ ok: false, error: error.message })
    }
  })
}
