# AgntSpce

AgntSpce is an Electron + React + TypeScript desktop workspace for running and monitoring AI coding agents inside PTY-backed terminals. It combines workspace management, agent launches, live terminal output, git-aware status tracking, and token-compression metrics in one app.

## What’s New In This Build

This codebase now includes:

- A local Electron main process with Express and Socket.IO serving the renderer.
- PTY-backed terminal sessions for agent and shell workflows.
- Workspace CRUD, including create, select, delete, trash restore, and permanent delete flows.
- Agent launch flows for Claude, Opencode, Codex, and Gemini.
- A startup UI for configuring fresh, continue, resume, and advanced agent sessions.
- A dashboard with workspace/session counts and token compression stats.
- Real-time terminal output, status changes, branch updates, and workspace events.
- Git branch tracking, worktree helpers, and token reduction/compression services.
- Sidebar panels for workspace, shell, dashboard, profile, settings, and chat.

## Overview

The app is split into two main parts:

- `electron/` contains the backend, PTY session management, workspace persistence, and Socket.IO event handling.
- `src/` contains the React UI, including the terminal area, sidebars, modals, and dashboard panels.

At runtime, Electron starts a local server on `127.0.0.1:9460`, the renderer connects through Socket.IO, and terminal output is streamed back into xterm.js panes in real time.

## Core Features

### Workspace management

- Create and switch between workspaces.
- Persist workspace metadata locally.
- Restore deleted workspaces from the trash.
- Start terminals in the active workspace directory.

### Agent terminals

- Launch agent sessions for Claude, Opencode, Codex, and Gemini.
- Choose session mode and startup flags in the agent modal.
- Use the startup overlay to continue, resume, or start fresh.
- View agent terminals in the main workspace area.

### Shell terminals

- Open regular shell sessions separately from agent sessions.
- Toggle the shell sidebar from the header.
- Keep shell terminals visually distinct from agent terminals.

### Real-time terminal state

- Stream terminal output over Socket.IO.
- Detect busy, idle, waiting, and exited states.
- Track branch changes and workspace updates.
- Compress token-heavy output and show savings in the UI.

### Dashboard and panels

- View workspace/session totals.
- Inspect token compression stats.
- Use the profile and settings panels.
- Access the chat panel from the main layout.

## Architecture

### Backend

- `electron/main.ts` starts the Electron window, Express server, and Socket.IO server.
- `electron/services/sessionManager.ts` owns PTY lifecycle and session switching.
- `electron/services/workspaceManager.ts` persists workspace data.
- `electron/services/agentManager.ts` builds agent commands and validates agent options.
- `electron/services/statusDetector.ts` infers terminal status from output.
- `electron/services/gitHelper.ts` tracks branch information.
- `electron/services/worktreeHelper.ts` manages worktree operations.
- `electron/services/tokenReduction.ts` reduces terminal output and publishes savings.

### Frontend

- `src/App.tsx` wires the overall layout and panel state.
- `src/hooks/useSocket.ts` connects to the server and listens for live events.
- `src/components/TerminalArea.tsx` renders the agent terminal grid.
- `src/components/TerminalPane.tsx` hosts individual xterm.js terminals.
- `src/components/ShellSidebar.tsx` renders shell sessions.
- `src/components/WorkspaceSidebar.tsx` handles workspace actions.
- `src/components/AgentPicker.tsx`, `src/components/AgentModal.tsx`, and `src/components/StartupUI.tsx` control agent creation.
- `src/components/Dashboard.tsx`, `src/components/Profile.tsx`, and `src/components/Settings.tsx` render the supporting panels.

## Getting Started

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview the built app

```bash
npm run preview
```

### Package Electron builds

```bash
npm run electron:build
```

### Electron preview

```bash
npm run electron:preview
```

## Scripts

- `npm run dev` starts the Vite renderer.
- `npm run build` runs TypeScript build checks and creates the Vite production bundle.
- `npm run lint` runs Oxlint.
- `npm run preview` serves the production Vite build locally.
- `npm run electron:build` creates a packaged Electron app.
- `npm run electron:preview` runs Electron against the built output.

Note: `electron:dev` currently maps to `vite`, so it does not launch Electron by itself.

## Technology Stack

- Electron
- React 19
- TypeScript
- Vite
- Socket.IO
- Express
- node-pty
- xterm.js

## Notes

- The app expects the local backend and renderer to stay in sync through Socket.IO events.
- PTY sessions depend on the prebuilt native `node-pty` binaries.
- Workspace and session state are stored locally under the app’s data directory.

## Repository Layout

```text
electron/        Electron main process and services
src/             React renderer and UI components
dist-electron/   Electron build output
public/          Static assets
scripts/         Build and helper scripts
```
