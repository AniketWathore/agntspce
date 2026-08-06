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
- [ ] **2. Add vitest for backend services**
  - [x] vitest config + `npm run test` script
  - [x] `statusDetector` tests (24 passing)
  - [x] `outputFilter` tests (20 passing)
  - [x] `agentManager` tests (30 passing)
  - [ ] `sessionManager` tests (blocked: heavy node-pty/WorkspaceManager deps)
- [x] **3. Fix StrictMode double-fire pattern**
  - [x] Shared `useSocketEvent` hook that guarantees `return unsub`
  - [x] Audit every existing socket listener consumer in `src/`
- [ ] **4. Centralize config**
  - [ ] Single `config.ts` for port, CORS, session timeout, max buffer size
  - [ ] Server + builder read from same source

## Tier 2 — Performance

> Goal: faster startup, lower memory/CPU, smoother terminal streaming.

- [ ] **5. WebGL terminal renderer**
  - [ ] Add `@xterm/addon-webgl` to `TerminalPane.tsx` / `TerminalArea.tsx`
  - [ ] Graceful fallback to DOM renderer on GPU failure
- [ ] **6. Lazy-load heavy panels**
  - [ ] `React.lazy` + `Suspense` for Monaco, Dashboard, ChatSidebar, GitReviewPanel
- [ ] **7. Batch/throttle `terminal-output` socket events**
  - [ ] ~30ms aggregation on renderer side
  - [ ] ANSI stripping once server-side

## Tier 3 — Features

> Goal: parity with Orca/Superset on the high-value, low-risk items.

- [ ] **8. Workspace presets** (setup/teardown scripts per workspace, Superset-style)
- [ ] **9. Wire up declared-but-unconfigured agents** (`cursor-agent`, `copilot`, `mastracode`, `droid`, `amp`, `pi`)
- [ ] **10. Keyboard shortcut system** (global, customizable)
- [ ] **11. Diff annotation → ship comments back to agent**

---

## Progress Log

| Date | Change |
|:-----|:-------|
| 2026-08-06 | Branch `agntspce-v1` created; roadmap added |
| 2026-08-06 | **Done:** `main.ts` split — extracted `config.ts`, `window.ts`, `server/` (bootstrap, api, context, per-domain handlers); `main.ts` now 95 lines. `tsc -b` + `vite build` + lint pass. |
| 2026-08-06 | **Done:** vitest added — `vitest.config.ts`, `"test": "vitest run"` script; 74 passing tests across `statusDetector` (24), `outputFilter` (20), `agentManager` (30). `vitest.config.ts` added to `tsconfig.node.json`. Orchestration integration tests excluded from vitest (run via `node --test`). `tsc -b` + `vite build` + `oxlint` all pass. |
| 2026-08-06 | **Done:** StrictMode double-fire fix — new `useSocketEvent` hook guarantees `return unsub` structurally; migrated `App.tsx` (terminal-output buffer) and `ChatSidebar` (chat stream/response/error) to it. Audited `TerminalPane`/`TerminalArea` — already clean up correctly. `tsc -b` + `vite build` pass. |
