# AgntSpce Documentation

## Overview

AgntSpce is an Electron + React + TypeScript desktop application for running and monitoring AI coding agents inside PTY-backed terminals. It provides workspace management, agent launching, live terminal output streaming, git-aware status tracking, token compression metrics, and more.

**Tech Stack:** Electron 42, React 19, TypeScript 6, Vite 8, Socket.IO, Express, node-pty, xterm.js, Monaco Editor

---

## Architecture

The app is split into two main processes:

### Electron Main Process (`electron/`)

Runs on `127.0.0.1:9460`. Contains the backend logic:

- **`electron/main.ts`** - Entry point. Creates BrowserWindow, Express + Socket.IO server. Wires IPC handlers, menu bar, and API routes. Initializes all services.
- **`electron/preload.ts`** / **`electron/preload.cjs`** - Context bridge exposing `window.electronAPI` for IPC calls (directory picker, window controls, workspace import/export).
- **`electron/services/sessionManager.ts`** - Owns PTY lifecycle. Creates/restarts/closes sessions, manages workspace switching, parallel tasks, buffer persistence, session history. Integrates with OutputFilter, CavemanService, TokenUsageTracker.
- **`electron/services/workspaceManager.ts`** - Persists workspace data to `~/.agent-workspace/`. Handles CRUD, clone from git, export/import, setup/teardown scripts, trash/restore, session state persistence.
- **`electron/services/agentManager.ts`** - Defines agent configurations (Claude, Opencode, Codex, Gemini, Cursor Agent, Copilot, Mastra Code, Droid, Amp, Pi). Builds CLI commands from modes + flags. Validates configs.
- **`electron/services/agentOrchestrator.ts`** - Manages concurrency (semaphore with max 6 slots), resource tracking (CPU/memory via `ps`), health checks (15s interval), session restart limits.
- **`electron/services/statusDetector.ts`** - Infers terminal status (idle/busy/waiting/exited) from output patterns. Agent-specific heuristics for Claude, Codex, Gemini, Opencode.
- **`electron/services/gitHelper.ts`** - Git operations: branch, status, log, diff, file history. Caching with 30s TTL. Path validation against base path.
- **`electron/services/worktreeHelper.ts`** - Git worktree creation/removal. Resolves primary dir (master/main), creates worktree branches.
- **`electron/services/outputFilter.ts`** - Per-session output filtering pipeline. Supports ANSI stripping, dedup, skip/keep patterns, line limits, progress bar stripping, match-output replacement. Integrates with RTK (Real-Time Knowledge) filter engine.
- **`electron/services/outputCompressor.ts`** - Legacy output compression + token usage tracking with cost estimation.
- **`electron/services/cavemanService.ts`** - "Caveman Mode" — injects SKILL.md / CLAUDE.md files that instruct agents to be terse. Three levels: lite, full, ultra. Persists run data to disk.
- **`electron/services/ringBuffer.ts`** - Fixed-capacity string buffer (64KB default). Used for session output buffering.
- **`electron/services/prioritySemaphore.ts`** - Priority-based semaphore for concurrency limiting.
- **`electron/services/resourceTracker.ts`** - Polls `ps` for per-pid CPU/memory usage. Threshold alerts (1GB memory, 90% CPU).
- **`electron/services/rtk/`** - Real-Time Knowledge filter engine: code filters, TOML-based filter definitions, streaming support, tracking/statistics.

### React Renderer Process (`src/`)

Vite-bundled React UI:

- **`src/App.tsx`** - Root component. Wires layout (activity bar, left panel, main area, chat sidebar), global state, modals, keyboard shortcuts, notification system, file editor.
- **`src/hooks/useSocket.ts`** - Socket.IO client hook. Manages sessions, workspaces, event subscriptions (terminal output, status changes, branch changes, filter events, caveman events).
- **`src/types/index.ts`** - Shared TypeScript interfaces for all data types.

#### Component Tree

```
App
├── TitleBar
├── ActivityBar (built into App)
│   ├── Explorer toggle
│   ├── Terminal toggle
│   ├── Dashboard
│   ├── Session History
│   ├── Caveman Mode Stats
│   ├── Output Filter Debug
│   ├── Git Review
│   ├── Profile
│   └── Settings
├── Left Panel (WorkspaceSidebar)
│   └── WorkspaceSidebar
│       └── FileTree
├── Main Content (TerminalArea or Editor)
│   ├── TerminalArea
│   │   └── TerminalPane (xterm.js instances)
│   ├── EditorTabs + CodeEditor (Monaco)
│   └── Page views:
│       ├── Dashboard
│       ├── PRPanel (Git Review)
│       ├── CavemanPanel
│       ├── OutputFilterDebug
│       ├── Profile
│       └── Settings
├── Chat Sidebar (ChatSidebar)
├── Modals:
│   ├── CreateWorkspaceModal
│   ├── InputModal
│   ├── AgentModal
│   ├── CommanderPanel
│   ├── NotificationPanel
│   └── HistoryPanel
└── StatusBar
```

---

## Features

### Workspace Management

- **Create workspace** - Local directory or git clone (`CreateWorkspaceModal`)
- **Switch workspaces** - Instant with session preservation
- **CRUD operations** - Create, select, edit, delete, restore from trash, permanent delete
- **Git clone** - Clone repos to `~/AgntSpce/<name>`
- **Export/Import** - `.workspace` file format, includes session state
- **Duplicate** - Clone workspace config
- **Setup/Teardown scripts** - Run on workspace switch (30s timeout)
- **Worktrees** - Git worktree creation; parallel agent sessions per worktree
- **Recent workspaces** - Tracked in config, shown in File menu
- **Session state persistence** - Auto-save on quit, restore on startup

### Agent Terminals

Supported agents:

| Agent | ID | Modes | Flags | Models | Worktree |
|-------|----|-------|-------|--------|----------|
| Claude Code | `claude` | fresh, continue, resume | skipPermissions, verbose, debug | - | Yes |
| Opencode | `opencode` | fresh, continue | - | - | Yes |
| Codex | `codex` | fresh, continue, resume | yolo, workspaceWrite, readOnly, neverAsk, askOnRequest | gpt-4, gpt-5, gpt-5-codex | Yes |
| Gemini | `gemini` | fresh | - | gemini-2.5-pro, gemini-2.0-flash | No |
| Cursor Agent | `cursor-agent` | fresh, continue | yolo, verbose | claude-sonnet-4, gpt-4o, gemini-2.5-pro | Yes |
| Copilot | `copilot` | fresh, explain, suggest | - | - | No |
| Mastra Code | `mastracode` | fresh, continue, agent | verbose | - | Yes |
| Droid | `droid` | fresh, review, plan | autoApprove | - | Yes |
| Amp | `amp` | fresh, continue, agent | - | - | Yes |
| Pi | `pi` | fresh, chat, review | - | - | Yes |

- **Startup UI** - `StartupUI.tsx` overlay for configuring session mode, flags, model, reasoning, verbosity
- **Parallel tasks** - Launch N agents simultaneously across worktrees
- **Auto-restart** - Claude sessions auto-restart on exit (configurable)
- **Launch flow** - AgentPicker → AgentModal → StartupUI → PTY spawn

### Shell Terminals

- Regular shell sessions (separate from agent sessions)
- Toggle bottom shell panel via activity bar or menu
- Visually distinct from agent terminals

### Real-Time Terminal Streaming

- Socket.IO-based real-time output
- Backpressure detection (terminates WebSocket if buffered > 8MB)
- Undelivered output backlog on reconnect
- Output filtering pipeline before emission

### Status Detection

- **idle** - Shell prompt detected, no recent output, completion markers
- **busy** - Tool calls, typing indicators, recent output within window
- **waiting** - Permission prompts, `? for shortcuts`, provider-specific prompts
- **exited** - PTY process exited

Agent-specific heuristics for Claude (30s window), Codex (10s), Gemini (6s), Opencode (5s).

### Git Integration

- **Branch tracking** - 30s poll, cached with TTL
- **Status** - Porcelain format, modified/added/deleted/untracked counts
- **Log** - Last N commits with hash, message, author, relative date
- **Diff** - HEAD diff, working tree diff, per-commit file diff
- **Branches** - Sorted by committerdate
- **Commit files** - File list with status, additions, deletions
- **File diff** - Per-file diff, including new file (EMPTY base)
- **Worktree support** - `git worktree add/remove` with branch creation

### Output Filter (RTK Engine)

- Per-session filtering pipeline
- ANSI escape sequence stripping
- Line trimming, empty line collapse/dedup
- Skip (regex), Keep (regex), Replace rules
- Head/tail/maxLines truncation
- Progress bar detection and removal
- Match-output rules (replace full output on pattern match)
- Token estimation (char/4)
- Reduction percentage tracking
- Command history tracking
- Custom filter definitions via RTK registry

### Caveman Mode

Three levels of terse-response enforcement:

| Level | Token Reduction | Style |
|-------|-----------------|-------|
| `lite` | ~30% | Professional, no filler, full grammar |
| `full` | ~65% | Fragments, no articles, smart caveman |
| `ultra` | ~75% | Telegraphic, abbreviations, no grammar |

Writes `SKILL.md` (Opencode) or `CLAUDE.md` (Claude) into workspace. Tracks runs, prompts, and response tokens.

### Token Usage Tracking

- Per-session input/output token counts
- Estimated cost (input: $0.003/1K, output: $0.015/1K)
- Aggregate totals across all sessions

### Code Editor

- Monaco Editor integration (`@monaco-editor/react`)
- Multi-tab editing with dirty state tracking
- Language detection by extension
- Scroll position preservation
- File operations (create, read, write, rename, delete)
- Save support via keyboard shortcut or button

### File Explorer

- Directory tree with icons for files/folders
- Dotfile skipping
- Collapse/expand folders
- Context actions: create file, create folder, rename, delete

### Dashboard

- Workspace count, session count
- Token compression stats (original vs filtered bytes/tokens)
- Deleted workspaces list with restore/permanent-delete

### Notifications

- Session complete detection (busy → idle transition)
- Session close detection
- Debounced (2s window to avoid spam)
- Notification panel with dismiss/dismiss-all

### Session History

- Tracks session id, type, worktree, branch, status, lastActivity, closedAt, agentId
- Restore historical sessions (limited by type)
- Max 200 entries

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘N` | New Window |
| `⌘⇧N` | New Workspace |
| `⌘⇧A` | New Agent |
| `⌘⇧S` | New Shell |
| `⌘O` | Load Workspace |
| `⌘S` | Save Workspace/File |
| `⌘W` | Close Window |
| `⌘⇧F` | Toggle Focus Mode |
| `⌘K` | Toggle Commander |
| `⌘B` | Toggle Chat Sidebar |
| `⌘⇧B` | Toggle Workspace Sidebar |
| `⌘Tab` / `⌘⇧Tab` | Cycle Agent Tabs |
| `⌘1`-`⌘9` | Go to Tab N |

### Menu Bar

- **File** - New Window, Workspace, Agent, Shell; Duplicate/Load/Save workspace; Recent workspaces
- **Edit** - Undo, Redo, Cut, Copy, Paste, Select All, Find
- **View** - Zoom, Toggle Shell/Workspace Sidebar, Focus Active Terminal, Layout presets (Auto, 1×1, 2×2, 1+2, 3×3)
- **Window** - Minimize, Zoom, Fill, Center, Tile Left/Right, Fullscreen
- **Help** - Keyboard Shortcuts, About

### Window Controls (macOS)

- `titleBarStyle: hiddenInset` for native title bar
- Custom window controls for non-macOS (frameless window)

---

## Configuration

### `config.json` (project root)

```json
{
  "server": { "port": 9460, "host": "127.0.0.1" },
  "sessions": {
    "timeoutMs": 1800000,
    "maxBufferSize": 100000,
    "maxProcessesPerSession": 50
  },
  "logging": { "level": "info" }
}
```

### `~/.agent-workspace/config.json` (user config)

Auto-generated on first run:
```json
{
  "version": "2.0.0",
  "activeWorkspace": null,
  "recentWorkspaces": [],
  "ui": { "theme": "dark", "rememberLastWorkspace": true }
}
```

### Data Directories

| Path | Purpose |
|------|---------|
| `~/.agent-workspace/workspaces/` | Workspace JSON files |
| `~/.agent-workspace/deleted-workspaces/` | Trash (soft-deleted workspaces) |
| `~/.agent-workspace/exports/` | Export temp files |
| `~/.agent-workspace/session-buffers/` | Session output buffers (`<workspaceId>-<sessionId>.log`) |
| `~/.agent-workspace/caveman-data.json` | Caveman mode persistent data |

---

## Events (Socket.IO)

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `terminal-input` | `{ sessionId, data/input }` | Write to PTY |
| `terminal-resize` | `{ sessionId, cols, rows }` | Resize PTY |
| `restart-session` | `{ sessionId }` | Kill and recreate PTY |
| `switch-workspace` | `{ workspaceId }` | Switch active workspace |
| `create-workspace` | `Workspace` | Create workspace |
| `create-workspace-from-git` | `{ gitUrl, name? }` | Clone and create workspace |
| `delete-workspace` | `{ workspaceId }` | Soft-delete |
| `restore-workspace` | `{ workspaceId }` | Restore from trash |
| `permanent-delete-workspace` | `{ workspaceId }` | Permanently delete |
| `list-deleted-workspaces` | `{}` | List trash |
| `create-raw-session` | `{ type, workspacePath }` | Create shell/raw session |
| `create-agent-session` | `{ type, workspacePath, config }` | Create agent session |
| `start-agent` | `{ sessionId, config }` | Launch agent in existing session |
| `close-tab` | `{ sessionIds }` | Close sessions |
| `start-parallel-task` | `{ agentId, mode, flags, prompt, worktreeCount }` | Parallel agents |
| `get-filter-stats` | `{}` | Get output filter stats |
| `reset-filter-stats` | `{}` | Reset filter stats |
| `caveman-toggle` | `{ sessionId, enabled, level? }` | Toggle caveman mode |
| `caveman-state` | `{ sessionId }` | Get caveman state |
| `caveman-all-states` | `{}` | Get all caveman states |
| `set-user-settings` | `{ autoRestartSessions? }` | Update user prefs |
| `get-workspace-tree` | `{ worktreePath }` | Read directory tree |
| `read-file` | `{ absolutePath }` | Read file contents |
| `write-file` | `{ absolutePath, content }` | Write file |
| `create-file` | `{ absolutePath }` | Create empty file |
| `create-folder` | `{ absolutePath }` | Create directory |
| `rename-file` | `{ oldPath, newPath }` | Rename/move |
| `delete-file` | `{ absolutePath }` | Delete file/directory |
| `save-workspace` | `{}` | Save session state + buffers |
| `add-worktree` | `{ workspaceId }` | Add git worktree |
| `remove-worktree` | `{ workspaceId, worktreeId }` | Remove git worktree |
| `list-worktrees` | `{ workspaceId }` | List worktrees |
| Git events | Various | See `electron/main.ts` lines 532-593 |
| `get-orchestrator-stats` | `{}` | Get concurrency/resource stats |
| `get-session-usage` | `{ sessionId }` | Per-session resource usage |
| `get-token-usage` | `{ sessionId? }` | Token usage data |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `workspace-info` | `{ active, available, config }` | Initial workspace data |
| `sessions` | `Record<string, SessionState>` | All sessions |
| `workspace-changed` | `{ workspace, sessions }` | After workspace switch |
| `workspaces-list` | `WorkspaceInfo[]` | Updated workspace list |
| `session-created` | `{ sessionId, sessions }` | New session created |
| `session-exited` | `{ sessionId, exitCode, signal }` | PTY exited |
| `session-closed` | `{ sessionId }` | Session removed |
| `terminal-output` | `{ sessionId, data }` | PTY output chunk |
| `status-change` | `{ sessionId, status }` | Status transition |
| `branch-change` | `{ sessionId, branch, worktreeId }` | Branch updated |
| `backlog` | `Record<sessionId, string>` | Undelivered output |
| `agent-started` | `{ sessionId, config }` | Agent launched |
| `error` | `{ message, error? }` | Error event |
| `filter-stats` | `{ stats, history }` | Filter statistics |
| `filter-event` | `FilterEvent` | Individual filter event |
| `caveman-state` | `{ sessionId, state }` | Caveman state update |
| `caveman-run-complete` | `{ sessionId, run }` | Caveman run finished |
| `session-unhealthy` | `{ sessionId, reason, usage? }` | Health check alert |

---

## Error Handling

### Backend

- All Socket.IO event handlers wrapped in try-catch with `socket.emit('error', ...)` on failure
- `node-pty` import failure caught gracefully (PTY sessions unavailable)
- Workspace file operations handle missing directories
- Git operations return `null` / descriptive reason strings on failure
- CORS origin validation with clear error
- Backpressure: WebSocket terminated if `bufferedAmount > 8MB`

### Frontend

- `fetchAgentConfigs` falls back to hardcoded `FALLBACK_AGENTS` on network error
- File read/write errors logged to console
- Session creation failures emit error event
- Modal states managed with null checks
- Notifications debounced (2s) to avoid spam

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + Vite build |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Serve production build |
| `npm run electron:build` | Package Electron app |
| `npm run electron:preview` | Run Electron against built output |

---

## Build & Packaging

- **Vite config** (`vite.config.ts`): React plugin + Electron plugin + Renderer plugin
- **Post-build step**: Copies node-pty prebuilds to `dist-electron/prebuilds/` and preload.js
- **electron-builder**: Config in `package.json`; outputs DMG (mac), NSIS (win), AppImage (linux)
- **Rollup external**: `node-pty` excluded from bundling (native module)

---

## Persistent Data Locations

| Data | Type | Location |
|------|------|----------|
| Workspace definitions | JSON | `~/.agent-workspace/workspaces/<id>.json` |
| Session state | JSON | `~/.agent-workspace/workspaces/<id>.sessions.json` |
| Session buffers | Log | `~/.agent-workspace/session-buffers/<wsId>-<sessionId>.log` |
| Deleted workspaces | JSON | `~/.agent-workspace/deleted-workspaces/` |
| User config | JSON | `~/.agent-workspace/config.json` |
| Caveman data | JSON | `~/.agent-workspace/caveman-data.json` |
| Exported workspaces | JSON | `~/.agent-workspace/exports/` |

---

## Agent Configuration

Agent definitions are in `electron/services/agentManager.ts:76-517`. Each agent has:

- `baseCommand` - CLI executable
- `modes` - Fresh/continue/resume etc.
- `flags` - CLI flags with categories, defaults, mutual exclusivity
- `capabilities` - supportsWorktree, requiresGitRepo, supportsParallel
- `models` / `reasoningLevels` / `verbosityLevels` - Optional model config

Flags with `mutuallyExclusive: true` are automatically resolved by keeping only the last flag in the category.

---

## Dependencies

### Production
- `@monaco-editor/react` - Code editor
- `@vscode/codicons` - Icon set
- `@xterm/xterm` + `@xterm/addon-fit` - Terminal emulator
- `cors` - CORS middleware
- `express` - HTTP server
- `dotenv` - Environment variables
- `monaco-editor` - Code editor engine
- `multer` - File upload middleware
- `node-pty` - PTY spawn
- `react` + `react-dom` - UI framework
- `socket.io` + `socket.io-client` - Real-time communication
- `uuid` - Unique IDs
- `winston` - Logging

### Dev
- `@types/node`, `@types/react`, `@types/react-dom`
- `@vitejs/plugin-react`
- `electron` + `electron-builder`
- `oxlint`
- `typescript`
- `vite` + `vite-plugin-electron` + `vite-plugin-electron-renderer`
