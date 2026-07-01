import { useState, useRef, useCallback, type ReactNode, type CSSProperties } from 'react'

interface Props {
  children: [ReactNode, ReactNode]
  direction: 'horizontal' | 'vertical'
  defaultSize?: number
  style?: CSSProperties
}

export default function SplitPane({ children, direction, defaultSize = 50, style }: Props) {
  const [split, setSplit] = useState(defaultSize)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startPos = direction === 'horizontal' ? e.clientX : e.clientY
    const startSplit = split

    function onMove(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const total = direction === 'horizontal' ? rect.width : rect.height
      const pos = direction === 'horizontal' ? ev.clientX : ev.clientY
      const delta = pos - startPos
      let newSplit = startSplit + (delta / total) * 100
      newSplit = Math.max(15, Math.min(85, newSplit))
      setSplit(newSplit)
    }

    function onUp() {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [direction, split])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: direction === 'horizontal' ? 'row' : 'column',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ flex: `0 0 ${split}%`, overflow: 'hidden', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children[0]}
      </div>
      <div
        className="split-resizer"
        data-dir={direction}
        onMouseDown={onMouseDown}
      />
      <div style={{ flex: `0 0 ${100 - split}%`, overflow: 'hidden', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children[1]}
      </div>
    </div>
  )
}
