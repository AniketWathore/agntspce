function isFileProtocol(): boolean {
  try {
    return window.location.protocol === 'file:'
  } catch {
    return false
  }
}

export function assetUrl(path: string): string {
  if (!path) return path
  if (isFileProtocol()) {
    return path.replace(/^\//, './')
  }
  return path
}
