# Agent Workspace — Handoff Document

## Project Overview

Electron + React + TypeScript desktop app for managing AI coding agent terminals (Claude Code, Opencode, Codex, Gemini) alongside plain shell terminals. Backend (Express + Socket.IO) runs inside Electron's main process; PTY sessions are created via `node-pty`.

**Location:** `/Users/prashik/Aniket/CodingAgents/codingagentsworkspace`  
**Entry:** `npm run electron:dev` (Vite dev server + Electron)  
**Build:** `npm run build` (or `npm run electron:dev` for dev)  

## Architecture

### Backend (`electron/main.ts` + `electron/services/`)
```
Socket.IO client ←→ Socket.IO Server + Express (port 9460)
                              │
                    SessionManager (node-pty sessions)
                    WorkspaceManager (JSON-based workspaces)
                    AgentManager (agent configs + command builder)
                    WorktreeHelper (git worktree ops — legacy, rarely hit)
```

- Express serves `/api/agents`, `/api/workspaces`, `/api/sessions`, `/api/status`
- Socket.IO handles real-time events: `terminal-input/output`, `create-raw-session`, `start-agent`, `close-tab`, `switch-workspace`, `create-workspace`, `delete-workspace`

### Frontend (`src/`)
```
App.tsx — root: resizable 3-pane layout
  ├─ Header.tsx — + Agent, + Workspace, Shell toggle
  ├─ WorkspaceSidebar.tsx — left panel
  ├─ TerminalArea.tsx — center panel (agent terminals only)
  │   └─ TerminalPane.tsx — xterm.js instances with StartupUI overlay
  ├─ ShellSidebar.tsx — right panel (shell terminals only)
  ├─ AgentPicker.tsx — overlay showing 4 agents
  ├─ AgentModal.tsx — full agent config modal (modes, flags)
  └─ InputModal.tsx — simple text input modal
```

### State Flow
```
useSocket.ts (custom hook)
  ├─ socket.on('terminal-output') → writeBuffers[] → TerminalPane writes to xterm
  ├─ socket.on('session-created') → sessions[] → TerminalArea + ShellSidebar render
  ├─ socket.on('error') → console.error
  ├─ socket.emit('terminal-input') ← term.onData in TerminalPane/ShellTerminal
  └─ socket.emit('create-raw-session') ← +Agent / +Shell clicks
```

## Key Files

| File | Purpose |
|---|---|
| `electron/main.ts` | Express + Socket.IO server, all socket handlers, Electron window |
| `electron/services/sessionManager.ts` | PTY lifecycle: create/restart/close sessions, workspace switching |
| `electron/services/agentManager.ts` | Agent configs (Claude, Opencode, Codex, Gemini), command builder, flag validation |
| `electron/services/workspaceManager.ts` | CRUD for workspaces (JSON files in `~/Library/.../config/workspaces/`) |
| `electron/preload.cjs` | Preload script exposing `window.electronAPI.selectDirectory()` |
| `vite.config.ts` | Vite + vite-plugin-electron + closeBundle hook for node-pty prebuilds |
| `src/App.tsx` | Root component: 3-pane resizable layout, state wiring |
| `src/hooks/useSocket.ts` | Socket.IO connection + all event listeners + cleanup |
| `src/components/Header.tsx` | Top bar with +Agent, + Workspace, Shell toggle (count badge) |
| `src/components/AgentPicker.tsx` | Modal overlay listing the 4 agent options |
| `src/components/TerminalPane.tsx` | xterm.js terminal with StartupUI overlay for agent sessions |
| `src/components/ShellSidebar.tsx` | Right sidebar with xterm.js terminals for shell sessions |
| `src/components/AgentModal.tsx` | Full agent config: mode selection, flags, model/reasoning/verbosity |
| `src/types/index.ts` | Frontend TypeScript types |
| `electron/services/types.ts` | Backend TypeScript types |

## What Works

- **+ Agent** → Opens agent picker overlay → choose Claude Code / Opencode / Codex / Gemini → new raw session of that type appears in the center grid
- **+ Shell** → Click the `>_` button in header (right side) → shell sidebar toggles open/closed → shows shell count badge
- **Agent startup UI** → After creating an agent session, an inline overlay appears (Fresh / Continue / Resume / Advanced) — choose mode and flags, then the agent CLI starts in that terminal
- **Workspace creation** → Name + directory picker → workspace saved as JSON → appears in left sidebar
- **Resizable panes** → Drag the 4px divider bars between panes to resize (left: 180px–80%, right: 200px–80%)
- **Terminals start in workspace path** → New terminals CWD = active workspace's repository.path
- **node-pty** → spawn-helper has executable permissions; closeBundle hook preserves them

## Known Issues / Caution Points

1. **node-pty native module**: Must be externally bundled. `vite.config.ts:54` marks it as external; `closeBundle` hook copies prebuilds to `dist-electron/prebuilds/` with `chmod 755`. If PTY creation fails, check `spawn-helper` permissions both at `node_modules/node-pty/prebuilds/darwin-arm64/` and `dist-electron/prebuilds/darwin-arm64/`.

2. **Callback duplication in StrictMode**: `onTerminalOutput`/`onStatusChange`/etc in `useSocket.ts` now return unsubscribe functions. All consumers must `return unsub` in their `useEffect` cleanup to prevent double-firing in React 19 dev mode (was causing `llss` input doubling bug).

3. **Preload script**: `electron/preload.cjs` is copied to `dist-electron/preload.js` by the closeBundle hook. It uses CommonJS (`require('electron')`). The `package.json` has `"type": "module"` — preload scripts loaded by `BrowserWindow` still work because Electron provides `require` in preload context regardless of `"type"`.

4. **CORS**: Socket.IO has an origin-checking CORS config (allow localhost/127.0.0.1). Express routes (`/api/*`) have inline `Access-Control-Allow-Origin: *` middleware. Both must stay in sync.

5. **Agent configs live in two places**: Backend (`agentManager.ts`) has the full config (commands, modes, flags). Frontend (`App.tsx`) has `FALLBACK_AGENTS` — used when `/api/agents` fetch fails. Both must be updated when adding/removing agents.

## What To Do Next (Priority Order)

### 1. Port dashboard and project board
The original `agent-workspace-main` had a dashboard with project overview, recent activity, terminal stats. Need to add:
- `ProjectBoard.tsx` — cards showing each agent session with status, branch, last activity
- `Dashboard.tsx` — summary stats (total sessions, busy count, workspace usage)
- Activity feed widget

### 2. Port focus overlay / view presets
Original had a `FocusOverlay` component toggled by `Cmd+Shift+F` — dims inactive terminals, highlights the active one. Also view presets (1x1, 2x2, 1+2 grid layouts).

### 3. Port commander panel
`CommanderPanel.tsx` — quick-action command palette (`Cmd+K`) for:
- Creating workspaces/terminals
- Switching agents
- Running git commands
- Toggling settings

### 4. Port history / session recovery
Original had session history with replay of terminal output, ability to "resume" a closed session. Need:
- `HistoryPanel.tsx` — log of past sessions
- Session recovery on startup (re-open last workspace's terminals)
- Undelivered output replay (the `backlog` mechanism in `sessionManager.ts` line 110-111 exists but isn't consumed on frontend)

### 5. Port settings panel
`SettingsPanel.tsx` — user preferences:
- Theme/skin switcher
- Font size, font family
- Auto-start mode for agent terminals
- Session recovery toggle
- Token usage limits

### 6. Port notifications / activity feed
Original had a notification bell in header with:
- Session status changes (started, exited, error)
- Agent approval requests
- Git branch changes
- `NotificationPanel.tsx` — slide-out panel with sorted list

### 7. Port PRs / diff view
Original had inline PR review and diff display:
- `DiffViewer.tsx` — syntax-highlighted unified diff
- `PRPanel.tsx` — list open PRs for workspace repos
- (Requires git integration, which was partially stripped. Need to add back `GitHelper` integration.)

### 8. Improve agent modal
Current `AgentModal.tsx` allows mode/flag selection but is basic. Original had:
- Model selector (dropdown from agentManager config.model[])
- Reasoning effort slider
- Verbosity slider
- Resume ID input (for `claude --resume <id>`)
- Quick presets ("YOLO", "Safe", "Custom")

### 9. Add token usage tracking
Original tracked token usage per session and had a live token counter in terminal headers. Need:
- Token estimation middleware in `sessionManager.ts`
- Cumulative token display per session + per workspace
- Token budget warnings

### 10. Add terminal output compression
Original planned a compression layer for terminal output to reduce token consumption when sending context to LLMs. This is a larger architectural change:

- `OutputCompressor.ts` — strip ANSI sequences, deduplicate repeated lines, truncate long buffers
- `PromptOptimizer.ts` — optimize system prompts and context before sending to agents
- `AutoModelRouter.ts` — route between cheap/fast and expensive/smart models based on task complexity

## Build & Test

```bash
npm run electron:dev    # Dev mode with HMR + Electron window
npm run build           # Production build
npm run tsc -b          # TypeScript check only
```

After making changes, ALWAYS run:
```bash
npm run tsc -b   # Check TS errors
npm run build    # Or just let electron:dev rebuild via Vite
```

The `dist-electron/main.js` bundle includes all backend code. The `dist/` folder has the React frontend. `dist-electron/prebuilds/` contains `pty.node` + `spawn-helper` with correct permissions.

## Common Gotchas

- **"Failed to create session"** → check main process terminal for the actual error (node-pty spawn failure, PATH issue, spawn-helper permissions)
- **Buttons do nothing** → check browser DevTools console for socket `error` events, and main process terminal for node-pty stack traces
- **Layout broken after TS changes** → check that `SessionState.type` union includes all 4 agent types (`'claude' | 'codex' | 'opencode' | 'gemini' | 'server' | 'shell'`)
- **Resizer drag doesn't work** → the `app-body` div needs `ref={appBodyRef}` to be passed for the drag calculations to work

## User Preferences

- macOS, arm64
- No git/repository complexity wanted — workspaces are simple directories
- Shell terminals live in right sidebar (collapsible, not in main grid)
- Agent terminals in center grid (resizable)
- 4 agents: Claude Code, Opencode, Codex, Gemini
- Terminal CWD should default to workspace path (not `$HOME`)

## File Size Reference

| File | Lines |
|---|---|
| `electron/services/sessionManager.ts` | ~460 |
| `electron/services/agentManager.ts` | ~302 |
| `electron/main.ts` | ~226 |
| `electron/services/workspaceManager.ts` | ~153 |
| `src/App.tsx` | ~260 |
| `src/hooks/useSocket.ts` | ~209 |
| `src/components/Header.tsx` | ~58 |
| `src/components/ShellSidebar.tsx` | ~148 |
| `src/components/TerminalPane.tsx` | ~143 |
| `src/App.css` | ~780 |
