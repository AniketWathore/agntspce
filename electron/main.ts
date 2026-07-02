import { app, BrowserWindow, dialog, ipcMain, Menu, screen } from 'electron'
import path from 'node:path'
import os from 'node:os'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { SessionManager } from './services/sessionManager'
import { WorkspaceManager } from './services/workspaceManager'
import { StatusDetector } from './services/statusDetector'
import { GitHelper } from './services/gitHelper'
import { WorktreeHelper } from './services/worktreeHelper'
import { AgentManager } from './services/agentManager'

const isMac = process.platform === 'darwin'
const isDev = process.env.VITE_DEV_SERVER_URL
let mainWindow: BrowserWindow | null = null
app.setName('AgntSpce')
app.name = 'AgntSpce'

function sendMenuAction(action: string, data?: any) {
  mainWindow?.webContents.send('menu-action', action, data)
}

function createNewWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'AgntSpce',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!)
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}

// Express + Socket.IO server
const app_ = express()
const httpServer = createServer(app_)
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
  },
})

const SERVER_PORT = 9460

// Initialize services
const workspaceManager = WorkspaceManager.getInstance()
const agentManager = new AgentManager()
const sessionManager = new SessionManager(io, agentManager)
const statusDetector = new StatusDetector()
const gitHelper = new GitHelper()
const worktreeHelper = new WorktreeHelper()

sessionManager.setStatusDetector(statusDetector)
sessionManager.setGitHelper(gitHelper)

async function autoSaveSessions() {
  const ws = sessionManager.getWorkspace()
  if (!ws?.id) return
  const sessions = sessionManager.getSessionSaveData()
  await workspaceManager.saveSessionState(ws.id, sessions)
}

function rebuildMenu() {
  const recent = workspaceManager.getRecentWorkspaces()
  const recentItems: Electron.MenuItemConstructorOptions[] = recent.length > 0
    ? [
        { type: 'separator' as const },
        { label: 'Recent Workspaces', enabled: false },
        ...recent.map(r => ({
          label: r.name,
          click: () => sendMenuAction('switch-workspace', r.id),
        })),
      ]
    : []

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createNewWindow() },
        { label: 'New Workspace', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendMenuAction('new-workspace') },
        { label: 'New Agent', accelerator: 'CmdOrCtrl+Shift+A', click: () => sendMenuAction('new-agent') },
        { label: 'New Shell', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('new-shell') },
        { type: 'separator' as const },
        { label: 'Duplicate Workspace', click: () => sendMenuAction('duplicate-workspace') },
        { label: 'Load Workspace', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('load-workspace') },
        ...recentItems,
        { type: 'separator' as const },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save-workspace') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction('save-workspace-as') },
        { type: 'separator' as const },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+W', role: 'close' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
        { type: 'separator' as const },
        { role: 'find' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { role: 'resetZoom' as const },
        { type: 'separator' as const },
        {
          label: 'Toggle Shell Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendMenuAction('toggle-shell-sidebar'),
        },
        {
          label: 'Toggle Workspace Sidebar',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => sendMenuAction('toggle-workspace-sidebar'),
        },
        { type: 'separator' as const },
        {
          label: 'Focus Active Terminal',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendMenuAction('toggle-focus'),
        },
        { type: 'separator' as const },
        {
          label: 'Layout',
          submenu: [
            { label: 'Auto', click: () => sendMenuAction('set-layout', 'auto') },
            { label: '1×1', click: () => sendMenuAction('set-layout', '1x1') },
            { label: '2×2', click: () => sendMenuAction('set-layout', '2x2') },
            { label: '1+2', click: () => sendMenuAction('set-layout', '1+2') },
            { label: '3×3', click: () => sendMenuAction('set-layout', '3x3') },
          ],
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        {
          label: 'Fill',
          click: () => {
            if (!mainWindow) return
            const { width, height } = screen.getPrimaryDisplay().workAreaSize
            mainWindow.setBounds({ x: 0, y: 0, width, height })
          },
        },
        {
          label: 'Center',
          click: () => mainWindow?.center(),
        },
        { type: 'separator' as const },
        {
          label: 'Tile to Left',
          click: () => {
            if (!mainWindow) return
            const { width, height } = screen.getPrimaryDisplay().workAreaSize
            mainWindow.setBounds({ x: 0, y: 0, width: Math.floor(width / 2), height })
          },
        },
        {
          label: 'Tile to Right',
          click: () => {
            if (!mainWindow) return
            const { width, height } = screen.getPrimaryDisplay().workAreaSize
            mainWindow.setBounds({ x: Math.floor(width / 2), y: 0, width: Math.floor(width / 2), height })
          },
        },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => sendMenuAction('show-shortcuts'),
        },
        { type: 'separator' as const },
        {
          label: 'About AgntSpce',
          click: () => sendMenuAction('show-about'),
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app_.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})
app_.use(express.json())

// API routes
app_.get('/api/status', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    sessions: sessionManager.getSessionStates(),
    activeWorkspace: workspaceManager.getActiveWorkspace()?.name || null,
  })
})

app_.get('/api/workspaces', (_req, res) => {
  res.json(workspaceManager.listWorkspaces())
})

app_.get('/api/sessions', (_req, res) => {
  res.json(sessionManager.getSessionStates())
})

app_.get('/api/agents', (_req, res) => {
  const agents = agentManager.getAllAgents().map(a => agentManager.getUIConfig(a.id))
  res.json(agents)
})

// Socket.IO
io.on('connection', (socket) => {
  const activeWs = workspaceManager.getActiveWorkspace()
  socket.emit('workspace-info', {
    active: activeWs,
    available: workspaceManager.listWorkspaces(),
    config: workspaceManager.getConfig(),
  })
  socket.emit('sessions', sessionManager.getSessionStates())

  const backlog = sessionManager.getUndeliveredOutputAndMarkDelivered()
  if (Object.keys(backlog).length > 0) {
    socket.emit('backlog', backlog)
  }

  socket.on('terminal-input', ({ sessionId, data, input }) => {
    const inputData = data || input
    if (!inputData) return
    sessionManager.writeToSession(sessionId, inputData)
  })

  socket.on('terminal-resize', ({ sessionId, cols, rows }) => {
    sessionManager.resizeSession(sessionId, cols, rows)
  })

  socket.on('toggle-token-reduction', ({ sessionId, enabled }) => {
    if (enabled !== undefined) {
      sessionManager.tokenReduction.setEnabled(sessionId, enabled)
    } else {
      const state = sessionManager.tokenReduction.toggle(sessionId)
      socket.emit('token-reduction-state', { sessionId, enabled: state })
    }
  })

  socket.on('get-token-reduction-state', ({ sessionId }) => {
    const config = sessionManager.tokenReduction.getConfig(sessionId)
    socket.emit('token-reduction-state', { sessionId, enabled: config.enabled })
  })

  socket.on('get-compression-stats', ({ sessionId }) => {
    if (sessionId) {
      const stats = sessionManager.tokenReduction.getSessionStats(sessionId)
      const history = sessionManager.tokenReduction.getSessionHistory(sessionId)
      socket.emit('compression-stats', { sessionId, stats, history })
    } else {
      const allStats = sessionManager.tokenReduction.getAllStats()
      socket.emit('compression-stats-all', allStats)
    }
  })

  socket.on('restart-session', ({ sessionId }) => {
    sessionManager.restartSession(sessionId)
  })

  socket.on('switch-workspace', async ({ workspaceId }) => {
    try {
      const newWs = await workspaceManager.switchWorkspace(workspaceId)
      await worktreeHelper.ensureWorktreesExist(newWs)
      const { sessions } = await sessionManager.switchWorkspacePreservingSessions(newWs)
      socket.emit('workspace-changed', { workspace: newWs, sessions })
      rebuildMenu()
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to switch workspace', error: error.message })
    }
  })

  socket.on('list-workspaces', async () => {
    socket.emit('workspaces-list', workspaceManager.listWorkspaces())
  })

  socket.on('create-workspace', async (data: any, callback?: Function) => {
    try {
      const ws = await workspaceManager.createWorkspace(data)
      if (callback) callback({ ok: true, workspace: ws })
      io.emit('workspaces-list', workspaceManager.listWorkspaces())
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('list-deleted-workspaces', async (_data: any, callback?: Function) => {
    const deleted = await workspaceManager.listDeletedWorkspaces()
    if (callback) callback(deleted)
  })

  socket.on('restore-workspace', async ({ workspaceId }, callback?: Function) => {
    const ws = await workspaceManager.restoreWorkspace(workspaceId)
    if (ws) {
      io.emit('workspaces-list', workspaceManager.listWorkspaces())
      if (callback) callback({ ok: true, workspace: ws })
    } else {
      if (callback) callback({ ok: false })
    }
  })

  socket.on('permanent-delete-workspace', async ({ workspaceId }, callback?: Function) => {
    await workspaceManager.permanentDeleteWorkspace(workspaceId)
    if (callback) callback({ ok: true })
  })

  socket.on('delete-workspace', async ({ workspaceId }) => {
    try {
      await workspaceManager.deleteWorkspace(workspaceId)
      io.emit('workspaces-list', workspaceManager.listWorkspaces())
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to delete workspace', error: error.message })
    }
  })

  socket.on('create-raw-session', async ({ type, workspacePath }) => {
    const t = String(type || '').trim().toLowerCase() || 'shell'
    const result = sessionManager.createRawSession(t, workspacePath)
    if (result) {
      const states = sessionManager.getSessionStates()
      socket.emit('session-created', { sessionId: result.sessionId, sessions: states })
      await autoSaveSessions()
    } else {
      socket.emit('error', { message: 'Failed to create session - check main process console for details' })
    }
  })

  socket.on('create-agent-session', async ({ type, workspacePath, config }) => {
    const t = String(type || '').trim().toLowerCase() || 'shell'
    const result = sessionManager.createRawSession(t, workspacePath)
    if (result) {
      try {
        sessionManager.startAgentWithConfig(result.sessionId, config)
      } catch (e: any) {
        socket.emit('error', { message: 'Agent start failed', error: e.message })
      }
      const states = sessionManager.getSessionStates()
      socket.emit('session-created', { sessionId: result.sessionId, sessions: states })
      await autoSaveSessions()
    } else {
      socket.emit('error', { message: 'Failed to create session' })
    }
  })

  socket.on('start-agent', async ({ sessionId, config }) => {
    try {
      sessionManager.startAgentWithConfig(sessionId, config)
      socket.emit('agent-started', { sessionId, config })
      await autoSaveSessions()
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to start agent', error: error.message })
    }
  })

  socket.on('close-tab', async ({ sessionIds }) => {
    const ids = Array.isArray(sessionIds) ? sessionIds : []
    for (const id of ids) {
      sessionManager.closeSession(id)
      io.emit('session-closed', { sessionId: id })
    }
    await autoSaveSessions()
  })
})

// Start server
async function startServer() {
  try {
    await workspaceManager.initialize()
    const activeWs = workspaceManager.getActiveWorkspace()
    if (activeWs) {
      sessionManager.setWorkspace(activeWs)
      await sessionManager.initializeSessions()
      const savedSessions = await workspaceManager.loadSessionState(activeWs.id)
      if (savedSessions.length > 0) {
        await sessionManager.restoreSessions(savedSessions)
      }
    }
  } catch (e) {
    console.error('Failed to initialize workspace system:', e)
  }

  rebuildMenu()
  httpServer.listen(SERVER_PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${SERVER_PORT}`)
  })
}

// Electron window
function createWindow() {
  rebuildMenu()
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'AgntSpce',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!)
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}

// IPC handlers
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    parent: mainWindow || undefined,
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-default-path', () => os.homedir())

ipcMain.handle('get-server-port', () => SERVER_PORT)

ipcMain.handle('export-workspace', async () => {
  const activeId = workspaceManager.getActiveWorkspace()?.id
  if (!activeId) throw new Error('No active workspace')
  const ws = workspaceManager.getWorkspace(activeId)
  if (!ws) throw new Error('Workspace not found')
  const result = await dialog.showSaveDialog({
    defaultPath: `${ws.name}.workspace`,
    filters: [{ name: 'Workspace Files', extensions: ['workspace'] }],
  })
  if (result.canceled || !result.filePath) return null
  await workspaceManager.exportWorkspace(activeId, result.filePath)
  return result.filePath
})

ipcMain.handle('import-workspace', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Workspace Files', extensions: ['workspace'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const ws = await workspaceManager.importWorkspace(result.filePaths[0])
  rebuildMenu()
  return { workspace: ws, path: result.filePaths[0] }
})

ipcMain.handle('duplicate-workspace', async (_event, newName: string) => {
  const activeId = workspaceManager.getActiveWorkspace()?.id
  if (!activeId) throw new Error('No active workspace')
  const dup = await workspaceManager.duplicateWorkspace(activeId, newName)
  rebuildMenu()
  return dup
})

app.whenReady().then(async () => {
  createWindow()
  await startServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
