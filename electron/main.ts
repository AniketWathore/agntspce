import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { SessionManager } from './services/sessionManager'
import { WorkspaceManager } from './services/workspaceManager'
import { StatusDetector } from './services/statusDetector'
import { GitHelper } from './services/gitHelper'
import { WorktreeHelper } from './services/worktreeHelper'
import { AgentManager } from './services/agentManager'
import { AgentOrchestrator } from './services/agentOrchestrator'
import { checkAgentsInstalled } from './services/agentResolver'
import { ChatManager } from './services/chatManager'
import { initialize as initRtk } from './services/rtkManager'
import { initialize as initSearch, injectClaudeCodeConfig, injectOpenCodeConfig } from './services/searchManager'
import { ensureCoordinator, getWorkspaceRoot } from './services/orchestration/bootstrap'
import type { Coordinator } from './services/orchestration'

const isMac = process.platform === 'darwin'
const isDev = process.env.VITE_DEV_SERVER_URL
let mainWindow: BrowserWindow | null = null
app.setName('AgntSpce')
app.name = 'AgntSpce'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

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
    ...(isMac ? { titleBarStyle: 'hidden' as const } : { frame: false }),
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.maximize()
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
const sessionManager = new SessionManager(io, agentManager, app.getPath('userData'))
const statusDetector = new StatusDetector()
const gitHelper = new GitHelper()
const worktreeHelper = new WorktreeHelper()
const agentOrchestrator = new AgentOrchestrator(io)

sessionManager.setStatusDetector(statusDetector)
sessionManager.setGitHelper(gitHelper)
sessionManager.orchestrator = agentOrchestrator

const chatManager = new ChatManager()

let orchestrationCoordinator: Coordinator | null = null

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

  const template: Electron.MenuItemConstructorOptions[] = isMac
    ? [
        // ── App Menu (macOS only) ──────────────────────────────────────
        {
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { label: 'Hide AgntSpce', role: 'hide' as const },
            { label: 'Hide Others', role: 'hideOthers' as const },
            { label: 'Show All', role: 'unhide' as const },
            { type: 'separator' as const },
            { label: 'Quit AgntSpce', role: 'quit' as const },
          ],
        },
        // ── File Menu (macOS) ──────────────────────────────────────────
        {
          label: 'File',
          submenu: [
            { label: 'New Window', accelerator: 'Cmd+N', click: () => createNewWindow() },
            { label: 'New Workspace', accelerator: 'Cmd+Shift+N', click: () => sendMenuAction('new-workspace') },
            { label: 'New Agent', accelerator: 'Cmd+Shift+A', click: () => sendMenuAction('new-agent') },
            { label: 'New Shell', accelerator: 'Cmd+Shift+S', click: () => sendMenuAction('new-shell') },
            { type: 'separator' as const },
            { label: 'Duplicate Workspace', click: () => sendMenuAction('duplicate-workspace') },
            { label: 'Load Workspace', accelerator: 'Cmd+O', click: () => sendMenuAction('load-workspace') },
            ...recentItems,
            { type: 'separator' as const },
            { label: 'Save', accelerator: 'Cmd+S', click: () => sendMenuAction('save-workspace') },
            { label: 'Save As...', accelerator: 'Cmd+Shift+S', click: () => sendMenuAction('save-workspace-as') },
            { type: 'separator' as const },
            { label: 'Close Window', accelerator: 'Cmd+W', role: 'close' as const },
          ],
        },
        // ── Edit Menu (macOS native) ───────────────────────────────────
        {
          label: 'Edit',
          submenu: [
            { label: 'Undo', accelerator: 'Cmd+Z', role: 'undo' as const },
            { label: 'Redo', accelerator: 'Cmd+Shift+Z', role: 'redo' as const },
            { type: 'separator' as const },
            { label: 'Cut', accelerator: 'Cmd+X', role: 'cut' as const },
            { label: 'Copy', accelerator: 'Cmd+C', role: 'copy' as const },
            { label: 'Paste', accelerator: 'Cmd+V', role: 'paste' as const },
            { label: 'Select All', accelerator: 'Cmd+A', role: 'selectAll' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { label: 'Auto Fill', click: () => {} },
            { role: 'startDictation' as const },
            { role: 'emojiAndSymbols' as const },
          ],
        },
        // ── View Menu (macOS) ──────────────────────────────────────────
        {
          label: 'View',
          submenu: [
            { label: 'Zoom In', accelerator: 'Cmd+=', role: 'zoomIn' as const },
            { label: 'Zoom Out', accelerator: 'Cmd+-', role: 'zoomOut' as const },
            { label: 'Actual Size', accelerator: 'Cmd+0', role: 'resetZoom' as const },
            { type: 'separator' as const },
            {
              label: 'Toggle Shell Sidebar',
              accelerator: 'Cmd+B',
              click: () => sendMenuAction('toggle-shell-sidebar'),
            },
            {
              label: 'Toggle Workspace Sidebar',
              accelerator: 'Cmd+Shift+B',
              click: () => sendMenuAction('toggle-workspace-sidebar'),
            },
            { type: 'separator' as const },
            {
              label: 'Focus Active Terminal',
              accelerator: 'Cmd+Shift+F',
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
        // ── Window Menu (macOS) ────────────────────────────────────────
        {
          label: 'Window',
          submenu: [
            { label: 'Minimize', accelerator: 'Cmd+M', role: 'minimize' as const },
            { label: 'Zoom', role: 'zoom' as const },
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
            { label: 'Toggle Full Screen', accelerator: 'Cmd+Ctrl+F', role: 'togglefullscreen' as const },
            { type: 'separator' as const },
            { label: 'Bring All to Front', role: 'front' as const },
          ],
        },
        // ── Help Menu (macOS) ──────────────────────────────────────────
        {
          label: 'Help',
          submenu: [
            { label: 'Search', click: () => {} },
            { type: 'separator' as const },
            {
              label: 'Keyboard Shortcuts',
              accelerator: 'Cmd+/',
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
    // ── Windows Menu (unchanged) ──────────────────────────────────────
    : [
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
              // No accelerators on clipboard items — the implicit accelerators
              // from role would intercept Ctrl+C/V/A before xterm.js's textarea
              // can handle them, breaking terminal copy/paste.
              { label: 'Cut', click: (item, focusedWindow) => focusedWindow?.webContents.cut() },
              { label: 'Copy', click: (item, focusedWindow) => focusedWindow?.webContents.copy() },
              { label: 'Paste', click: (item, focusedWindow) => focusedWindow?.webContents.paste() },
              { label: 'Select All', click: (item, focusedWindow) => focusedWindow?.webContents.selectAll() },
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

app_.get('/api/agents/installed', (_req, res) => {
  const ids = agentManager.getAllAgents().map(a => a.id)
  res.json(checkAgentsInstalled(ids))
})

app_.get('/api/chat/models', (_req, res) => {
  res.json(chatManager.getModels())
})

app_.post('/api/report-token-savings', (req, res) => {
  try {
    const { originalTokens, filteredTokens, toolName } = req.body
    if (typeof originalTokens !== 'number' || typeof filteredTokens !== 'number') {
      res.status(400).json({ error: 'originalTokens and filteredTokens are required' })
      return
    }
    const event = sessionManager.outputFilter.reportTokenSavings(originalTokens, filteredTokens, toolName || 'tool')
    if (event) io.emit('command-filter-event', event)
    res.json({ ok: true })
  } catch (e) {
    console.error('/api/report-token-savings error:', e)
    res.status(500).json({ error: String(e) })
  }
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

  socket.on('restart-session', ({ sessionId }) => {
    sessionManager.restartSession(sessionId)
  })

  socket.on('get-filter-stats', () => {
    try {
      const allSessions = sessionManager.outputFilter.getAllStats()
      const allCommandHistory = sessionManager.outputFilter.getAllCommandHistory()
      const aggregated = {
        totalOriginalBytes: allSessions.reduce((s: number, x: any) => s + x.stats.totalOriginalBytes, 0),
        totalFilteredBytes: allSessions.reduce((s: number, x: any) => s + x.stats.totalFilteredBytes, 0),
        totalOriginalTokens: allSessions.reduce((s: number, x: any) => s + x.stats.totalOriginalTokens, 0),
        totalFilteredTokens: allSessions.reduce((s: number, x: any) => s + x.stats.totalFilteredTokens, 0),
        eventsProcessed: allSessions.reduce((s: number, x: any) => s + x.stats.eventsProcessed, 0),
        commandsProcessed: allCommandHistory.length,
      }
      const allHistory = sessionManager.outputFilter.getAllHistory()
      socket.emit('filter-stats', { stats: aggregated, history: allHistory, commandHistory: allCommandHistory })
    } catch (e) {
      console.error('get-filter-stats error:', e)
    }
  })

  socket.on('report-token-savings', (data: { originalTokens: number; filteredTokens: number; toolName?: string }) => {
    try {
      const event = sessionManager.outputFilter.reportTokenSavings(data.originalTokens, data.filteredTokens, data.toolName)
      if (event) io.emit('command-filter-event', event)
    } catch (e) {
      console.error('report-token-savings error:', e)
    }
  })

  socket.on('reset-filter-stats', () => {
    sessionManager.outputFilter.reset()
    sessionManager.clearAllExecutions()
  })

  socket.on('get-command-filter-history', ({ sessionId }: { sessionId?: string }, callback?: Function) => {
    if (sessionId) {
      const history = sessionManager.outputFilter.getCommandHistory(sessionId)
      if (callback) callback({ ok: true, history })
    } else {
      const allHistory = sessionManager.outputFilter.getAllCommandHistory()
      if (callback) callback({ ok: true, history: allHistory })
    }
  })

  socket.on('switch-workspace', async ({ workspaceId }) => {
    try {
      const prevWs = workspaceManager.getActiveWorkspace()
      if (prevWs) {
        try { await workspaceManager.runTeardownScript(prevWs) } catch (e) {
          console.warn('Teardown script failed:', e)
        }
        await autoSaveSessions()
      }
      const newWs = await workspaceManager.switchWorkspace(workspaceId)
      await worktreeHelper.ensureWorktreesExist(newWs)
      try { await workspaceManager.runSetupScript(newWs) } catch (e) {
        console.warn('Setup script failed:', e)
      }
      if (newWs?.repository?.path) {
        injectClaudeCodeConfig(newWs.repository.path)
      }
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

  socket.on('create-workspace-from-git', async (data: { gitUrl: string, name?: string }, callback?: Function) => {
    try {
      const ws = await workspaceManager.cloneFromGitUrl(data.gitUrl, data.name)
      if (callback) callback({ ok: true, workspace: ws })
      io.emit('workspaces-list', workspaceManager.listWorkspaces())
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('update-workspace-config', async (data: { workspaceId: string, updates: any }, callback?: Function) => {
    try {
      const ws = await workspaceManager.updateWorkspace(data.workspaceId, data.updates)
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
    try {
      const t = String(type || '').trim().toLowerCase() || 'shell'
      const result = sessionManager.createRawSession(t, workspacePath)
      if (result) {
        const states = sessionManager.getSessionStates()
        socket.emit('session-created', { sessionId: result.sessionId, sessions: states })
        await autoSaveSessions()
      } else {
        socket.emit('error', { message: 'Failed to create session - check main process console for details' })
      }
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to create session', error: error.message })
    }
  })

  socket.on('create-agent-session', async ({ type, workspacePath, config }) => {
    try {
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
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to create agent session', error: error.message })
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
    try {
      const ids = Array.isArray(sessionIds) ? sessionIds : []
      for (const id of ids) {
        sessionManager.closeSession(id)
        io.emit('session-closed', { sessionId: id })
      }
      await autoSaveSessions()
    } catch (error: any) {
      socket.emit('error', { message: 'Failed to close tabs', error: error.message })
    }
  })

  socket.on('start-parallel-task', async (data: any, callback?: Function) => {
    try {
      const load = agentOrchestrator.getConcurrencyLoad()
      const availableSlots = load.max - load.active
      if (data.worktreeCount > availableSlots) {
        if (callback) callback({ ok: false, error: `Only ${availableSlots} of ${data.worktreeCount} requested slots available. Try fewer agents.` })
        return
      }
      const { sessionIds, groupId } = sessionManager.createParallelTask(data)
      const states = sessionManager.getSessionStates()
      const groupSessions = sessionIds.map(id => states[id]).filter(Boolean)
      if (callback) callback({ ok: true, sessionIds, groupId, sessions: groupSessions, load: agentOrchestrator.getConcurrencyLoad() })
      for (const id of sessionIds) {
        io.emit('session-created', { sessionId: id, sessions: states })
      }
      await autoSaveSessions()
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-orchestrator-stats', async (_data: any, callback?: Function) => {
    try {
      callback({
        ok: true,
        concurrency: agentOrchestrator.getConcurrencyLoad(),
        sessionCount: agentOrchestrator.getSessionCount(),
        totalMemoryMB: agentOrchestrator.getTotalMemoryMB(),
        resourceUsage: agentOrchestrator.getAllResourceUsage(),
      })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-session-usage', async ({ sessionId }: { sessionId: string }, callback?: Function) => {
    try {
      const usage = agentOrchestrator.getResourceUsage(sessionId)
      callback({ ok: true, usage })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-session-history', async (_data: any, callback?: Function) => {
    try {
      callback({ ok: true, history: sessionManager.getSessionHistory() })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-token-usage', async ({ sessionId }: { sessionId: string }, callback?: Function) => {
    try {
      const all = sessionManager.tokenUsageTracker.getAllUsage()
      if (sessionId) {
        callback({ ok: true, usage: sessionManager.tokenUsageTracker.getUsage(sessionId) })
      } else {
        callback({ ok: true, usage: all, totalTokens: all.reduce((s: number, u: any) => s + u.totalTokens, 0), totalCost: all.reduce((s: number, u: any) => s + u.estimatedCost, 0) })
      }
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-log', async ({ worktreePath, maxCount }: { worktreePath: string, maxCount?: number }, callback?: Function) => {
    try {
      const log = await gitHelper.getLog(worktreePath, maxCount)
      callback({ ok: true, log })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-diff', async ({ worktreePath, base, head }: { worktreePath: string, base?: string, head?: string }, callback?: Function) => {
    try {
      const diff = await gitHelper.getDiff(worktreePath, base, head)
      callback({ ok: true, diff })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-branches', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const branches = await gitHelper.getBranches(worktreePath)
      callback({ ok: true, branches })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-working-tree-diff', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const diff = await gitHelper.getWorkingTreeDiff(worktreePath)
      callback({ ok: true, diff })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-commit-files', async ({ worktreePath, commitHash }: { worktreePath: string, commitHash: string }, callback?: Function) => {
    try {
      const files = await gitHelper.getCommitFiles(worktreePath, commitHash)
      callback({ ok: true, files })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-working-tree-files', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const files = await gitHelper.getWorkingTreeFiles(worktreePath)
      callback({ ok: true, files })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-file-diff', async ({ worktreePath, filePath, base, head }: { worktreePath: string, filePath: string, base?: string, head?: string }, callback?: Function) => {
    try {
      const diff = await gitHelper.getFileDiff(worktreePath, filePath, base, head)
      callback({ ok: true, diff })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('get-git-full-status', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const status = await gitHelper.getFullStatus(worktreePath)
      callback({ ok: true, status })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-revert-file', async ({ worktreePath, filePath }: { worktreePath: string, filePath: string }, callback?: Function) => {
    try {
      const ok = await gitHelper.revertFile(worktreePath, filePath)
      callback({ ok })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-stage-file', async ({ worktreePath, filePath }: { worktreePath: string, filePath: string }, callback?: Function) => {
    try {
      const ok = await gitHelper.stageFile(worktreePath, filePath)
      callback({ ok })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-unstage-file', async ({ worktreePath, filePath }: { worktreePath: string, filePath: string }, callback?: Function) => {
    try {
      const ok = await gitHelper.unstageFile(worktreePath, filePath)
      callback({ ok })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-stage-all', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const ok = await gitHelper.stageAll(worktreePath)
      callback({ ok })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-unstage-all', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const ok = await gitHelper.unstageAll(worktreePath)
      callback({ ok })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-commit', async ({ worktreePath, message }: { worktreePath: string, message: string }, callback?: Function) => {
    try {
      const result = await gitHelper.commit(worktreePath, message)
      callback(result)
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-pull', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const result = await gitHelper.pull(worktreePath)
      callback(result)
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-push', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const result = await gitHelper.push(worktreePath)
      callback(result)
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-fetch', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const result = await gitHelper.fetch(worktreePath)
      callback(result)
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('git-discard-all', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
      const ok = await gitHelper.discardAll(worktreePath)
      callback({ ok })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('add-worktree', async ({ workspaceId }, callback?: Function) => {
    try {
      const ws = workspaceManager.getWorkspace(workspaceId)
      if (!ws) throw new Error('Workspace not found')
      const nextIndex = (ws.worktrees?.count || 0) + 1
      const worktreeId = (ws.worktrees?.namingPattern || 'work{n}').replace('{n}', String(nextIndex))
      const path = await worktreeHelper.createWorktree(ws, worktreeId)
      await workspaceManager.updateWorkspace(workspaceId, {
        worktrees: { ...ws.worktrees, enabled: true, count: nextIndex, autoCreate: true },
      })
      if (callback) callback({ ok: true, worktree: { id: worktreeId, path } })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('remove-worktree', async ({ workspaceId, worktreeId }, callback?: Function) => {
    try {
      const ws = workspaceManager.getWorkspace(workspaceId)
      if (!ws) throw new Error('Workspace not found')
      const sessionIds: string[] = []
      const states = sessionManager.getSessionStates()
      for (const [id, s] of Object.entries(states) as any) {
        if (s.worktreeId === worktreeId) sessionIds.push(id)
      }
      for (const id of sessionIds) {
        sessionManager.closeSession(id)
        io.emit('session-closed', { sessionId: id })
      }
      await worktreeHelper.removeWorktree(ws, worktreeId)
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('list-worktrees', async ({ workspaceId }, callback?: Function) => {
    try {
      const ws = workspaceManager.getWorkspace(workspaceId)
      if (!ws) {
        if (callback) callback([])
        return
      }
      const wtList = sessionManager.getWorktrees().map(wt => ({
        id: wt.id,
        path: wt.path,
      }))
      if (callback) callback(wtList)
    } catch {
      if (callback) callback([])
    }
  })

  socket.on('caveman-toggle', ({ sessionId, enabled, level }: { sessionId: string, enabled: boolean, level?: string }) => {
    sessionManager.toggleCaveman(sessionId, enabled, level)
    const state = sessionManager.getCavemanState(sessionId)
    socket.emit('caveman-state', { sessionId, state })
  })

  socket.on('caveman-state', ({ sessionId }: { sessionId: string }, callback?: Function) => {
    const state = sessionManager.getCavemanState(sessionId)
    if (callback) callback({ ok: true, state })
  })

  socket.on('caveman-all-states', (_data: any, callback?: Function) => {
    const states = sessionManager.getAllCavemanStates()
    const aggregate = sessionManager.getCavemanAggregateStats()
    if (callback) callback({ ok: true, states, aggregate })
  })

  socket.on('set-user-settings', (settings: { autoRestartSessions?: boolean }) => {
    if (typeof settings.autoRestartSessions === 'boolean') {
      sessionManager.autoRestartSessions = settings.autoRestartSessions
    }
  })

  // ── Filesystem Operations ──────────────────────────────
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

  socket.on('get-workspace-tree', async ({ worktreePath }: { worktreePath: string }, callback?: Function) => {
    try {
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
      await fs.writeFile(absolutePath, content, 'utf-8')
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('create-file', async ({ absolutePath }: { absolutePath: string }, callback?: Function) => {
    try {
      await fs.writeFile(absolutePath, '', 'utf-8')
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('create-folder', async ({ absolutePath }: { absolutePath: string }, callback?: Function) => {
    try {
      await fs.mkdir(absolutePath, { recursive: true })
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('rename-file', async ({ oldPath, newPath }: { oldPath: string, newPath: string }, callback?: Function) => {
    try {
      await fs.rename(oldPath, newPath)
      if (callback) callback({ ok: true })
    } catch (error: any) {
      if (callback) callback({ ok: false, error: error.message })
    }
  })

  socket.on('delete-file', async ({ absolutePath }: { absolutePath: string }, callback?: Function) => {
    try {
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

  socket.on('save-workspace', async () => {
    const ws = sessionManager.getWorkspace()
    if (!ws?.id) return
    const sessions = sessionManager.getSessionSaveData()
    await workspaceManager.saveSessionState(ws.id, sessions)
    await sessionManager.saveAllSessionBuffers()
  })

  // Chat events
  socket.on('chat-get-models', ({ _reqId } = {}) => {
    socket.emit('chat-models', { _reqId, models: chatManager.getModels() })
  })

  socket.on('chat-send', async ({ _reqId, threadId, providerId, content }) => {
    try {
      const provider = chatManager.getProvider(providerId)
      if (!provider.isConfigured()) {
        socket.emit('chat-error', { _reqId, threadId, error: `${provider.name} API key is not configured.` })
        return
      }
    } catch (err: any) {
      socket.emit('chat-error', { _reqId, threadId, error: err.message })
      return
    }

    const msg = await chatManager.sendMessage(threadId, providerId, content)
    if (msg.error) {
      socket.emit('chat-error', { _reqId, threadId, error: msg.content })
    } else {
      socket.emit('chat-response', { _reqId, threadId, message: msg })
    }
  })

  socket.on('chat-send-stream', async ({ threadId, providerId, content }) => {
    try {
      const provider = chatManager.getProvider(providerId)
      if (!provider.isConfigured()) {
        socket.emit('chat-error', { threadId, error: `${provider.name} API key is not configured.` })
        return
      }
    } catch (err: any) {
      socket.emit('chat-error', { threadId, error: err.message })
      return
    }

    await chatManager.sendMessageStream(threadId, providerId, content, (chunk) => {
      if (chunk.error) {
        socket.emit('chat-error', { threadId, error: chunk.error })
      } else {
        socket.emit('chat-stream-chunk', chunk)
      }
    })
  })

  socket.on('chat-stop-stream', ({ threadId }) => {
    chatManager.stopStreaming(threadId)
  })

  socket.on('chat-get-history', ({ _reqId, threadId }) => {
    const messages = chatManager.getThreadMessages(threadId)
    socket.emit('chat-history', { _reqId, threadId, messages })
  })

  socket.on('chat-update-api-key', ({ providerId, apiKey }) => {
    chatManager.updateApiKey(providerId, apiKey)
  })

  socket.on('chat-delete-thread', ({ threadId }) => {
    chatManager.deleteThread(threadId)
  })
})

// Start server
async function startServer() {
  try {
    await workspaceManager.initialize()
    const activeWs = workspaceManager.getActiveWorkspace()
    if (activeWs) {
      sessionManager.setWorkspace(activeWs)
      await worktreeHelper.ensureWorktreesExist(activeWs)
      // Check for saved sessions first. If they exist (with correct agent types),
      // restore them directly and skip creating default sessions from workspace.terminals.
      // This prevents wrong-type or duplicate sessions on app restart.
      const savedSessions = await workspaceManager.loadSessionState(activeWs.id)
      if (savedSessions.length > 0) {
        await sessionManager.restoreSessions(savedSessions)
      } else {
        await sessionManager.initializeSessions()
      }
      if (activeWs.repository?.path) {
        injectClaudeCodeConfig(activeWs.repository.path)
      }
    }
  } catch (e) {
    console.error('Failed to initialize workspace system:', e)
  }

  rebuildMenu()
  const MAX_PORT_RETRIES = 5

  function listenWithRetry(attempt: number) {
    const server = httpServer.listen(SERVER_PORT, '127.0.0.1')
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_RETRIES) {
        console.log(`[server] Port ${SERVER_PORT} in use, retrying in 500ms (attempt ${attempt + 1}/${MAX_PORT_RETRIES})`)
        server.close()
        setTimeout(() => listenWithRetry(attempt + 1), 500)
      } else {
        console.error(`[server] Failed to bind to port ${SERVER_PORT}:`, err.message)
      }
    })
    server.on('listening', () => {
      console.log(`Server running on http://127.0.0.1:${SERVER_PORT}`)
    })
  }

  listenWithRetry(0)
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
    ...(isMac ? { titleBarStyle: 'hidden' as const } : { frame: false }),
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.maximize()

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!)
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}

// IPC handlers
ipcMain.handle('window-minimize', () => mainWindow?.minimize())
ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window-close', () => mainWindow?.close())
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized())

ipcMain.handle('popup-menu', (event, menuName: string, x: number, y: number) => {
  const menu = Menu.getApplicationMenu()
  const item = menu?.items.find(i => i.label === menuName)
  if (item?.submenu) {
    const win = BrowserWindow.fromWebContents(event.sender)
    const items = item.submenu.items.map(i => {
      const opts: Electron.MenuItemConstructorOptions = {
        label: i.label,
        type: i.type,
        accelerator: i.accelerator,
        enabled: i.enabled,
        visible: i.visible,
        checked: i.checked,
        role: i.role,
        submenu: i.submenu,
      }
      if (i.click) {
        opts.click = (mi, bw, ev) => i.click!(mi, bw, ev)
      }
      return opts
    })
    const popupMenu = Menu.buildFromTemplate(items)
    popupMenu.popup({ window: win || undefined, x: Math.round(x), y: Math.round(y) })
  }
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    ...(mainWindow ? { parent: mainWindow } : {}),
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-default-path', () => os.homedir())

ipcMain.handle('get-server-port', () => SERVER_PORT)

ipcMain.handle('get-drop-path', () => null)

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

ipcMain.handle('open-in-explorer', async (_event, filePath: string) => {
  if (!filePath) return false
  try {
    await shell.openPath(filePath)
    return true
  } catch {
    return false
  }
})

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
      console.log('[orchestration] Coordinator started')
    } else if (result.status === 'already_running') {
      console.log('[orchestration] Coordinator already running for', result.workspaceRoot)
    } else if (result.status === 'error') {
      console.error('[orchestration] Coordinator error:', result.error)
    }
  }

  createWindow()
  await startServer()
})

app.on('will-quit', () => {
  if (orchestrationCoordinator) {
    orchestrationCoordinator.close()
    orchestrationCoordinator = null
  }
  agentOrchestrator.shutdownAll()
  const ws = sessionManager.getWorkspace()
  if (ws?.id) {
    const sessions = sessionManager.getSessionSaveData()
    workspaceManager.saveSessionStateSync(ws.id, sessions)
    sessionManager.saveAllSessionBuffersSync()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
