import type { Socket } from 'socket.io'
import type { ServerContext } from '../context'
import path from 'node:path'
import fs from 'node:fs/promises'

function resolveWorkspaceRoot(ctx: ServerContext): string {
  const ws = ctx.workspaceManager.getActiveWorkspace()
  if (!ws?.repository?.path) return ''
  return path.resolve(ws.repository.path)
}

function isPathInWorkspace(ctx: ServerContext, targetPath: string): boolean {
  const root = resolveWorkspaceRoot(ctx)
  if (!root) return false
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget === root || resolvedTarget.startsWith(root + path.sep)
}

async function getRepoRoot(wsPath: string): Promise<string> {
  try {
    const { spawnSync } = await import('child_process')
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: wsPath, encoding: 'utf8', timeout: 5000, windowsHide: true })
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim()
    }
    return wsPath
  } catch {
    return wsPath
  }
}

export function registerFileHandlers(ctx: ServerContext, socket: Socket): void {
  socket.on('get-workspace-tree', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      if (!isPathInWorkspace(ctx, worktreePath)) {
        if (callback) callback({ ok: false, error: 'Path is outside the workspace' })
        return
      }
      const root = await getRepoRoot(worktreePath)
      async function readDir(dirPath: string, relativeRoot: string): Promise<any[]> {
        const entries: any[] = []
        const dirEntries = await fs.readdir(dirPath, { withFileTypes: true })
        dirEntries.sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        for (const entry of dirEntries) {
          if (entry.name.startsWith('.')) continue
          const fullPath = path.join(dirPath, entry.name)
          const relativePath = path.relative(relativeRoot, fullPath).replace(/\\/g, '/')
          if (entry.isDirectory()) {
            const children = await readDir(fullPath, relativeRoot)
            entries.push({ name: entry.name, path: relativePath, type: 'directory', children })
          } else {
            entries.push({ name: entry.name, path: relativePath, type: 'file' })
          }
        }
        return entries
      }
      const tree = await readDir(root, root)
      if (callback) callback({ ok: true, tree, root })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error?.message || String(error) })
    }
  })

  socket.on('read-file', async ({ absolutePath }: { absolutePath: string }, callback?: Function) => {
    try {
      if (!isPathInWorkspace(ctx, absolutePath)) {
        if (callback) callback({ ok: false, error: 'Path is outside the workspace' })
        return
      }
      const stat = await fs.stat(absolutePath)
      if (stat.isDirectory()) {
        if (callback) callback({ ok: false, error: 'Is a directory' })
        return
      }
      const content = await fs.readFile(absolutePath, 'utf-8')
      if (callback) callback({ ok: true, content })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('write-file', async ({ absolutePath, content }: { absolutePath: string, content: string }, callback?: Function) => {
    try {
      if (!isPathInWorkspace(ctx, absolutePath)) {
        if (callback) callback({ ok: false, error: 'Path is outside the workspace' })
        return
      }
      await fs.writeFile(absolutePath, content, 'utf-8')
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('create-file', async ({ absolutePath }: { absolutePath: string }, callback?: Function) => {
    try {
      if (!isPathInWorkspace(ctx, absolutePath)) {
        if (callback) callback({ ok: false, error: 'Path is outside the workspace' })
        return
      }
      await fs.writeFile(absolutePath, '', 'utf-8')
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('create-folder', async ({ absolutePath }: { absolutePath: string }, callback?: Function) => {
    try {
      if (!isPathInWorkspace(ctx, absolutePath)) {
        if (callback) callback({ ok: false, error: 'Path is outside the workspace' })
        return
      }
      await fs.mkdir(absolutePath, { recursive: true })
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('rename-file', async ({ oldPath, newPath }: { oldPath: string, newPath: string }, callback?: Function) => {
    try {
      if (!isPathInWorkspace(ctx, oldPath) || !isPathInWorkspace(ctx, newPath)) {
        if (callback) callback({ ok: false, error: 'Path is outside the workspace' })
        return
      }
      await fs.rename(oldPath, newPath)
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('delete-file', async ({ absolutePath }: { absolutePath: string }, callback?: Function) => {
    try {
      if (!isPathInWorkspace(ctx, absolutePath)) {
        if (callback) callback({ ok: false, error: 'Path is outside the workspace' })
        return
      }
      const stat = await fs.stat(absolutePath)
      if (stat.isDirectory()) {
        await fs.rm(absolutePath, { recursive: true, force: true })
      } else {
        await fs.unlink(absolutePath)
      }
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })
}
