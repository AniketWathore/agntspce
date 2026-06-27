interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  getDropPath: () => Promise<string | null>
  onMenuAction: (callback: (action: string) => void) => void
}

interface Window {
  electronAPI: ElectronAPI
}
