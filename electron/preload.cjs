const { contextBridge, ipcRenderer, clipboard } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  readClipboard: () => clipboard.readText(),
  writeClipboard: (text) => clipboard.writeText(text),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  exportWorkspace: () => ipcRenderer.invoke('export-workspace'),
  importWorkspace: () => ipcRenderer.invoke('import-workspace'),
  duplicateWorkspace: (newName) => ipcRenderer.invoke('duplicate-workspace', newName),
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
  onMenuAction: (callback) => {
    const handler = (_event, action, data) => callback(action, data)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  },
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  popupMenu: (menuName, x, y) => ipcRenderer.invoke('popup-menu', menuName, x, y),
})
