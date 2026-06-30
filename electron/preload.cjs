const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  onMenuAction: (callback) => {
    const handler = (_event, action, data) => callback(action, data)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  },
})
