import { app, BrowserWindow } from 'electron'
import 'dotenv/config'
import { initialize as initRtk } from './services/rtkManager'
import { initialize as initSearch, injectClaudeCodeConfig, injectOpenCodeConfig } from './services/searchManager'
import { ensureCoordinator, getWorkspaceRoot } from './services/orchestration/bootstrap'
import type { Coordinator } from './services/orchestration'
import type { StateManager } from './services/orchestration/stateManager'
import { bootstrapServer } from './server'
import { createWindow, getMainWindow, registerIpcHandlers, rebuildMenu } from './window'
app.setName('AgntSpce')
app.name = 'AgntSpce'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

let orchestrationCoordinator: Coordinator | null = null

let orchestrationStateManager: StateManager | null = null

let serverHandle: ReturnType<typeof bootstrapServer> | null = null

function startServer() {
  serverHandle = bootstrapServer(app.getPath('userData'), rebuildMenu, orchestrationStateManager)
  return serverHandle
}

app.whenReady().then(async () => {
  // Initialize RTK: install binary to userData + register agent hooks
  initRtk()

  // Initialize search: install bundled search distribution to userData
  initSearch()
  injectOpenCodeConfig()

  // Initialize orchestration coordinator (zero-config bootstrap)
  if (!getWorkspaceRoot()) {
    console.warn('[orchestration] No workspace root found — skipping coordinator')
  } else {
    const result = await ensureCoordinator()
    if (result.status === 'started') {
      orchestrationCoordinator = result.coordinator
      orchestrationStateManager = result.stateManager
      console.log('[orchestration] Coordinator started')
    } else if (result.status === 'already_running') {
      orchestrationStateManager = result.stateManager
      console.log('[orchestration] Coordinator already running for', result.workspaceRoot)
    } else if (result.status === 'error') {
      console.error('[orchestration] Coordinator error:', result.error)
    }
  }

  registerIpcHandlers(rebuildMenu)
  createWindow()

  const server = startServer()
  const ctx = server.ctx

  try {
    await ctx.workspaceManager.initialize()
    const activeWs = ctx.workspaceManager.getActiveWorkspace()
    if (activeWs) {
      ctx.sessionManager.setWorkspace(activeWs)
      await ctx.worktreeHelper.ensureWorktreesExist(activeWs)
      try { await ctx.workspaceManager.runSetupScript(activeWs) } catch (e) {
        console.warn('Setup script failed on boot:', e)
      }
      // Check for saved sessions first. If they exist (with correct agent types),
      // restore them directly and skip creating default sessions from workspace.terminals.
      // This prevents wrong-type or duplicate sessions on app restart.
      const savedSessions = await ctx.workspaceManager.loadSessionState(activeWs.id)
      if (savedSessions.length > 0) {
        await ctx.sessionManager.restoreSessions(savedSessions)
      } else {
        await ctx.sessionManager.initializeSessions()
      }
      if (activeWs.repository?.path) {
        injectClaudeCodeConfig(activeWs.repository.path)
      }
    }
    rebuildMenu()
  } catch (e) {
    console.error('Failed to initialize workspace system:', e)
  }

  server.listen()
})

app.on('will-quit', () => {
  if (orchestrationCoordinator) {
    orchestrationCoordinator.close()
    orchestrationCoordinator = null
  }
  const ctx = serverHandle?.ctx
  if (ctx) {
    ctx.agentOrchestrator.shutdownAll()
    const ws = ctx.sessionManager.getWorkspace()
    if (ws?.id) {
      const sessions = ctx.sessionManager.getSessionSaveData()
      ctx.workspaceManager.saveSessionStateSync(ws.id, sessions)
      ctx.sessionManager.saveAllSessionBuffersSync()
      ctx.sessionManager.outputFilter.persistCumulativeStats()
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
