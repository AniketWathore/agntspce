export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  getDefaultPath: () => Promise<string>
  getDropPath: () => Promise<string | null>
  getServerPort: () => Promise<number>
  exportWorkspace: () => Promise<string | null>
  importWorkspace: () => Promise<{ workspace: any; path: string } | null>
  duplicateWorkspace: (newName: string) => Promise<any>
  onMenuAction: (callback: (action: string, data?: any) => void) => () => void
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  popupMenu: (menuName: string, x: number, y: number) => Promise<void>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}


