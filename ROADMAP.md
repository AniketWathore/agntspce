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

---

## Change log

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
