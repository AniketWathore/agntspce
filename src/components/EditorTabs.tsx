import type { OpenFile } from '../types'

interface EditorTabsProps {
  openFiles: OpenFile[]
  activeFileId: string | null
  onSelectFile: (id: string) => void
  onCloseFile: (id: string) => void
}

export function EditorTabs({
  openFiles,
  activeFileId,
  onSelectFile,
  onCloseFile,
}: EditorTabsProps) {
  if (openFiles.length === 0) return null

  return (
    <div className="editor-tabs">
      <div className="editor-tabs-scroll">
        {openFiles.map((file) => (
          <div
            key={file.id}
            className={`editor-tab ${activeFileId === file.id ? 'active' : ''}`}
            onClick={() => onSelectFile(file.id)}
          >
            {file.isDirty && <span className="editor-tab-dirty">●</span>}
            <span className="editor-tab-name">{file.fileName}</span>
            <button
              className="editor-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onCloseFile(file.id)
              }}
              title="Close"
            >
              <i className="codicon codicon-close" style={{ fontSize: 12 }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
