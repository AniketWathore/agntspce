export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  getDefaultPath: () => Promise<string>
  getServerPort: () => Promise<number>
  exportWorkspace: () => Promise<string | null>
  importWorkspace: () => Promise<{ workspace: any; path: string } | null>
  duplicateWorkspace: (newName: string) => Promise<any>
  onMenuAction: (callback: (action: string, data?: any) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}


