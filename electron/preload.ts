import { contextBridge, ipcRenderer, webUtils } from 'electron'

console.log('[preload] loaded')

let dropPath: string | null = null
let dropResolve: ((path: string | null) => void) | null = null

const MAX_RECURSE_DEPTH = 6

function readDirEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise(res => {
    dir.createReader().readEntries(entries => res(entries), () => res([]))
  })
}

function readFile(fileEntry: FileSystemFileEntry): Promise<File | null> {
  return new Promise(res => {
    fileEntry.file(f => res(f), () => res(null))
  })
}

// Walks a dropped directory tree (breadth-first per level, depth-bounded)
// looking for the first real file, so we can derive the directory's
// absolute path from webUtils.getPathForFile(file) + its relative path.
async function findFirstFile(
  dir: FileSystemDirectoryEntry,
  depth: number,
): Promise<{ file: File; relativePath: string } | null> {
  if (depth > MAX_RECURSE_DEPTH) return null

  const entries = await readDirEntries(dir)
  const subdirs: FileSystemDirectoryEntry[] = []

  for (const sub of entries) {
    if (sub.isFile) {
      const file = await readFile(sub as FileSystemFileEntry)
      if (file) {
        const relativePath = file.webkitRelativePath || sub.fullPath?.replace(/^\//, '') || file.name
        return { file, relativePath }
      }
    } else if (sub.isDirectory) {
      subdirs.push(sub as FileSystemDirectoryEntry)
    }
  }

  for (const subdir of subdirs) {
    const found = await findFirstFile(subdir, depth + 1)
    if (found) return found
  }

  return null
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => {
    console.log('[preload] selectDirectory called')
    return ipcRenderer.invoke('select-directory')
  },

  getDropPath: () => {
    if (dropPath !== null) {
      const p = dropPath
      dropPath = null
      console.log('[preload] getDropPath returning cached:', p)
      return Promise.resolve(p)
    }
    console.log('[preload] getDropPath waiting for async resolution')
    return new Promise<string | null>(resolve => {
      dropResolve = resolve
    })
  },
})

// Capture drop and resolve full path via webUtils
document.addEventListener(
  'drop',
  e => {
    console.log('[preload] drop capture phase')
    const dt = e.dataTransfer
    if (!dt?.items.length) return

    for (const item of Array.from(dt.items)) {
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry?.()
      if (!entry) continue

      if (entry.isDirectory) {
        // Don't write a placeholder to dropPath here. getDropPath() checks
        // dropPath synchronously and returns+clears it immediately if set —
        // React's onDrop handler calls getDropPath() right after this native
        // listener runs (same drop dispatch), so any placeholder we set here
        // gets consumed before the async resolution below ever finishes,
        // and the real resolved path gets silently discarded. Only ever
        // assign dropPath once we have a real answer (or are sure there
        // isn't one).
        const fallbackName = entry.name

        ;(async () => {
          let resolved: string | null = fallbackName
          try {
            const found = await findFirstFile(entry as FileSystemDirectoryEntry, 0)
            if (found) {
              const { file, relativePath } = found
              const fullPath = webUtils.getPathForFile(file)
              console.log('[preload] webUtils resolved:', fullPath, 'relative:', relativePath)
              if (fullPath && relativePath) {
                resolved = fullPath.slice(0, fullPath.length - relativePath.length - 1)
              } else if (fullPath) {
                resolved = fullPath.lastIndexOf('/') !== -1
                  ? fullPath.slice(0, fullPath.lastIndexOf('/'))
                  : fullPath
              }
            } else {
              console.warn('[preload] no files found inside dropped directory; falling back to name only:', fallbackName)
            }
          } catch (err) {
            console.error('[preload] webUtils error:', err)
          }
          console.log('[preload] resolved drop path:', resolved)
          if (dropResolve) {
            // Renderer was already waiting on getDropPath() — hand it the answer.
            dropResolve(resolved)
            dropResolve = null
          } else {
            // Renderer hasn't asked yet — cache it for the next getDropPath() call.
            dropPath = resolved
          }
        })()

        break
      }

      const file = item.getAsFile()
      if (file) {
        dropPath = file.name
        try {
          const fullPath = webUtils.getPathForFile(file)
          console.log('[preload] single file webUtils:', fullPath)
          if (fullPath) {
            dropPath = fullPath.lastIndexOf('/') !== -1
              ? fullPath.slice(0, fullPath.lastIndexOf('/'))
              : fullPath
          }
        } catch (err) {
          console.error('[preload] single file error:', err)
        }
        console.log('[preload] resolved single file:', dropPath)
        if (dropResolve) {
          dropResolve(dropPath)
          dropResolve = null
        }
        break
      }
    }
  },
  true,
)