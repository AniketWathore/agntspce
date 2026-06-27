import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import path from 'node:path'

const isDev = process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const win = new BrowserWindow({
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
    win.loadURL(process.env.VITE_DEV_SERVER_URL!)
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

function send(action: string) {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', action)
}

function setupMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'settings' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        {
          label: 'New Workspace',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('new-workspace'),
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('open-folder'),
        },
        { type: 'separator' },
        {
          label: 'Save Workspace',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('save-workspace'),
        },
        {
          label: 'Load Workspace...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => send('load-workspace'),
        },
        ...(process.platform !== 'darwin'
          ? [{ type: 'separator' as const }, { role: 'quit' as const }]
          : []),
      ],
    },

    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },

    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    {
      label: 'Window',
      submenu: [
        ...(process.platform === 'darwin'
          ? [{ role: 'windowMenu' as const }]
          : [
              { role: 'minimize' as const },
              { role: 'close' as const },
            ]),
      ],
    },

    {
      label: 'Help',
      submenu: [
        {
          label: 'About Agent Workspace',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Agent Workspace',
              message: 'Agent Workspace v0.1.0',
              detail: 'An AI-powered development workspace.',
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  setupMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
