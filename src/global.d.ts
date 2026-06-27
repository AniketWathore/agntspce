interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  getDropPath: () => Promise<string | null>
}

interface Window {
  electronAPI: ElectronAPI
}
