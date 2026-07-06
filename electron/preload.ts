import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
  exportWorkspace: () => ipcRenderer.invoke('export-workspace'),
  importWorkspace: () => ipcRenderer.invoke('import-workspace'),
  duplicateWorkspace: (newName: string) => ipcRenderer.invoke('duplicate-workspace', newName),
  onMenuAction: (callback: (action: string, data?: any) => void) => {
    const handler = (_event: any, action: string, data: any) => callback(action, data)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  },
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  popupMenu: (menuName: string, x: number, y: number) => ipcRenderer.invoke('popup-menu', menuName, x, y),
})
