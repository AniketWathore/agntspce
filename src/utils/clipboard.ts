export async function copyToClipboard(text: string): Promise<void> {
  if (window.electronAPI?.writeClipboard) {
    window.electronAPI.writeClipboard(text)
    return
  }
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

export async function readFromClipboard(): Promise<string> {
  if (window.electronAPI?.readClipboard) {
    return window.electronAPI.readClipboard()
  }
  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}
