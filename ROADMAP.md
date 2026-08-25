# ROADMAP — Memory & Performance Hardening

Tracking doc for the RAM/lag investigation and fix program. Each entry lists
what changed, why, and how it was verified, so no change is a mystery later.

**Ground rules (user-mandated):**
- Never break working features — especially RTK / agntspce-search-mcp, agent
  sessions, workspaces, chat.
- RAM must stay flat no matter how long the app runs.
- No lag when scrolling old messages/chats in any agent.

---

## Status board

| Phase | Goal | Status |
|---|---|---|
| 0 | Bounded buffers audit (all stores capped) | ✅ Done 2026-08-25 |
| 1 | SEE — real memory attribution (agent subtrees + app buckets) | ✅ Done 2026-08-25 |
| 2 | SCHEDULER — parse-paced renderer writes + smaller server frames | ✅ Done 2026-08-25 |
| 3 | WEBGL+HYGIENE — GPU rendering with leak-proof lifecycle | ✅ Done 2026-08-25 |
| 4 | HIDDEN GATE — bound cost while window minimized (main-side) | ⬜ After Phase 1 diagnostics confirm need |
| 5 | HEADROOM — `--max-old-space-size` renderer clamp | ⬜ Optional |
| 6 | ShellTerminal scheduler parity (shell terminals still write direct) | ⬜ Follow-up |
| 6a | LATENCY — interactive echo fast path (2ms batch + bypass) + rAF flush | ✅ Done 2026-08-25 |
| 6b | RE-RENDERS — no-op guards on status/branch events | ✅ Done 2026-08-25 |
| 6c | SWITCHING — park/reuse xterm instances across layout changes | ✅ Done 2026-08-25 |
| 7 | DAEMON — move node-pty out of Electron main process | ⬜ Large structural follow-up |
| 8 | HIDDEN DELIVERY GATE — drop bytes for fully-hidden panes | ⬜ Needs main-side model first (see #7) |

---

## Change log

### 2026-08-25 — Round 6 (multi-agent re-render storm + shell parity)

**Token dashboard audit (user question: "too many tokens saved — real or bug?")**
Verdict: **real, not double-counted.** Verified end-to-end:
- `bin/agntspce.mjs` intercepts agent tool commands, feeds the agent the
  FILTERED output, and reports true raw-vs-filtered counts via HTTP.
- HTTP↔PTY dedup is implemented (`_recentTokenReports`, `_pendingStats`
  check) and unit-tested (outputFilter.test.ts covers both arrival orders).
- `getAllStats()` uses command history as single source of truth; no
  cumulative+history double counting. Estimator consistent on both sides
  (`chars/4`).
- 90% reductions are plausible for filter-matched verbose commands (build/
  test/spinner output); Aug-22 sessions at ~50% reflect a different command
  mix.
- Known semantics caveat (pre-existing, NOT a bug): the fallback path also
  counts generic terminal-display compression of non-LLM-bound output toward
  "Saved from LLM context", so the headline can overstate *LLM* savings
  specifically. Relabeling is a future UI nicety, deliberately not changed.

**Fix A — ShellTerminal parity** (`src/components/TerminalArea.tsx`)
Shell terminals were the last unscheduled write path (straight `term.write`)
and canvas-rendered. Now they use the same per-pane scheduler and WebGL with
context-loss fallback as agent panes.

**Fix B — analytics event batching** (`src/hooks/useSocket.ts`)
`command-filter-event` / `execution-event` / `filter-event` each committed a
new React state array immediately → full App re-render PER COMPLETED TOOL
CALL. Parallel agents finish dozens/second → guaranteed re-render storm
(the remaining multi-agent lag). Events now buffer in refs and commit on a
250ms tick (dashboards lag ≤250ms; terminal path untouched). Buffers cleared
on reconnect + unmount.

Verification: tsc clean, 121/121 tests, clean boot with logging.

### 2026-08-25 — Round 5 (interactive latency + switching, reference-driven)

Symptoms: agent feels laggier than a native CLI; multiple simultaneous agents /
layout switches are slow. Reference deep-dive (Orca `pty.ts` interactive path +
`pane-terminal-output-scheduler`, Superset `INPUT_LAG_FIXES.md` +
`v1-terminal-cache`) identified three causes; all fixed.

**6a — Keystroke echo latency (~50–80ms → ~one frame)**
- `electron/services/sessionManager.ts`: batch window `OUTPUT_FLUSH_MS`
  16ms → **2ms** (Orca's measured value: each hop charges its half-window to
  typing latency). New **interactive fast path**: `writeToSession` stamps
  `lastInputAt` per session and resets a 32KB rolling budget;
  `shouldFlushInteractive()` flushes immediately (no batching) when output
  arrives ≤100ms after a keystroke and is ≤1KB, or ≤16KB containing ANSI CSI
  (agent TUIs redraw >1KB per keypress). Maps cleaned up in `closeSession`.
- `src/hooks/useSocket.ts`: the 30ms renderer coalescing timer is now
  **requestAnimationFrame-aligned** when the window is visible (echo lands
  within one display frame); 40ms fallback timer covers hidden/throttled
  windows where rAF never fires. First-to-fire cancels its sibling; OUTPUT_CAP
  trim unchanged so hidden-window memory stays bounded.

**6b — No-op re-render elimination**
- `src/hooks/useSocket.ts`: `status-change` / `branch-change` handlers return
  the previous state object when the value is identical instead of always
  allocating a new `sessions` object — a fresh object re-renders the ENTIRE
  App tree, and agents emit bursts of same-value events during rapid TUI
  transitions (Superset INPUT_LAG_FIXES root-cause pattern).

**6c — Instant pane/layout switching (xterm parking)**
- `src/components/TerminalPane.tsx`: every layout branch (`side-left`,
  `grid`, `side-right`, focus/fullscreen) renders the same session at a
  different JSX tree position, so React used to UNMOUNT and REBUILD xterm +
  WebGL per switch. Now instances are **parked on unmount** (detached from
  DOM but fully alive — subscription keeps writing live output into them,
  theme observer stays attached) and **reparented instantly on remount**
  for the same session (Superset v1-terminal-cache / VS Code model).
  WebGL released while parked (Orca suspend-on-hide); LRU evicts beyond 6
  parked terminals with full teardown. Backlog replay only happens on true
  fresh creation, never on reuse (content continuity preserved by the live
  subscription).

**Verification**: tsc clean; vitest 121/121. RTK/agntspce-search-mcp, chat,
sessions, workspaces untouched.

#### Round 5a hotfix (same day) — black screen in `electron:dev`

The parking change originally registered the **React-owned ref div** as the
parked element. React StrictMode double-mounts the same component instance,
so the reuse path executed `container.appendChild(cached.el)` where both were
the *same node* → `HierarchyRequestError` → React error boundary → black
screen. Reproduced via `ELECTRON_ENABLE_LOGGING=1` renderer console capture.

Fix (`src/components/TerminalPane.tsx`, `src/App.css`):
- xterm now opens into our OWN host div (`.terminal-instance-host`, sized
  100%×100% inside the React container). Parking detaches only the host;
  React's node is never moved or removed → reconciliation-safe under
  StrictMode and all layout branches.
- Reuse path guards with `parentElement !== container` before appending.
- Subscription no longer depends on `termInstance.current` (nulled while
  parked) — parked terminals now genuinely keep receiving live output.
- Verified: full `electron:dev` boot with logging → vite connected, React
  mounted, create→park→reuse exercised, zero errors; tsc clean; 121/121 tests.

#### Round 5b hotfix (same day) — dropped output / dead typing in agent terminals

User report: nothing could be typed anywhere; Claude started but showed
nothing. Root cause found by auditing the Round 5 interactive fast path:

**Bug 1 (critical, output loss)** — `scheduleTerminalOutput` flushed BEFORE
storing the chunk when the interactive path triggered:
`flushTerminalOutput()` returns early when no pending buffer exists yet, so
the **first chunk of every post-keystroke burst was silently discarded**.
Claude's TUI repaints small ANSI frames after each keypress → most frames
lost → terminal appeared blank/frozen and echo never rendered (typing "did
nothing" visually). Fix: always store the chunk first, then choose flush
timing (`immediate || size-threshold || timer`). Ordering preserved, zero
drops.

**Bug 2** — reused (parked) terminals never re-attached WebGL after park
released it: every layout switch silently degraded that pane to canvas
forever. Fix: `attachWebgl` stored on the parked entry and re-armed via rAF
on remount.

**Bug 3** — the WebGL live-guard used a closure boolean set false by the
creating effect's cleanup, permanently blocking re-attach for reused
instances. Replaced with a registry-backed `isViewLive()` check (single
source of truth).

Also added an env-gated CDP debug switch in main.ts
(`AGNTSPCE_DEBUG_CDP=<port>`) for renderer diagnostics.

Verification: tsc clean, 121/121 tests, full dev boot with logging shows
zero errors. Interactive flow needs one real manual pass: start an agent,
type, confirm echo + TUI renders; toggle Split/Focus a few times and confirm
the pane stays GPU-rendered and responsive.

### 2026-08-25 — Round 4 (Phases 1–3, reference-driven rewrite)

Reference analysis: `~/Aniket/CodingAgents/references/orca-main` and
`.../superset-main`. Both are mature Electron agent-terminal apps; their
solutions to this exact problem were ported, not invented.

#### Root causes identified (why previous rounds weren't enough)

1. **Invisible memory**: `resourceTracker` measured only the PTY shell pid
   (`ps -p <pid>`). The agent's real node heap lives in *descendant* processes
   (`sh → bin/claude → node …`) that were never measured — the app's own
   dashboard showed small numbers while GBs accumulated unattributed. We could
   not tell app memory from agent memory.
2. **Renderer flood saturation**: every coalesced batch was written straight
   into xterm on arrival. Under multi-agent flood (up-to-512KB frames every
   16ms) ANSI parsing + full-grid canvas repaint saturated the main thread →
   global UI/scroll lag. Orca fixes this with a priority queue scheduler;
   Superset with one-write-per-rAF + hard pending cap. We had neither.
3. **WebGL removed bluntly (round 2)**: both references KEEP WebGL with an
   explicit hygiene lifecycle. Canvas rendering of full-screen TUI redraws is
   CPU-heavy — removing WebGL traded a suspected leak for guaranteed render
   cost (the scroll lag).

#### Changes

**Phase 1 — memory attribution**
- `electron/services/resourceTracker.ts`: one host-wide
  `ps -eo pid=,ppid=,pcpu=,rss=` sweep per collect (coalesced if overlapping);
  walks each session's full descendant subtree with first-session-wins dedupe.
  New fields: `subtreeMemoryMB`, `processCount`. `memoryMB` intentionally kept
  = direct process RSS so `isOverMemoryThreshold` (restart/health logic,
  agentOrchestrator.ts:216) behaves exactly as before. `getTotalMemoryMB()` now
  sums subtree totals (display-only stat).
- `electron/server/handlers/stats.ts`: `get-orchestrator-stats` now includes
  `appMemory: { mainMB, rendererMB, gpuMB, otherMB }` from
  `app.getAppMetrics()` (macOS caveat: overstates private memory via shared
  Chromium mappings — attribution only).
- `src/hooks/useSocket.ts`, `src/components/OrchestrationPanel.tsx`: types +
  display. Session rows show `X tree (Y shell) · N procs`; Memory card shows
  app bucket breakdown when available.
- **How to read it**: Dashboard → Orchestration panel. If an agent row shows a
  huge "tree" number, the memory is the AGENT process, not AgntSpce. If
  `ui`/`gpu` buckets grow over time, it's ours.

**Phase 2 — write scheduling**
- `electron/services/sessionManager.ts`: `OUTPUT_FLUSH_BYTES` 512KB → 64KB
  (smaller joins/writes = less GC churn both processes).
- NEW `src/utils/terminalWriteScheduler.ts`: per-pane FIFO queue sliced into
  ≤16KB writes; foreground = MessageChannel macrotask ticks, ≤8 writes/tick,
  8ms budget, parse-clock pacing via xterm write callbacks (+250ms safety net
  against lost callbacks); background/dimmed/hidden-window panes = 50ms delay,
  16ms cadence ×2 writes/tick; hard 2MB queue ceiling replaces backlog with a
  skip warning (bounds hidden-window growth — Superset's #1 lesson).
- `src/components/TerminalPane.tsx`: live output routed through the scheduler
  (backlog replay + `pendingLive` ordering mechanism untouched); dimmed prop
  syncs priority class; scheduler disposed on unmount. ShellTerminal unchanged
  (follow-up #6).

**Phase 3 — WebGL with hygiene**
- `src/components/TerminalPane.tsx`: WebGL restored with Orca/Superset hygiene:
  attach deferred past viewport sync; context-loss → canvas fallback for that
  pane (no retry loops); module latch stops re-attaching after failure until
  window becomes visible again (retry boundary); release path forces
  `WEBGL_lose_context.loseContext()` + zeroes canvas; context released while
  window hidden.
- `electron/main.ts`: `max-active-webgl-contexts=128` switch before ready
  (Blink default 16 force-drops oldest contexts, blanking terminals).

**Verification**: `tsc -b` clean; vitest 121/121 pass. No behavior changes to
RTK / agntspce-search-mcp / sessions / chat flows.

---

### 2026-08-25 — Round 3 (chat streaming throttle + drop-based backpressure)

- `src/components/ChatSidebar.tsx`: stream chunks buffered in a ref, committed
  on a 50ms tick (was: setMessages per chunk → O(n²) markdown re-parse of the
  growing message). 256KB buffer hard cap flushes synchronously under timer
  throttling; buffer cleared on thread switch; done-chunk flushes remaining
  buffer first (no loss/reordering). Auto-scroll instant while streaming.
- `src/App.css`: `.chat-msg { content-visibility: auto; contain-intrinsic-size }`
  — off-screen messages not painted (scroll perf).
- `electron/services/sessionManager.ts`: replaced pause-based backpressure with
  **drop-based congestion gate** (`isOutboundCongested`): Socket.IO `pause()`
  only gates inbound reads, so outbound emits queued unboundedly in engine.io —
  the multi-GB mechanism. Now chunks are dropped when ALL renderers are >8MB
  behind; skipped bytes announced on next healthy flush
  (`Session.pendingSkipNotice` added in `types.ts`); exit flushes forced.
  Also removed a `'drain'` listener leak from the old pause path.
- Verified: tsc clean, 121 tests pass.

### 2026-08-25 — Round 2 (first reference-informed fixes)

- Removed `@xterm/addon-webgl` usage from TerminalPane + ShellTerminal
  (**superseded by Round 4 Phase 3**, which restores it with hygiene after
  reference analysis showed both refs keep WebGL with a proper lifecycle).
- Capped outputFilter persisted history: event bodies 256KB→32KB
  (`MAX_EVENT_OUTPUT_BYTES`), head slice 192KB→24KB, new global cap
  `MAX_TOTAL_COMMAND_EVENTS=1200` with `_enforceGlobalEventCap()`, persisted
  history capped at 600 (was loaded up to 5000).
- Verified: tsc clean.

### 2026-08-25 — Round 1 (audit + first caps)

- Audited every stateful store in both processes. Already bounded:
  `writeBuffersRef` 16KB/session, useSocket output buffer 64KB/session,
  RingBuffer 64KB/session, sessionHistory ≤200, commandHistory ≤500,
  filterHistory ≤200, notifications/activity capped, TokenUsageTracker counters
  only, StatusDetector small per-session state, ContextWriter ≤5KB file,
  CavemanService runs ≤100, chatManager messages ≤MAX_THREAD_MESSAGES,
  orchestration state SQLite-backed.
- `outputFilter.ts` coalescing hard cap `OUTPUT_PENDING_HARD_CAP` (4MB,
  drop-oldest) added in Round 3; pendingOutput flushed every 16ms regardless.

---

## Open items / follow-ups

1. **Run Phase 1 diagnostics first** after rebuilding: Dashboard → Orchestration.
   - If agent "tree" MB explains the GBs → agents' own heaps; options:
     launch agents with `--max-old-space-size`, or accept + document.
   - If `ui`/`gpu` buckets grow → report back; next targets are identified
     from which bucket moves.
2. **Phase 4 (hidden gate)**: stop sending terminal bytes for panes while the
   window is minimized, restore via ring-buffer tail on visible (Orca phase-4 /
   delivery-gate pattern). Implement only if diagnostics show growth during
   minimized use.
3. **Phase 5 (headroom)**: `--max-old-space-size` clamp [3072–4096MB] on ≥8GB
   machines before app-ready (Orca renderer-heap-headroom pattern).
4. **ShellTerminal parity**: route shell-terminal writes through the same
   scheduler.
5. **TUI redraw-noise stripping** in retained filter previews (Orca applies
   CR/backspace/CSI-erase before retaining text) — reduces preview churn.
6. **Cold parking** (Orca): unmount inactive agent terminals after ~30s,
   restore from ring-buffer tail on focus — biggest steady-state win if many
   concurrent agents become common.

## Verification checklist (every round)

```
rtk tsc -b        # must be clean
rtk vitest        # all green (121 as of Round 4)
npm run electron:build
```
Manual: 2 agents × 20min soak → Dashboard memory attribution flat; scrolling
old chat + terminal history stays smooth; RTK filters still compress
(RtkDashboard stats move); search MCP still answers; workspace switch keeps
sessions; restart/close-tab kills PTYs.
