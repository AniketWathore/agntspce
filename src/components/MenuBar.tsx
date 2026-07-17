import { useState, useEffect, useRef } from 'react'


interface Props {
  onNewAgent: () => void
  onNewShell: () => void
  onNewWorkspace: () => void
  onCloseTerminal: () => void
  onToggleShellSidebar: () => void
  onToggleWorkspaceSidebar: () => void
  hasActiveSession: boolean
}

interface MenuItem {
  label?: string
  action?: () => void
  shortcut?: string
  separator?: boolean
  checked?: boolean
  submenu?: MenuItem[]
  enabled?: boolean
}

interface MenuGroup {
  label: string
  items: MenuItem[]
}

export default function MenuBar({
  onNewAgent, onNewShell, onNewWorkspace, onCloseTerminal,
  onToggleShellSidebar, onToggleWorkspaceSidebar,
  hasActiveSession,
}: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openMenu])

  function close() {
    setOpenMenu(null)
  }

  function handleAction(action?: () => void) {
    return () => {
      action?.()
      close()
    }
  }

  const menus: MenuGroup[] = [
    {
      label: 'File',
      items: [
        { label: 'New Agent Terminal', action: onNewAgent, shortcut: '⌘N' },
        { label: 'New Shell Terminal', action: onNewShell, shortcut: '⌘⇧N' },
        { separator: true },
        { label: 'New Workspace', action: onNewWorkspace },
        { separator: true },
        { label: 'Close Terminal', action: onCloseTerminal, shortcut: '⌘W', enabled: hasActiveSession },
        { separator: true },
        { label: 'Quit', action: () => window.close(), shortcut: '⌘Q' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle Shell Sidebar', action: onToggleShellSidebar, shortcut: '⌘B' },
        { label: 'Toggle Workspace Sidebar', action: onToggleWorkspaceSidebar },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', action: () => alert(
          '⌘N — New Agent\n⌘⇧N — New Shell\n⌘W — Close Terminal\n⌘Tab / ⌘⇧Tab — Cycle Tabs\n⌘1-9 — Go to Tab\n⌘B — Toggle Shell Sidebar\nEsc — Close Menu'
        )},
        { separator: true },
        { label: 'About Agent Workspace', action: () => alert('Agent Workspace v1.0 — Electron + React + TypeScript') },
      ],
    },
  ]

  return (
    <div className="menubar" ref={barRef}>
      {menus.map(group => (
        <div
          key={group.label}
          className={`menubar-item ${openMenu === group.label ? 'open' : ''}`}
          onMouseDown={() => setOpenMenu(openMenu === group.label ? null : group.label)}
          onMouseEnter={() => { if (openMenu) setOpenMenu(group.label) }}
        >
          <span className="menubar-label">{group.label}</span>
          {openMenu === group.label && (
            <div className="menubar-dropdown">
              {group.items.map((item, i) => {
                if (item.separator) return <div key={i} className="menu-separator" />
                if (item.submenu) {
                  return (
                    <div key={item.label} className="menu-item has-submenu">
                      <span>{item.label}</span>
                      <span className="menu-submenu-arrow">▶</span>
                      <div className="menu-submenu">
                        {item.submenu.map((sub, j) => (
                          <div
                            key={j}
                            className={`menu-item ${sub.checked ? 'checked' : ''}`}
                            onClick={handleAction(sub.action)}
                          >
                            <span className="menu-item-label">{sub.label}</span>
                            {sub.checked && <span className="menu-check">✓</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }
                return (
                  <div
                    key={item.label}
                    className={`menu-item ${item.enabled === false ? 'disabled' : ''}`}
                    onClick={item.enabled !== false ? handleAction(item.action) : undefined}
                  >
                    <span className="menu-item-label">{item.label}</span>
                    {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
