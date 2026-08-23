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

- [x] **P3.1** Store chat API keys via Electron `safeStorage` instead of plaintext JSON (`chatManager.ts`) — config saved encrypted (`enc:v1:` prefix) when OS keychain available; legacy plaintext files load transparently and re-save encrypted on next change
- [x] **P3.2** Window hardening: `setWindowOpenHandler` deny-all + `will-navigate` guard (allows only app origin; external http(s) links go to system browser)
- [x] **P3.3** Validate `maxCount` numeric coercion in git path (`gitHelper.getLog` clamps to int 1–1000; renderer-supplied value can no longer reach git argv raw)
- [x] **P3.4** Validate worktree `namingPattern` — done in P1.4 (`safeWorktreeName`)
- [x] **P3.5** Restrict `open-in-explorer` — better: removed entirely. Renderer declared it but never called it; deleted preload exposure + type + IPC handler
- [~] **P3.6** Hardcoded HMAC constants:
  - [x] `searchManager.ts` — now signs tokens with a per-install random secret persisted at `<userData>/.install-secret` (mode 0600); nothing external verifies these tokens so rotation is harmless
  - [/] `rtkManager.ts` — **won't-fix for now**: the compiled RTK binaries (`bin/rtk-*`) embed the same constant and *verify* `AGNTSPCE_RTK_SESSION` tokens against it; changing our side alone would break RTK session gating. Requires rebuilding the Rust binary with a matching secret mechanism

## Phase 4 — Medium perf / bugs

- [x] **P4.1** O(n²) buffer fix: pending output is accumulated as chunk arrays with byte counters; trim-to-cap happens amortized (only past 2× cap), join+single slice at flush time (`useSocket.ts`)
- [x] **P4.2** Orphaned `outputBuffer` entries pruned on `sessions` / `workspace-changed` full snapshots
- [x] **P4.3** Re-render storm (surgical subset): global keydown listener now reads session state through a ref and binds once for the app lifetime instead of remove/re-add on every status flip. Full memoization architecture deferred → Phase 6
- [x] **P4.4** Chat history race: staleness guard ignores responses for threads the user has already switched away from (`ChatSidebar.tsx`)
- [x] **P4.5** Purified setState-inside-updater: `closeFile` computes next active file outside the updater; chat stream/response/error handlers set `streaming` outside updaters (StrictMode-safe)
- [x] **P4.6** Drag listeners removed on unmount if a drag is mid-flight (`App.tsx` ×2 resizers, `TerminalPane.tsx` edge drag, `GitReviewPanel.tsx` graph drag) via `dragCleanupRef` + unmount effect
- [x] **P4.7** Grid style thrash: while dragging, computed `tilingStyle` folds in `dragSizeRef` values, so React re-renders no longer snap the grid back mid-drag

## Phase 5 — Consistency / dead code

- [x] **P5.1** Single source of truth: new `src/utils/agentTypes.ts` exports `ALL_AGENT_TYPES` / `AGENT_TYPE_SET` / `isAgentTypeId()`; App.tsx + TerminalPane use it — fixes StartupUI never appearing for cursor-agent/copilot/droid/etc. `FALLBACK_AGENTS` synced with backend agentManager (claude verbose/debug flags, codex sandbox/approval flags + models/reasoning/verbosity, gemini models)
- [x] **P5.2** Deleted duplicate `GridDef` interface + unused `terminalPaneSizes` localStorage write (`TerminalArea.tsx`)
- [~] **P5.3** Parallelize await-in-loop — only where safe:
  - [x] `workspaceManager.saveAllSessionBuffers` → `Promise.all` (independent file writes)
  - [/] worktreeHelper loops → sequential required (concurrent `git worktree add` risks index-lock contention)
  - [/] workspaceManager restore/permanent-delete scans → early-exit loops are already optimal for their lookup semantics

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

### 2026-08-22 — Phases 3–5 implemented

**Phase 3 (medium security)**
- `electron/services/chatManager.ts`: chat config now encrypted at rest via `safeStorage.encryptString` (`enc:v1:` prefix + base64). Legacy plaintext configs load transparently and get encrypted on next save. Falls back to plaintext write only if OS keychain unavailable.
- `electron/window.ts`: `setWindowOpenHandler(() => ({ action: 'deny' }))` + `will-navigate` guard on every BrowserWindow — navigation limited to the app bundle origin; external http(s) URLs are handed to the system browser via `shell.openExternal`.
- `electron/services/gitHelper.ts`: `getLog` coerces renderer-supplied `maxCount` to bounded integer (1–1000).
- Removed unused `open-in-explorer` IPC surface entirely (preload exposure, type declaration, handler) — renderer never called it.
- `electron/services/searchManager.ts`: search session tokens now signed with per-install random secret persisted at `<userData>/.install-secret` (0600). rtkManager constant left in place — the prebuilt RTK binaries verify tokens against it; changing requires a Rust rebuild.

**Phase 4 (perf/bugs)**
- `src/hooks/useSocket.ts`: pending output stored as chunk arrays with byte counters; amortized trim past 2× cap, single join+slice per flush. Orphans pruned on full session snapshots.
- `src/App.tsx`: keydown listener binds once; reads `activeSessionId`/`agentSessions` through a ref (no more remove/re-add + tree re-render per status flip).
- `src/components/ChatSidebar.tsx`: thread-history responses guarded against stale thread switches.
- `src/App.tsx` `closeFile` + ChatSidebar stream/response/error handlers: side-effect-free updaters.
- Drag-listener cleanup on unmount: `App.tsx` (sidebar + terminal resizers), `TerminalPane.tsx` (edge drag), `GitReviewPanel.tsx` (graph drag) — all register their `onUp` into a `dragCleanupRef` flushed by an unmount effect.
- `src/components/TerminalArea.tsx`: during pane-resize drags the computed grid style includes in-flight sizes, so React re-renders no longer snap back mid-drag.

**Phase 5 (consistency/dead code)**
- New `src/utils/agentTypes.ts` = single source of agent-capable types; App.tsx and TerminalPane.tsx consume it. StartupUI now appears for all agent types (previously only claude/codex/opencode/gemini), un-sticking waiting sessions of legacy types.
- `FALLBACK_AGENTS` (offline path) synced to backend agentManager: Claude Verbose/Debug, Codex sandbox+approval flags and models/reasoning/verbosity, Gemini models.
- Removed duplicate `GridDef` interface and dead `terminalPaneSizes` localStorage write.
- Parallelized `workspaceManager.saveAllSessionBuffers`; skipped worktree loops (git lock contention) and early-exit lookup scans by design.

**Verification**: `tsc -b` clean · oxlint warning count unchanged from baseline (39, all pre-existing categories) · `npm run build` succeeds.
