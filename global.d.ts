export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  getDropPath: () => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
