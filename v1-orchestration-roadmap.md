# AgntSpce v1 Orchestration Roadmap

This roadmap tracks the production-grade multi-agent orchestration build:
10+ agents on one codebase, never overlapping, with shared context, isolated
worktrees, and a verified merge pipeline. Tick off items as they land.

Legend: `[ ]` = pending, `[x]` = done, `[~]` = in progress

---

## Phase 0 — Fuse the two systems (foundation)

> Goal: one state store, one coordinator, one session manager. Kill the
> dual-system split between `AgentOrchestrator`/`SessionManager` (session side)
> and `electron/services/orchestration/` (task side).

- [x] **0.1 Extend SQLite schema** for the unified store
  - [x] New tables: `sessions`, `worktrees`, `claims`, `agent_contexts`, `gates`
  - [x] `orchestration/schema.ts` already has `agents/tasks/messages/escalations/status_updates/task_summaries`
  - [x] Add `failure_count` to `tasks` (feeds circuit breaker, Phase 3)
    - Added `migrateSchema()` (PRAGMA-based column check) so pre-existing DBs get `failure_count` via ALTER
- [x] **0.2 Make `AgentOrchestrator` own the state store** (not just `SessionRecord` map)
  - [x] `agentOrchestrator.ts:4-13` — wire to unified SQLite
    - `AgentOrchestrator` gains optional `StateManager` (`setStateManager`/`getStateManager`), wired from `main.ts` → `bootstrapServer` → `createServerContext`
    - `registerSession` upserts a `sessions` row (id, type, agentId, worktreeId, status); `unregisterSession` marks `closed_at`; `markHealthCheck` touches `last_activity`
    - `StateManager` gained Session CRUD: `upsertSession`/`getSession`/`listSessions`/`closeSessionRecord`/`touchSession`/`linkSessionToTask` + `SessionRow`/`SessionOverview`
- [x] **0.3 Session ↔ task linkage** — every session gets a task row (even ad-hoc agents)
  - [x] `sessionManager.createSession` (`:375`) ↔ `stateManager.createTask` (`:171`)
    - `registerSession` calls `stateManager.ensureSessionTask()` for every agent-type session — creates an `open` task row linked via `sessions.task_id` (idempotent, reuses existing linkage)
- [x] **0.4 `.agntspce/` lifecycle** — create on workspace create, teardown on delete
  - [x] `bootstrap.ts` discovery + db wired into `workspaceManager`
    - New `bootstrap.ts` helpers: `getAgntSpceDir`/`ensureAgntSpceDir` (mkdir `.agntspce/`) and `teardownAgntSpce` (rm -rf, guarded: skips if a live coordinator discovery exists)
    - `workspaceManager` scaffolds `.agntspce/` on `createWorkspace`, `cloneFromGitUrl`, `switchWorkspace`, `restoreWorkspace`, and active-workspace init (boot); tears down on `deleteWorkspace`
    - New `workspaceManager.getOrchestrationPaths()` exposes `repoPath`/`dbPath`/`discoveryPath` from bootstrap helpers

## Phase 1 — Safety core (never overlap)

> Goal: 10 agents physically cannot collide, and the resource model actually
> enforces limits.

- [x] **1.1 Universal worktrees** — every agent type gets a worktree (drop gemini exemption)
  - [x] `agentManager.ts:146-167` (capabilities) + `worktreeLifecycle.ts:93` + `createParallelTask` (`sessionManager.ts:835`)
    - All agent capability blocks (`supportsWorktree`/`requiresGitRepo`/`supportsParallel`) flipped to `true`; no more per-agent worktree exemption
- [x] **1.2 Deterministic naming + safe teardown**
  - [x] `worktree/<sessionId>` naming; branch deleted only if merged
    - `WorktreeLifecycle` naming changed `agntspce/task-<shortId>` → `worktree/<id>` (branch + dir), deterministic
    - `removeWorktree(id, integrationBranch?)` deletes the branch ONLY if `git merge-base --is-ancestor` against the integration branch; unmerged branches survive teardown
    - `mergeGate` Step 11 passes `baseBranch`; `StateManager` records worktrees in the `worktrees` table (`recordWorktree`/`markWorktreeRemoved`/`getWorktree`/`listActiveWorktrees`), wired in coordinator `claim_task` and mergeGate success path
  - [x] `closeSession` (`:672`) teardown path
    - `AgentOrchestrator.unregisterSession` → `teardownMergedWorktree()`: when a session closes, if its linked task is `done` and has a worktree, remove the worktree (merged-only) via the integration branch
- [x] **1.3 Wire the concurrency semaphore** — actually `acquireSlot()` in `createSession`
  - [x] `agentOrchestrator.ts:16,32` (dead today); cap 8–10, configurable via `config.json`
    - `createSession` is async; agent sessions `await acquireSlot()` before spawn, release stored on `session.slotRelease`
    - Release on PTY `onExit` + `closeSession` (idempotent wrapper guards double-release); spawn-failure releases too
    - Auto-restart path re-acquires a fresh slot; `createRawSession`/`createParallelTask`/handlers made async
    - Cap defaults to 8, reads `orchestration.maxConcurrentSessions` from `config.json`
- [x] **1.4 Wire the health heartbeat** — call `markHealthCheck()` on PTY activity
  - [x] `agentOrchestrator.ts:136` + `sessionManager.ts:592`
    - `onData` handler calls `orchestrator.markHealthCheck(sessionId)` per output chunk
- [x] **1.5 Claim enforcement on ALL sessions** — task requires `declaredFiles` before agent starts
  - [x] Extend `stateManager.claimTask` (`:340`) to session-start path
    - New `stateManager.claimSessionTask()`: sets the session task's `declared_files` + `agent_id`, checks overlap against other active tasks (rejecting with `OVERLAP`), transitions `open → in_progress`; terminal tasks are unlinked so fresh session starts get a new task
    - New `AgentOrchestrator.enforceSessionClaims()` delegates to the above; `startAgentWithConfig` enforces BEFORE the agent command is written (blocks start on conflict); `createParallelTask` enforces eagerly with sibling-worktree exclusion (parallel group members don't block each other but still block against non-group tasks, rolling back sessions on failure)
    - `checkFileOverlap` gained an optional multi-exclude (`excludeTaskIds`); `declaredFiles` threaded through `AgentStartConfig` (frontend + backend) and an optional comma-separated "Declared Files" input in `AgentModal`

## Phase 2 — Context (agents know each other)

> Goal: every agent starts with the project state, who's who, who owns what,
> and receives updates.

- [x] **2.1 Dispatch preamble** — inject header before agent command in PTY
  - [x] `sessionManager.startAgentWithConfig` (`:906-931`) — write `preamble + command`
    - New `StateManager.buildDispatchPreamble()` — compact (~2KB cap) header naming active agents (non-system), their tasks/claims/branches; returns `''` when no context
    - `startAgentWithConfig` delivers it as the agent's first stdin message ~2.2s after launch (agents are interactive CLIs; parallel-task `prompt` now follows the preamble in the same write)
    - Skipped for `resume`/`continue` modes (don't pollute existing conversations); own task excluded from the list
    - `AgentStartConfig` gained `prompt?: string` (backend + frontend); `createParallelTask` passes prompt through instead of a separate delayed write
- [x] **2.2 Per-agent context files** — `.agntspce/context/<agentId>.md`, updated on output activity
  - [x] Summaries capped ~2–5KB; written from RTK tee + `sessionSummarizer`
    - New `electron/services/orchestration/contextWriter.ts` (`ContextWriter`): writes `.agntspce/context/<agentId>.md` per agent type; sections = header (status/branch) + task summary (via `SessionSummarizer`) + bounded recent-activity tail (1.2KB); file capped at 5KB; throttled per-agent (~1.5s), bypassable; `readContext`/`clearContext`
    - `sessionManager` wired it: `updateSessionContext()` on every PTY `onData`; `finalizeSessionContext()` on `closeSession` (full buffer tail, throttle bypassed, status `exited`)
  - [x] New `contextWriter` service
- [x] **2.3 End-of-session summary** — written + broadcast to all agents' preambles
  - [x] `closeSession` (`:672`) + `sessionSummarizer.summarizeTask` (`:44`)
    - `finalizeSessionContext` on close writes the task summary into `.agntspce/context/<agentId>.md` (via `ContextWriter` + `SessionSummarizer.summarizeTask`)
    - `StateManager.getRecentCompletions()` reads done-task summaries; `buildDispatchPreamble` gained a "Recently completed" section so every newly-launched agent sees what others just finished (broadcast via preamble)
- [x] **2.4 Lightweight FileIndexer** (import-edge only, ~400 lines)
  - [x] New `electron/services/fileIndexer.ts`
    - `FileIndexer` class: `scan()` walks repo once (ignores `.git`/`node_modules`/`dist`/etc.), regex-extracts import edges per language (TS/JS `import`/`require`, Python `import`/`from`, Go `"pkg"`, Rust `use`/`mod`, C/C++ `#include`, Ruby `require`, Java `import`, PHP `require`/`include`), max 256KB/file, max 20K files
    - `resolveToFile` resolves extension-less imports (`.ts`, `.tsx`, `.js`, `/index.ts`, …) so `./types` → `electron/services/types.ts`; relative edges resolved via `path.posix.normalize(join(dir, imp))` (NOT `resolve`, which escapes to absolute CWD paths)
    - `getConnectedFiles(file, depth=2, maxNodes=20)` serves bounded bidirectional BFS slices (imports + importedBy) — never dumps the graph
    - `updateFiles()` incremental re-index of changed paths; `updateFromGit()` via `git status --porcelain`; `load()`/`save()` round-trip JSON
  - [x] Scan once at workspace create; incremental update on git events
    - `workspaceManager.ensureWorkspaceScaffold` builds `FileIndexer`, `load()`s existing index or `scan()`s on first run; logged per workspace
  - [x] Store in `.agntspce/` (`.agntspce/file-index.json`); serve connected-files slices on demand (`getConnectedFiles` ready for 2.5/3.2)
- [x] **2.5 Preamble includes actual-files from git diff** of other agents (free)
  - [x] Reuse diff computation in `mergeGate.ts:83` (`git diff --name-only ${branchPoint}..${branchName}`)
    - New `StateManager.getBranchDiffFiles()` mirrors it exactly (best-effort try/catch — transient git failure can't break preamble), capped to 8 files per task
    - `buildDispatchPreamble` now appends `touching: <files>` per active task so a freshly-launched agent sees what other agents have *actually* changed on their branches (not just declared files)
    - git logic verified in isolation (branch diff → `src/b.ts`)

## Phase 3 — Collaboration (safe live coordination)

> Goal: agents talk without interrupting, failures don't spin, humans approve risk.

- [x] **3.1 Idle-delivered messaging** — `send_message` queues, delivers only when receiver is IDLE
  - [x] `stateManager.sendMessage` gained `deliverOnlyWhenIdle` (default true for directed messages; broadcasts + `deliverNow: true` deliver immediately)
  - [x] Delivery gate: `getPendingMessages`/`markMessagesRead` hold back idle-delivered messages while the receiver has an active task (`claimed`/`in_progress`); a taskless agent is treated as idle so piggybacking still works right after registration
  - [x] Schema: `messages.deliver_only_when_idle` column + migration; `MessageRow`/`MessageInfo` extended
  - [x] Coordinator `send_message` passes `deliverNow`; proxy tool `send_message` exposes it
  - [x] SQL gate verified with sqlite3 CLI (busy → only urgent+broadcast; idle → all)
- [x] **3.2 Live file watcher** — worktree edits vs. other agents' claims → notify both
  - [x] New `fileWatcher` service: `FileWatcher` watches `.agntspce/worktrees/` via `fs.watch` recursive with a `git status --porcelain` polling fallback (baseline captured at start so first poll catches edits)
  - [x] On an edit, maps the file back to its owning worktree/task/agent and runs the scope-overlap check (reuses mergeGate.ts:104-128 logic via `StateManager.checkFileOverlap` with `excludeTaskId`); noise (`node_modules`, `.git`, `dist`, …) filtered
  - [x] Coordinator wires it: `startFileWatcher()` on `listen()`, `handleFileConflict()` broadcasts a `[file-conflict]` message + `new_message` push to the editor AND every conflicting agent
  - [x] Verified in isolation with a stub StateManager + two worktrees (edit of shared file → conflict event with both agent ids)
- [x] **3.3 Circuit breaker** — task failing 3× re-dispatches to another agent
  - [x] Uses `tasks.failure_count` (Phase 0)
    - `StateManager.redispatchTask()` clears agent/branch/worktree and returns the task to `open`; `recordTaskFailure`/`resetTaskFailures` already existed
    - Coordinator `recordTaskFailureAndMaybeRedispatch()`: increments the count, posts a status update; at `CIRCUIT_BREAKER_THRESHOLD` (3) it releases the task, resets the count, and broadcasts a `[circuit-breaker]` message to all agents (task available for re-claim)
    - Wired into failure paths: `claim_task` dependency-install failure, `retry_task_setup` failure, `merge_branch` merge failure; successful merges reset the count
    - SQL verified with sqlite3 CLI (failure 3 → task `open`, agent/branch cleared)
- [x] **3.4 Decision gates** — `blocked → human approve → redispatch` for risky merges
  - [x] New `gates` table (Phase 0) + reuse escalation UI flow
    - `StateManager` Gate CRUD: `createGate` (status `blocked`), `resolveGate` (`approved`/`rejected`), `listGates`, `getOpenGatesForTask`, `hasOpenGate`; `GateInfo`/`GateRow` types
    - Coordinator: `request_gate` / `resolve_gate` / `list_gates` RPCs; `merge_branch` refuses with `GATE_BLOCKED` when an open gate exists; rejected gates `redispatchTask()` (releases for another agent) + broadcast `[gate]` message; approved gates post a status update allowing merge
    - Proxy tools: `request_gate`, `list_gates`
    - SQL verified with sqlite3 CLI (block → approve → proceed; reject → task released)

## Phase 4 — Completion pipeline

> Goal: every task ends the same safe way: sandbox → test → merge.

- [x] **4.1 MergeGate as default completion path** for every task
  - [x] `mergeGate.ts` already: clean-check → overlap-scan → scratch merge → build/test → CAS promote
    - Confirmed the full pipeline in `executeMerge` (`:50`): worktree-clean check → actual-files diff → scope-overlap scan → scratch worktree merge → dep install + build/test (`detectBuildCommand`/`runCommands`) → compare-and-swap promotion via `update-ref` → task `done` → worktree removal → broadcast
- [x] **4.2 Auto build/test on sandbox branch** — gate blocks until green
  - [x] `worktreeLifecycle.detectBuildCommand` (`:27`)
    - `executeMerge` Step 8 installs deps in the merged scratch candidate and runs build + test; failures escalate and the merge is blocked (worktree kept for review) — the gate never promotes a red candidate
- [x] **4.3 Human control point on risky merges** → decision gate (Phase 3)
  - [x] `mergeGate.ts:115-128` escalation path
    - The merge-time scope-overlap path now creates a **decision gate** (`createGate`, status `blocked`) instead of a silent escalation: `MergeResult.gateId` is set, `merge_branch` returns the block without feeding the circuit breaker, a human approves → merge may retry, rejects → `redispatchTask` releases the task for another agent
- [x] **4.4 Broadcast completion summary** to all agents (feeds Phase 2)
  - [x] On successful merge, coordinator refreshes the summary via `SessionSummarizer.summarizeTask` (writes `task_summaries`, feeding `getRecentCompletions`/preamble) and broadcasts a `[completion]` message to every other agent

## Phase 5 — Production hardening

> Goal: survives crashes, is observable, is testable, is configurable.

- [x] **5.1 Crash recovery** — orphan worktree sweep on boot, stale-agent sweep
  - [x] Coordinator sweep exists (`coordinator.ts:33`); extend to worktrees
    - `WorktreeLifecycle.sweepOrphanWorktrees(activeTaskIds, integrationBranch)` removes task worktrees whose task is no longer active (done/abandoned/missing), following the merged-branch-only rule so unmerged work survives; `cleanupScratchWorktrees()` drops scratch-* dirs. Wired into coordinator boot (`listen`) + the periodic sweep timer; logs `orphan-worktrees-swept` with the count. Verified with real-repo integration tests.
- [x] **5.2 Idempotency keys on socket handlers** — prevent double-fire (StrictMode gotcha)
  - [x] `RpcRequest` accepts an `idempotencyKey` param; coordinator dedups on `${agentId}|${method}|${key}` with a 60s TTL cache — duplicate requests replay the cached response instead of re-executing. `CoordinatorClient.request(method, params, idempotencyKey?)` and an `idemKey(method, stableParams)` hash applied to all mutating proxy tools (create_task, claim_task, post_status, mark_task_done, retry_task_setup, abandon_task, send_message, merge_branch, request_gate, escalate_to_human). Verified: duplicate create_task/claim_task with the same key → side effect ran once.
- [x] **5.3 Structured logging + orchestrator stats**
  - [x] `stats.ts` handler exists; add task/worktree/message/claim gauges
    - New `StructuredLogger` (`logger.ts`): JSON-lines to `<repo>/.agntspce/logs/orchestration.log`, per-component level threshold, warn/error mirrored to stderr. Coordinator logs listen/close/claim/merge/circuit-breaker/sweep events. `StateManager.getOrchestratorStats()` aggregates agents/tasks/worktrees/sessions/messages/escalations/gates/completions gauges; exposed via `AgentOrchestrator.getOrchestrationStats()` → `get-orchestrator-stats` handler. Verified via sqlite3 CLI seeded-schema check.
- [x] **5.4 Config** — maxConcurrency, idle timeout, worktree flag, gate auto-mode
  - [x] `config.json`
    - New `config.ts` `loadOrchestrationConfig(baseDir?)` reads `orchestration` from `config.json` (workspace root / cwd / `.agntspce/config.json`), per-field validation with `DEFAULT_ORCHESTRATION_CONFIG` fallbacks: `maxConcurrentSessions`, `staleAgentTimeoutMs`, `useWorktrees`, `gateAutoApprove`, `circuitBreakerThreshold`, `sweepIntervalMs`, `logLevel`. Coordinator consumes config for sweep interval, circuit-breaker threshold, log level, gate auto-approve (auto-approves both `request_gate` and mergeGate overlap-created gates then retries the merge), and `useWorktrees:false` → `createInRepoBranch`/`cleanupInRepoTaskBranch` (work directly on a task branch in the repo instead of a detached worktree). `config.json` updated. Verified via config loader + real-repo in-repo branch integration tests.
- [x] **5.5 Test suite per phase**
  - [x] `orchestration/__tests__/` exists; add phase-specific tests
    - New `electron/services/__tests__/orchestrationPhase5.test.ts` (8 vitest tests, no better-sqlite3 dependency so they run under the standard suite): config loader (defaults/partial/invalid), StructuredLogger (JSON-lines output + level threshold), orphan worktree sweep (active-only retention, scratch cleanup), and no-worktree branch lifecycle. **Phase 5 complete.** tsc + build + lint pass; **100 vitest tests pass (5 files)**.

---

## Dependency order

```
Phase 0 (fuse) ─► Phase 1 (safety) ─► Phase 2 (context) ─► Phase 3 (collab) ─► Phase 4 (merge) ─► Phase 5 (harden)
                      │                    │                       │
                      └──── fileIndexer ───┘                       └── needs gates from Phase 3
                      └──── semaphore/heartbeat (small, can land anytime)
```

Phases 1–4 each depend on Phase 0. Within a phase, the builds are largely parallelizable.

---

## Changelog

| Date | Change |
|:-----|:-------|
| 2026-08-08 | Created `v1-orchestration-roadmap.md` with Phases 0–5 (fuse → safety → context → collaboration → completion → hardening), dependency order, and this changelog. Nothing implemented yet — all items pending. |
| 2026-08-08 | **0.1** Extended SQLite schema: added `sessions`, `worktrees`, `claims`, `agent_contexts`, `gates` tables + indexes; added `tasks.failure_count`; added `migrateSchema()` for pre-existing DBs; wired failure-tracking into `StateManager` (`getTaskFailureCount`/`recordTaskFailure`/`resetTaskFailures`), `TaskRow`/`TaskOverview.failureCount`, and `Session.slotRelease`. |
| 2026-08-08 | **1.3** Wired concurrency semaphore: `createSession` is now async and `await acquireSlot()` for agent sessions; release stored on `session.slotRelease`, released on PTY `onExit`, `closeSession`, and spawn-failure (idempotent guard); auto-restart path re-acquires; `createRawSession`/`createParallelTask`/socket handlers made async; cap default 8, configurable via `config.json` `orchestration.maxConcurrentSessions`. **1.4** Wired health heartbeat: `markHealthCheck(sessionId)` on every PTY `onData`. Build + tsc + lint pass (orchestration tests fail only under plain Node due to pre-existing `better-sqlite3` Electron ABI mismatch). |
| 2026-08-08 | **0.2** `AgentOrchestrator` now owns the unified SQLite store: optional `StateManager` wired from `main.ts` → `bootstrapServer` → `createServerContext`; `registerSession`/`unregisterSession`/`markHealthCheck` persist `sessions` rows (upsert/close/touch); added Session CRUD + `SessionRow`/`SessionOverview` to `StateManager`. **0.3** Session↔task linkage: `ensureSessionTask()` creates an `open` task row for every agent-type session, linked via `sessions.task_id` (idempotent). tsc + full build pass. |
| 2026-08-08 | **1.1** Universal worktrees: flipped every agent capability block in `agentManager.ts` (`supportsWorktree`/`requiresGitRepo`/`supportsParallel`) to `true` — gemini + all reference agents (copilot/mastracode/droid/amp/pi/kilocode/windsurf) now get worktrees in `createParallelTask`. **1.2** Deterministic naming + safe teardown: `WorktreeLifecycle` naming `agntspce/task-<shortId>` → `worktree/<id>` (branch + dir); `removeWorktree` deletes branch only if merged into integration branch (`git merge-base --is-ancestor`), unmerged branches survive; `mergeGate` Step 11 passes `baseBranch`; `StateManager` gained worktree CRUD (`recordWorktree`/`markWorktreeRemoved`/`getWorktree`/`listActiveWorktrees`) wired into coordinator `claim_task` + mergeGate success; `closeSession` teardown via `AgentOrchestrator.unregisterSession` → `teardownMergedWorktree` (removes worktree only for `done` tasks). tsc + build + lint pass; behavior verified in-isolation (orchestration `node:test` suites still blocked by pre-existing `better-sqlite3` Electron ABI mismatch). |
| 2026-08-08 | **1.5** Claim enforcement on ALL sessions: new `stateManager.claimSessionTask()` sets the session task's `declared_files`/`agent_id`, runs the overlap check against active tasks (throws `OVERLAP` to block), transitions `open → in_progress`, and unlinks terminal tasks so fresh starts get a new task; new `AgentOrchestrator.enforceSessionClaims()`; `startAgentWithConfig` enforces before writing the agent command; `createParallelTask` enforces eagerly with sibling-worktree exclusion and rolls back sessions on failure; `checkFileOverlap` gained `excludeTaskIds`; `declaredFiles` threaded through `AgentStartConfig` (frontend + backend) with an optional "Declared Files" input in `AgentModal`. tsc + build + lint pass; 92 vitest tests pass (orchestration `node:test` suites still blocked by the pre-existing `better-sqlite3` Electron ABI mismatch). |
| 2026-08-08 | **0.4** `.agntspce/` lifecycle: new `bootstrap.ts` helpers `getAgntSpceDir`/`ensureAgntSpceDir`/`teardownAgntSpce` (guarded — skips rm if a live coordinator discovery exists); `WorkspaceManager` scaffolds `.agntspce/` on create/clone/switch/restore/boot-active and tears it down on delete; new `getOrchestrationPaths()` exposes repo/db/discovery paths wired to bootstrap. tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **2.1** Dispatch preamble: new `StateManager.buildDispatchPreamble()` (≤2KB, names non-system active agents + their tasks/claims/branches, returns `''` when no context); `startAgentWithConfig` injects it as the agent's first stdin message ~2.2s after launch for fresh dispatches (skipped for resume/continue; own task excluded), with parallel-task `prompt` appended in the same write; `AgentStartConfig` gained `prompt?: string` and `createParallelTask` now passes it through instead of a separate delayed prompt write. tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **2.2** Per-agent context files: new `ContextWriter` service writes `.agntspce/context/<agentId>.md` (header status/branch + task summary via `SessionSummarizer` + bounded recent-activity tail, file capped 5KB, per-agent 1.5s throttle bypassable); `sessionManager` calls `updateSessionContext()` on every PTY `onData` and `finalizeSessionContext()` on `closeSession` (full tail, status exited). Verified in isolation (write/read/throttle/clear). tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **2.3** End-of-session summary: `finalizeSessionContext()` writes the task summary into `.agntspce/context/<agentId>.md` on close (via `ContextWriter` + `SessionSummarizer.summarizeTask`); `StateManager.getRecentCompletions()` reads done-task summaries and `buildDispatchPreamble` gained a "Recently completed" section — every freshly-launched agent sees what others just finished (broadcast via preamble). tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **2.4** Lightweight FileIndexer: new `electron/services/fileIndexer.ts` — `FileIndexer` scans repo once (regex import-edge extraction per language: TS/JS/Python/Go/Rust/C/C++/Ruby/Java/PHP; ignores `.git`/`node_modules`/`dist`/etc., 256KB/file + 20K-file caps), `resolveToFile` resolves extension-less imports (`./types` → `.ts`, `/index.ts` fallback) via `path.posix.normalize(join(...))`, `getConnectedFiles()` serves bounded bidirectional BFS slices (imports + importedBy, depth 2, 20 nodes), `updateFiles()`/`updateFromGit()` do incremental updates; persisted as `.agntspce/file-index.json` (versioned, load/save round-trip); `workspaceManager.ensureWorkspaceScaffold` scans on first run per workspace. Verified in isolation (scan → 6576 files/185 edges, connected-slices, incremental, reload, has()). tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **2.5** Preamble actual-files: new `StateManager.getBranchDiffFiles()` mirrors the mergeGate diff (`git diff --name-only ${branchPoint}..${branchName}`, `mergeGate.ts:83`) best-effort with an 8-file cap; `buildDispatchPreamble` appends `touching: <files>` per active task so newly-launched agents see what others have *actually* changed on their branches. Phase 2 (context) complete. git diff logic verified in isolation; tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **3.1** Idle-delivered messaging: `stateManager.sendMessage` gained `deliverOnlyWhenIdle` (directed messages queue by default; broadcasts and `deliverNow: true` deliver immediately); delivery gate in `getPendingMessages`/`markMessagesRead` holds idle-only messages while the receiver has an active `claimed`/`in_progress` task (taskless agents are treated as idle so registration-time piggybacking still works); new `messages.deliver_only_when_idle` column + migration; coordinator + `send_message` proxy tool expose `deliverNow`. SQL gate verified with sqlite3 CLI. tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **3.2** Live file watcher: new `electron/services/orchestration/fileWatcher.ts` — `FileWatcher` watches `.agntspce/worktrees/` (recursive `fs.watch` + `git status --porcelain` polling fallback with baseline capture); edits map to owner task/agent and run the mergeGate-style scope-overlap check (`StateManager.checkFileOverlap` with `excludeTaskId`); coordinator `startFileWatcher()` on `listen()` and `handleFileConflict()` broadcasts `[file-conflict]` messages + pushes `new_message` to the editor and all conflicting agents. Verified in isolation (two worktrees, shared-file edit → conflict event with both agent ids). tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **3.3** Circuit breaker: new `StateManager.redispatchTask()` releases a task back to `open` (clears agent/branch/worktree); coordinator `recordTaskFailureAndMaybeRedispatch()` increments `tasks.failure_count` via existing `recordTaskFailure`, and at `CIRCUIT_BREAKER_THRESHOLD` (3) releases the task, resets the count, and broadcasts a `[circuit-breaker]` availability message to all agents. Wired into `claim_task` dependency failure, `retry_task_setup` failure, and `merge_branch` failure (successful merges reset the count). SQL verified with sqlite3 CLI. tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **3.4** Decision gates: `StateManager` Gate CRUD (`createGate` → `blocked`, `resolveGate` → `approved`/`rejected`, `listGates`, `getOpenGatesForTask`, `hasOpenGate`, `GateInfo`/`GateRow`); coordinator `request_gate`/`resolve_gate`/`list_gates` RPCs; `merge_branch` refuses with `GATE_BLOCKED` while a gate is open; a rejected gate calls `redispatchTask()` (task released for another agent) + broadcasts a `[gate]` message; new `request_gate`/`list_gates` proxy tools. **Phase 3 (collaboration) complete.** SQL verified with sqlite3 CLI. tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **4.1** Confirmed `MergeGate.executeMerge` is the complete default completion path (clean-check → actual-files diff → scope-overlap scan → scratch merge → dep install + build/test → CAS promote → done → worktree removal → broadcast). **4.2** Build/test gating confirmed: Step 8 installs deps + runs build/test in the merged scratch candidate; failures escalate and block the merge (never promotes red). **4.3** Human control point: the merge-time scope-overlap path now creates a decision gate (`MergeResult.gateId`), `merge_branch` returns the block without feeding the circuit breaker, approval allows retry, rejection calls `redispatchTask`; verified with stub-StateManager integration (real repo, two worktrees → overlap gate created + `gateId` returned). **4.4** On successful merge, coordinator refreshes `SessionSummarizer.summarizeTask` (writes `task_summaries` → feeds Phase 2 completions) and broadcasts a `[completion]` message to every other agent. **Phase 4 (completion) complete.** tsc + build + lint pass; 92 vitest tests pass. |
| 2026-08-08 | **5.1** Crash recovery: `WorktreeLifecycle.sweepOrphanWorktrees` (removes task worktrees with no active task, merged-branch-only) + existing `cleanupScratchWorktrees`, wired into coordinator boot and periodic sweep, with `orphan-worktrees-swept` log. **5.2** Idempotency: `RpcRequest.idempotencyKey` + coordinator 60s-TTL dedup cache (replays duplicate responses, side effects run once); proxy tools pass `idemKey(method, stableParams)` for all mutating RPCs. **5.3** `StructuredLogger` (JSON-lines to `.agntspce/logs/orchestration.log`, level threshold) logging coordinator lifecycle events + `StateManager.getOrchestratorStats()` gauges (agents/tasks/worktrees/sessions/messages/escalations/gates/completions) exposed via `get-orchestrator-stats`. **5.4** `config.ts` `loadOrchestrationConfig` (defaults + per-field validation from `config.json`): maxConcurrentSessions, staleAgentTimeoutMs, useWorktrees (in-repo branch mode via `createInRepoBranch`/`cleanupInRepoTaskBranch`), gateAutoApprove (auto-approves request/overlap gates then retries merge), circuitBreakerThreshold, sweepIntervalMs, logLevel. **5.5** New `orchestrationPhase5.test.ts` (8 tests, no native-module dep): config loader, logger output+threshold, orphan sweep, no-worktree branch lifecycle. **Phase 5 (hardening) complete — v1 orchestration roadmap DONE.** tsc + build + lint pass; 100 vitest tests pass (5 files). |
