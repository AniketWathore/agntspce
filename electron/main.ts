import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { SessionManager } from './services/sessionManager'
import { WorkspaceManager } from './services/workspaceManager'
import { StatusDetector } from './services/statusDetector'
import { GitHelper } from './services/gitHelper'
import { WorktreeHelper } from './services/worktreeHelper'
import { AgentManager } from './services/agentManager'

const isDev = process.env.VITE_DEV_SERVER_URL
let mainWindow: BrowserWindow | null = null

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

  socket.on('terminal-input', ({ sessionId, data, input }) => {
    const inputData = data || input
    if (!inputData) return
    sessionManager.writeToSession(sessionId, inputData)
  })

  socket.on('terminal-resize', ({ sessionId, cols, rows }) => {
    sessionManager.resizeSession(sessionId, cols, rows)
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

  socket.on('delete-workspace', async ({ workspaceId }) => {
    try {
      await workspaceManager.deleteWorkspace(workspaceId)
      io.emit('workspaces-list', workspaceManager.listWorkspaces())
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to delete workspace', error: error.message })
    }
  })

  socket.on('create-raw-session', ({ type, workspacePath }) => {
    const t = String(type || '').trim().toLowerCase() || 'shell'
    const result = sessionManager.createRawSession(t, workspacePath)
    if (result) {
      const states = sessionManager.getSessionStates()
      socket.emit('session-created', { sessionId: result.sessionId, sessions: states })
    } else {
      socket.emit('error', { message: 'Failed to create session - check main process console for details' })
    }
  })

  socket.on('start-agent', ({ sessionId, config }) => {
    try {
      sessionManager.startAgentWithConfig(sessionId, config)
      socket.emit('agent-started', { sessionId, config })
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to start agent', error: error.message })
    }
  })

  socket.on('close-tab', ({ sessionIds }) => {
    const ids = Array.isArray(sessionIds) ? sessionIds : []
    for (const id of ids) {
      sessionManager.closeSession(id)
      io.emit('session-closed', { sessionId: id })
    }
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
    }
  } catch (e) {
    console.error('Failed to initialize workspace system:', e)
  }

  httpServer.listen(SERVER_PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${SERVER_PORT}`)
  })
}

// Electron window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Agent Workspace',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}

// IPC handlers
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-server-port', () => SERVER_PORT)

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
