# AgntSpce v1 Roadmap

This roadmap tracks the refactor + feature + performance work for the v1 release.
Work happens on the `agntspce-v1` branch. Tick off items as they land.

Legend: `[ ]` = pending, `[x]` = done, `[~]` = in progress

---

## Tier 1 — Stability (fix issues before they bite)

> Goal: keep the existing Electron + Express + Socket.IO architecture, but make the
> codebase testable, maintainable, and free of known bug classes.

- [x] **1. Split `electron/main.ts` (1,437 lines) into modules**
  - [x] `electron/config.ts` — centralized constants (port, CORS, timeouts, buffer sizes, version)
  - [x] `electron/window.ts` — BrowserWindow creation, menu building, IPC handlers
  - [x] `electron/server/context.ts` — service container wiring (all managers)
  - [x] `electron/server/api.ts` — Express REST routes
  - [x] `electron/server/handlers/*.ts` — per-domain socket handlers (sessions, workspaces, git, chat, search, rtk, files, orchestration)
  - [x] `electron/main.ts` — thin bootstrap only
- [x] **2. Add vitest for backend services**
  - [x] vitest config + `npm run test` script
  - [x] `statusDetector` tests (24 passing)
  - [x] `outputFilter` tests (20 passing)
  - [x] `agentManager` tests (30 passing)
  - [x] `sessionManager` tests (18 passing) — orchestration logic (worktrees, session maps, close, write/resize)
- [x] **3. Fix StrictMode double-fire pattern**
  - [x] Shared `useSocketEvent` hook that guarantees `return unsub`
  - [x] Audit every existing socket listener consumer in `src/`
- [ ] **4. Centralize config**
  - [ ] Single `config.ts` for port, CORS, session timeout, max buffer size
  - [ ] Server + builder read from same source

## Tier 2 — Performance

> Goal: faster startup, lower memory/CPU, smoother terminal streaming.

- [x] **5. WebGL terminal renderer**
  - [x] Add `@xterm/addon-webgl` to `TerminalPane.tsx` / `TerminalArea.tsx`
  - [x] Graceful fallback to DOM renderer on GPU failure
- [x] **6. Lazy-load heavy panels**
  - [x] `React.lazy` + `Suspense` for Monaco, Dashboard, ChatSidebar, GitReviewPanel
- [x] **7. Batch/throttle `terminal-output` socket events**
  - [x] ~30ms aggregation on renderer side (coalesce per-session writes)

## Tier 3 — Features

> Goal: parity with Orca/Superset on the high-value, low-risk items.

- [x] **8. Workspace presets** (setup/teardown scripts per workspace, Superset-style)
  - [x] Preset fields (setup/teardown scripts) in `CreateWorkspaceModal` (collapsible "Presets" section)
  - [x] Wired through local + git-clone creation paths (`addWorkspace`, `create-workspace-from-git`, `cloneFromGitUrl`)
  - [x] Setup script runs on boot (active workspace) and on `switch-workspace`; teardown runs on switch-away
- [x] **9. Wire up declared-but-unconfigured agents** (`cursor-agent`, `copilot`, `mastracode`, `droid`, `amp`, `pi`, `kilocode`, `windsurf`)
  - [x] `agentTypes` set in `App.tsx` includes all agents
  - [x] `AGENT_COMMANDS` in `agentResolver.ts` maps every agent to its CLI binary
  - [x] `StartupUI` renders only modes the selected agent actually supports
  - [x] `agentImages` aliases for `cursor-agent` / `mastracode` (image lookup uses session.type)
- [x] **10. Keyboard shortcut system** (global, customizable)
  - [x] Single registry: `src/utils/shortcuts.ts` (`parseCombo`/`eventMatches`) + `combo` field on every `commanderCommands` entry
  - [x] Unified `keydown` handler dispatches from the registry (replaces hardcoded ⌘K/⌘⇧F/etc.)
  - [x] Commander palette renders derived display string from the same combo source
- [ ] **11. Diff annotation → ship comments back to agent**

---

## Progress Log

| Date | Change |
|:-----|:-------|
| 2026-08-06 | Branch `agntspce-v1` created; roadmap added |
| 2026-08-06 | **Done:** `main.ts` split — extracted `config.ts`, `window.ts`, `server/` (bootstrap, api, context, per-domain handlers); `main.ts` now 95 lines. `tsc -b` + `vite build` + lint pass. |
| 2026-08-06 | **Done:** vitest added — `vitest.config.ts`, `"test": "vitest run"` script; 74 passing tests across `statusDetector` (24), `outputFilter` (20), `agentManager` (30). `vitest.config.ts` added to `tsconfig.node.json`. Orchestration integration tests excluded from vitest (run via `node --test`). `tsc -b` + `vite build` + `oxlint` all pass. |
| 2026-08-06 | **Done:** StrictMode double-fire fix — new `useSocketEvent` hook guarantees `return unsub` structurally; migrated `App.tsx` (terminal-output buffer) and `ChatSidebar` (chat stream/response/error) to it. Audited `TerminalPane`/`TerminalArea` — already clean up correctly. `tsc -b` + `vite build` pass. |
| 2026-08-06 | **Done:** `sessionManager` tests (18) for orchestration logic — worktree building, workspace session maps, session states, undelivered-output backlog, closeSession history cap, writeTo/resize. Also fixed latent crash: `closeSession` called `statusDetector.reset()` without null guard (line 699). 92 tests total. `tsc -b` + `oxlint` + `vitest` all pass. |
| 2026-08-06 | **Done:** Tier 2 — WebGL renderer (`@xterm/addon-webgl`) with DOM fallback in `TerminalPane`/`TerminalArea`; `React.lazy`+`Suspense` for CodeEditor/ChatSidebar/Dashboard/GitReviewPanel (split into separate chunks); renderer-side ~30ms `terminal-output` batching coalescing per-session writes in `useSocket`. `tsc -b` + `vite build` + `vitest` (92) pass. |
| 2026-08-06 | **Done:** Tier 3 items 8-10 — workspace presets (setup/teardown script fields in `CreateWorkspaceModal`, wired through local + git creation, setup runs on boot/switch, teardown on switch-away); agent wiring (`agentTypes` + `AGENT_COMMANDS` in `agentResolver.ts` for all 12 agents incl. `kilocode`/`windsurf`, `StartupUI` renders only supported modes, `agentImages` aliases for `cursor-agent`/`mastracode`); keyboard shortcut system (`src/utils/shortcuts.ts` registry, `combo` on `commanderCommands`, unified keydown dispatcher, palette displays derived combo). Item 11 (diff annotation) deferred. `tsc -b` + `vite build` + `oxlint` + `vitest` (92) pass. Uncommitted — user tests, then commits. |
| 2026-08-06 | **Changed:** remapped shortcuts to single-key + cmd — `⌘A` New Agent, `⌘S` New Shell, `⌘N` New Workspace, `⌘O` Open Workspace, `⌘T` New Window, `⌘B` Chat, `⌘E` Workspace Sidebar, `⌘F` Focus, `⌘D` Dashboard, `⌘G` Git Review, `⌘J` Settings, `⌘K` Palette. Synced native menu accelerators (mac + Windows), added `new-window` IPC, `handleLoadWorkspace`, updated `menu-action` cases + shortcuts help. Save/Select-All lost their `⌘S`/`⌘A` accelerators. |
