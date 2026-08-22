# AgntSpce — Hardening & Quality Roadmap

Tracker for the full-project audit findings (security, bugs, performance, quality).
Rule: **surgical changes only** — nothing that works today may change behavior.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[/]` skipped/won't-fix (reason noted)

---

## Phase 0 — Baseline (audit)

- [x] `tsc -b` clean (no type errors)
- [x] Skylos scan (`--secrets --danger --quality --sca`) — findings below
- [x] `npm audit` — 14 vulns (1 critical, 8 high)
- [x] Backend security review (electron/)
- [x] Frontend bug/perf review (src/)

## Phase 1 — Critical security

- [x] **P1.1** Run `npm audit fix` (tar critical, socket.io-parser high, undici high, postcss moderate) — **14 vulns → 2 moderate**; the 2 remaining are dompurify via monaco-editor, only fixed by a breaking monaco major upgrade (deferred → see Phase 6 note)
- [x] **P1.2** Kill wildcard CORS on Express (`electron/server/index.ts:33`) — reflect allowlist only
- [x] **P1.3** Per-launch auth token: generated in main, exposed via preload, required on WS handshake (`io.use`) + all `/api/*` routes; renderer attaches it (useSocket, Settings, ChatSidebar fetches). Requests with no Origin header (curl / bin scripts) still pass; browser pages without the token are rejected.
- [x] **P1.4** Replace shell-string command building with array-form spawn args
  - [x] `sessionManager.ts` — added `shq()` quoting + `sanitizeLabel()`; applied to all 9 `cd "${cwd}"` / echo sites
  - [x] `worktreeHelper.ts` — array-form git args + `safeWorktreeName()` validates namingPattern (rejects `..`, absolute paths, shell chars)

## Phase 2 — High-priority correctness / UX

- [x] **P2.1** Shared `emitAck(event, payload, timeoutMs)` helper in `useSocket.ts`; all ~35 ack-based helpers converted (resolve-with-null on disconnect; timeouts 120s default / 300s git ops / 600s clone+parallel-task). Response-mapping logic preserved exactly.
- [x] **P2.2** Terminal output race on pane mount: `TerminalPane.tsx` now subscribes to live output *before* replaying backlog and holds live chunks until backlog finishes queuing (fixes lost/reordered output). Plus 64KB cap on `backlog` handler in `useSocket.ts`.
- [x] **P2.3** Global shortcut guard in `App.tsx`: ⌘A/⌘S/⌘F no longer hijack select-all/save/find while focus is in input/textarea/contenteditable/xterm. All other shortcuts unchanged.

## Phase 3 — Medium security

- [ ] **P3.1** Store chat API keys via Electron `safeStorage` instead of plaintext JSON (`chatManager.ts`)
- [ ] **P3.2** Window hardening: `setWindowOpenHandler` deny + `will-navigate` guard (`window.ts`)
- [ ] **P3.3** Validate `maxCount` numeric coercion in git handlers (`gitHelper.ts:153`, `server/handlers/git.ts`)
- [ ] **P3.4** Validate worktree `namingPattern` (reject `../`, spaces) — folded into P1.4
- [ ] **P3.5** Restrict `open-in-explorer` to workspace/session paths (`window.ts:485-493`)
- [ ] **P3.6** Replace hardcoded HMAC constants with per-install random secret (`searchManager.ts:9`, `rtkManager.ts:12`)

## Phase 4 — Medium perf / bugs

- [ ] **P4.1** Fix O(n²) buffer re-slicing in `terminal-output` handler (`useSocket.ts:190-192`)
- [ ] **P4.2** Prune orphaned `outputBuffer` entries on workspace switch / sessions replace (`useSocket.ts:213-217`)
- [ ] **P4.3** Re-render storm: avoid rebuilding whole `sessions` object per status flip; stop keydown-listener rebinding per event (`App.tsx:407-666`)
- [ ] **P4.4** Chat history race: staleness guard on thread switch (`ChatSidebar.tsx:81-91`)
- [ ] **P4.5** Purify setState-inside-updater (`App.tsx:894 closeFile`, `ChatSidebar.tsx:156-210`)
- [ ] **P4.6** Drag listeners cleanup on unmount (`App.tsx:668+`, `TerminalArea.tsx`, `GitReviewPanel.tsx:137`)
- [ ] **P4.7** Grid style thrash during resize drag (`TerminalArea.tsx:526`)

## Phase 5 — Consistency / dead code

- [ ] **P5.1** Single source of truth for agent types/configs: sync `FALLBACK_AGENTS` (App.tsx) ↔ `agentManager.ts`; derive `isAgentType` from shared constant (`TerminalPane.tsx:44`) so StartupUI shows for all agent types
- [ ] **P5.2** Delete duplicate `GridDef` interface, unused `terminalPaneSizes` write (`TerminalArea.tsx:68-78,468`)
- [ ] **P5.3** Parallelize await-in-loop hot spots flagged by Skylos (`workspaceManager.ts`, `worktreeHelper.ts`) — only where order doesn't matter

## Phase 6 — Larger refactors (deferred, need own review cycle)

- [/] Split `App.tsx` (1160-line component, complexity 137) into feature modules — deferred
- [/] Split `useSocket.ts` (813 lines) into per-domain hooks — deferred
- [/] Extract sessions state into a store (zustand/jotai) — deferred
- [/] Surface swallowed errors as notifications (silent catch blocks across UI) — deferred
- [/] Upgrade monaco-editor to clear the last 2 dompurify audit advisories — breaking change, bundle separately

---

## Verification checklist (run after each phase)

```bash
npx tsc -b          # must stay clean
npm run lint        # oxlint
npm run electron:dev  # manual smoke test: terminals spawn, output streams, chat loads
```

---

## Change Log

### 2026-08-22 — Audit day

- Full scan performed: tsc clean; Skylos found ~80 quality findings + 2 hardcoded-secret flags; npm audit: 14 vulns (tar critical); two deep reviews produced P1–P5 items above.

### 2026-08-22 — Phase 1 (critical security) implemented

- `electron/main.ts`: generate per-launch 256-bit `serverAuthToken` (node:crypto), pass into `bootstrapServer()` and `registerIpcHandlers()`.
- `electron/server/index.ts`: removed `Access-Control-Allow-Origin: *`; CORS now reflects only allowlisted origins (localhost/127.0.0.1) with `Vary: Origin`. Added Socket.IO handshake auth (`io.use`) — token required from any client that sends an Origin header. REST middleware requires the token for any request with an Origin header; Origin-less local tools (curl, `bin/agntspce.mjs` stats reporting) keep working unchanged.
- `electron/window.ts` + `electron/preload.cjs`: new `get-server-auth-token` IPC → exposed as `window.electronAPI.getServerAuthToken()`.
- `src/types/index.ts`: added `getServerAuthToken` declaration. New `src/utils/serverAuth.ts`: cached token getter + `apiHeaders()` / `apiHeadersSync()` helpers.
- `src/hooks/useSocket.ts`: socket now connects with `{ auth: { token } }`; `/api/agents*` fetches send the header. `Settings.tsx` + `ChatSidebar.tsx`: all REST calls send the header.
- `electron/services/sessionManager.ts`: new `shq()` POSIX single-quoting + `sanitizeLabel()`; applied at all 9 sites where workspace paths / repo names were interpolated into shell command strings (`cd "${...}"`, echo banners).
- `electron/services/worktreeHelper.ts`: `execGit` now takes array args (no string splitting); new `safeWorktreeName()` rejects namingPattern results containing `..`, absolute paths, whitespace or shell-active chars.

### 2026-08-22 — Phase 2 (correctness/UX) implemented

- `src/hooks/useSocket.ts`: added bounded `emitAck()` helper; converted all ack-based helpers (~35). Old behavior on missing server response was "hang forever" — now resolves null/fallback within timeout. Long ops get explicit larger timeouts (git push/pull/fetch/log 300s; git clone & parallel tasks 600s).
- `src/components/TerminalPane.tsx`: fixed output race on pane mount — live-output subscription registered before backlog replay starts; live chunks received during replay are queued and flushed in order after backlog completes.
- `src/hooks/useSocket.ts`: `backlog` handler now applies the same 64KB cap as `terminal-output` (previously unbounded growth).
- `src/App.tsx`: ⌘A/⌘S/⌘F app shortcuts are ignored while focus is in an editable element (input/textarea/contenteditable/xterm textarea); all other shortcut behavior untouched.

### Verification (post-fix)

- `npx tsc -b` clean · oxlint: no new warnings (all pre-existing) · `npm run build` succeeds · `npm audit fix` applied (lockfile-only).
- Manual smoke test still recommended: launch `npm run electron:dev`, confirm terminals spawn/stream, chat Settings load keys, git panel commit works.

### 2026-08-22 — Follow-up from electron:dev smoke test

- **Electron binary download explained:** `npm audit fix` bumped electron 42.5.0 → 42.9.3 (security release; caret range in package.json allowed it). A new Electron version downloads its binary once, then it's cached — subsequent runs start instantly again.
- **Fixed: giant APICallError dumps in terminal on chat failures** (`providers/openai.ts`, `anthropic.ts`, `deepseek.ts`, `gemini.ts`). Two problems:
  1. The AI SDK's `streamText` has a default `onError` that raw `console.error`s the entire error object including `requestBodyValues` (i.e., your chat message contents) to stdout.
  2. In this SDK version, `textStream` swallows error chunks entirely, so provider errors never reached `chatManager`'s catch — the UI got an empty assistant reply instead of an error notice.
  - Fix: explicit `onError` captures the error (no stdout dump), then it's rethrown after stream consumption so `chatManager.sendMessageStream` catches it and emits a proper `chat-error` to the UI.
  - Note: the original 402 itself is not a bug — that OpenRouter key is out of credits (top up at openrouter.ai/settings/credits or switch provider/model).
