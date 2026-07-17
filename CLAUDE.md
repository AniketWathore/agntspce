# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgntSpce is an Electron + React + TypeScript desktop app for running and monitoring AI coding agents (Claude Code, Opencode, Codex, Gemini) inside PTY-backed terminals. A local Express + Socket.IO server runs in Electron's main process; the renderer connects via Socket.IO to stream terminal output into xterm.js panes.

## Commands

```bash
npm run dev             # Vite dev server (renderer only, no Electron)
npm run build           # tsc -b && vite build (production bundle)
npm run lint            # Oxlint (React + TypeScript rules)
npm run preview         # Serve production Vite build locally
npm run electron:dev    # Vite dev + Electron window (main dev workflow)
npm run electron:build  # Full Electron app package (npm run build + electron-builder)
npm run electron:preview # Build + run Electron against built output
```

There are no tests yet. Always run `npx tsc -b` after changes to catch TypeScript errors — the build pipeline depends on it.

## Architecture

### Backend (`electron/`)

```
electron/main.ts              — Express + Socket.IO server, all socket handlers, Electron window
electron/services/
  sessionManager.ts           — PTY lifecycle: create/restart/close sessions, workspace switching
  agentManager.ts             — Agent configs, command builder, flag validation for all agents
  workspaceManager.ts         — CRUD for workspaces (JSON files in app data dir)
  statusDetector.ts           — Infers terminal status (idle/busy/waiting/exited) from output
  gitHelper.ts                — Branch tracking via git commands
  worktreeHelper.ts           — Git worktree operations (legacy, rarely used)
  agentOrchestrator.ts        — Concurrency limiting (max 6), health checks, restart throttling
  chatManager.ts              — Multi-provider AI chat (OpenAI, Anthropic, Gemini, DeepSeek)
  outputCompressor.ts         — Token usage tracking and compression stats
  outputFilter.ts             — Command output filtering pipeline
  cavemanService.ts           — "Caveman" panel service
  rtkBridge.ts                — Bridge between RTK system and session manager
  rtk/                        — Real-Time Kernel: output filtering, command detection, tracking
    index.ts                  — RTK entry: registry, tracker, command detection, filter application
    tee.ts, stream.ts         — Output stream splitting and streaming
    runner.ts, guard.ts       — Command execution and safety guards
    tracking.ts               — Command/execution event tracking and stats
    tomlFilter.ts             — TOML-based filter definition and compilation
    codeFilter.ts             — Code-block-aware output filtering
    filters.ts                — Built-in filter definitions
    formatter.ts              — Output formatting utilities
    constants.ts, utils.ts    — Shared constants and utilities
  providers/
    anthropic.ts, openai.ts   — AI SDK provider wrappers for chat (using @ai-sdk/* packages)
    gemini.ts, deepseek.ts
  types.ts                    — Backend TypeScript types (Session, Workspace, etc.)
  ringBuffer.ts               — Circular buffer for terminal output
  prioritySemaphore.ts        — Priority-based concurrency semaphore
  resourceTracker.ts          — CPU/memory resource monitoring per session
```

### Frontend (`src/`)

```
src/App.tsx                    — Root: 3-pane resizable layout, socket wiring, panel state
src/App.css                    — All app styles (~780 lines)
src/hooks/useSocket.ts         — Socket.IO connection + event listeners + cleanup
src/types/index.ts             — Frontend TypeScript types + Window.electronAPI declarations
src/utils/stripAnsi.ts         — ANSI escape sequence stripping
src/utils/fileIcons.ts         — File icon mapping by extension
src/components/
  Header.tsx                   — Top bar: +Agent, +Workspace, Shell toggle
  TerminalArea.tsx             — Center panel: agent terminal grid
  TerminalPane.tsx             — xterm.js terminal with StartupUI overlay for agent sessions
  TerminalPane.css             — Terminal pane styles
  ShellSidebar.tsx             — Right sidebar: shell terminals (collapsible)
  WorkspaceSidebar.tsx         — Left sidebar: workspace CRUD, file explorer
  WorkspaceSidebar.css         — Workspace sidebar styles
  StartupUI.tsx                — Agent config overlay (Fresh/Continue/Resume/Advanced)
  AgentPicker.tsx              — 4-agent selection overlay
  AgentModal.tsx               — Full agent config: mode, flags, model, reasoning, verbosity
  CreateWorkspaceModal.tsx     — Workspace creation: name + directory picker
  InputModal.tsx               — Simple text input modal
  Dashboard.tsx                — Stats: workspace/session counts, token compression
  RtkDashboard.tsx             — RTK stats dashboard
  CommanderPanel.tsx           — Command palette (Cmd+K)
  CavemanPanel.tsx             — Caveman mode panel
  ChatSidebar.tsx              — AI chat sidebar
  GitReviewPanel.tsx           — Git review panel
  GitChangesPanel.tsx          — Git changes/staging panel
  GitDiffViewer.tsx            — Syntax-highlighted git diff viewer
  DiffViewer.tsx               — Generic diff viewer
  FileExplorer.tsx             — File tree browser
  FileTree.tsx                 — File tree component
  CodeEditor.tsx               — Monaco-based code editor
  EditorTabs.tsx               — Editor tab management
  HistoryPanel.tsx             — Session history
  PRPanel.tsx                  — PR listing for workspace repos
  Profile.tsx                  — User profile panel
  Settings.tsx                 — User settings panel
  NotificationPanel.tsx        — Notification slide-out
  ActivityFeed.tsx             — Activity event feed
  StatusBar.tsx                — Bottom status bar
  StatusDot.tsx                — Status indicator dot
  TitleBar.tsx                 — Custom title bar (Windows/Linux)
  MenuBar.tsx                  — Application menu bar
  SplitPane.tsx                — Resizable split pane layout
```

### Data Flow

```
Socket.IO client (renderer) ←→ Socket.IO Server + Express (port 9460, main process)
                                     │
                           SessionManager (node-pty sessions)
                           WorkspaceManager (JSON workspace persistence)
                           AgentManager (agent configs + command building)
                           AgentOrchestrator (concurrency + health)
```

Socket events: `terminal-input`, `terminal-output`, `create-raw-session`, `start-agent`, `close-tab`, `switch-workspace`, `create-workspace`, `delete-workspace`, `session-created`, `session-status`, `branch-change`, `error`.

## RTK (Real-Time Kernel) System

The RTK subsystem detects commands typed in terminals, captures their output, applies per-command output filters, and reports token reduction stats. Key flow:

1. PTY output is tee'd into a stream
2. `detectCommand()` identifies when a command is entered (terminals send `\r` for Enter, not `\n`)
3. The appropriate filter is selected from the `FilterRegistry` (TOML-defined filters + built-ins from `filters.ts`)
4. Filtered output, original output, token counts, and reduction percentage are emitted as `CommandEvent`
5. `Tracker` aggregates stats across commands and execution events

## Agent Management

Agent configs live in TWO places that must stay in sync:
- **Backend**: `electron/services/agentManager.ts` — full config (commands, modes, flags, models, reasoning levels)
- **Frontend**: `src/App.tsx` has `FALLBACK_AGENTS` — used when `/api/agents` REST fetch fails

Agent types: `claude`, `codex`, `opencode`, `gemini`, plus legacy/reference types (`cursor-agent`, `copilot`, `mastracode`, `droid`, `amp`, `pi`).

The `bin/` directory contains wrapper scripts (e.g., `bin/claude`, `bin/codex`) that intercept agent CLI invocations — these are the actual commands PTY sessions execute.

## Important Gotchas

1. **node-pty native module**: Must be externally bundled. `vite.config.ts` marks it as external; the `closeBundle` hook copies prebuilds (`.node` + `spawn-helper`) from `node_modules/node-pty/prebuilds/` to `dist-electron/prebuilds/` with correct permissions. If PTY creation fails, check `spawn-helper` has `chmod 755` in both locations.

2. **Callback duplication in React StrictMode**: `useSocket.ts` event listeners return unsubscribe functions. Every consumer MUST `return unsub` in their `useEffect` cleanup to prevent double-firing (causes input doubling bugs).

3. **Preload script**: `electron/preload.cjs` is CommonJS (`require('electron')`) despite `package.json` having `"type": "module"`. This works because Electron provides `require` in preload context. The `closeBundle` hook copies it to `dist-electron/preload.js`.

4. **CORS**: Socket.IO has origin-checking CORS (localhost/127.0.0.1). Express `/api/*` routes have inline `Access-Control-Allow-Origin: *`. Both must stay in sync.

5. **Terminal Enter key**: Commands are detected via `\r` (carriage return), not `\n`. Using `\n` for command detection will miss real terminal input.

6. **SessionState.type union**: Must include all agent types (`'claude' | 'codex' | 'opencode' | 'gemini' | 'cursor-agent' | 'copilot' | 'mastracode' | 'droid' | 'amp' | 'pi' | 'server' | 'shell'`). Frontend and backend types must match.

7. **Resizer drag**: The `app-body` div in `App.tsx` must pass `ref={appBodyRef}` for drag calculations to work.

## Configuration

- `config.json` — Server port (9460), session timeout (30 min), max buffer size (100KB), max processes per session (50), log level
- `.oxlintrc.json` — Oxlint config with react/rules-of-hooks (error) and react/only-export-components (warn)
- `tsconfig.json` — Project references to `tsconfig.app.json` and `tsconfig.node.json`
- `package.json` `build` section — electron-builder config for macOS (dmg), Windows (nsis), Linux (AppImage)

## Workspace Data

Workspaces are persisted as JSON files in the app's user data directory. The `WorkspaceManager` handles CRUD, trash/restore, and session state saving. Workspace export/import is available via the Electron IPC menu actions.