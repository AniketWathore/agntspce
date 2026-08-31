# ROADMAP — AgntSpce Hardening & Orca Parity

Fresh plan after 2026-08-30 — ordered from **most important → less important**. Only this file is the source of truth. Previous history removed to keep it actionable.

**Ground rules (user-mandated, never break):**
- Never break working features — RTK / `agntspce-search-mcp`, agent sessions, workspaces, chat, bottom shell.
- RAM flat no matter how long the app runs.
- No lag when scrolling old terminal/chat history.
- No flashing/black-bar when stretching agent windows.

---

## Status board — priority order

| # | Phase | Goal | Status | Effort |
|---|-------|------|--------|--------|
| 1 | **AGENT WINDOWS — Orca flex-tree** | Replace `grid` tiling with Orca `pane-manager` nested `flex` so 2/3/4/5+ stretch without shared-line flash | ⬜ Next — spec below | 1.5d |
| 2 | `safeFit` + `stableFit` hardening | Skip redundant `FitAddon.clear()` blink + scrollbar wobble guard | ⬜ After #1 | 0.5d |
| 3 | PTY hold (defer `SIGWINCH`) | Shell prompts don't vibrate during drag | ⬜ After #1 | 0.5d |
| 4 | ShellTerminal scheduler parity | Shell terminals use same `terminalWriteScheduler` + WebGL hygiene as agent panes | ⬜ Follow-up | 0.5d |
| 5 | Hidden gate (minimized window) | Main-side: drop `terminal-output` for hidden panes, replay `RingBuffer` tail on visible | ⬜ After diagnostics | 1d |
| 6 | Hidden delivery gate | Drop bytes for fully-hidden panes (needs #5) | ⬜ After #5 | 0.5d |
| 7 | Headroom clamp | `--max-old-space-size 3072-4096` on ≥8GB before `app.ready` | ⬜ Optional | 0.25d |
| 8 | Daemon `node-pty` | Move `node-pty` out of Electron main to separate process | ⬜ Large | 2d |
| 9 | TUI noise stripping | Strip `CR`/`BS`/`CSI-erase` before retaining filter previews | ⬜ Nice | 0.5d |
| 10 | Cold parking | Unmount inactive panes after ~30s, restore from `RingBuffer` tail | ⬜ Nice | 1d |
| 11 | Chat streaming polish | Already throttled 50ms + `content-visibility` — keep | ✅ Done | — |
| 12 | Memory attribution (SEE) | `subtreeMemoryMB` + `appMemory` buckets in Orchestration panel | ✅ Done | — |

---

## Phase 1 — Agent windows: Orca flex-tree (most important)

**Why:** Current `TerminalArea.tsx:78` `gridDefForCount`/`getTilingStyle` `fr` + direct `gridTemplateColumns` `px` during drag shares `row`/`col` lines. `2` works as `flex`, but `3` master-stack (`left full-height` + `right 2 rows`) and `4` `2×2` have **shared** `row`/`col` → dragging `2↔4` horizontal moves `1↔3` too (whole line). `will-change` + `FitAddon.clear()` per `px` = flash / black bar. User repro: `2` only green line moves, `3` whole line, `4` whole row/col.

**Orca reference:** `references/orca-main/src/renderer/src/lib/pane-manager/` (`pane-manager.ts`, `pane-tree-ops.ts:74` `safeFit`, `pane-divider-drag.ts:18` `createDividerFlexFrameScheduler`, `pane-pty-resize-hold.ts:88`, `pane-fit-resize-observer.ts:85` stable fit), `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx:146` `SplitNode` `flex:${ratio} 1 0%`.

**Do (keep `RTK`/`mcp`/workspaces untouched — only `src/components/TerminalArea*` + `App.css`):**

1. **Layout state:** `paneSizes: Record<sessionId, number>` `fr` → `layoutTree: TabGroupLayoutNode` `{leaf groupId} | {split direction:'horizontal'|'vertical', ratio:0.5, first, second}` per worktree. Derive initial tree from `filteredSessions.length` (`2: H 0.5`, `3: H 0.5 (A, V 0.5 B/C)`, `4: H 0.5 (V A/C, V B/D)`, `5: H 0.33 (A, V B/C, V D/E)` etc.), persist to `ENABLEA` JSON (migrate old `paneSizes` to `0.5` splits).
2. **Render:** Replace `terminal-area` `grid` + `tilingStyle` + `getItemStyle` + per-pane `pane-resize-handle` absolute with recursive `FlexSplitNode` + `ResizeHandle` (`pointerCapture`, `MIN_RATIO 0.15–0.85`, `rAF` 1 `flex` write/frame). Handles are `flex-shrink:0` `4px` `::after` `var(--accent)` — not per-pane absolute.
3. **Drag:** `pointerdown` → `holdPtyResizesForPaneSubtrees([prevEl,nextEl])`, `pointermove` → `ratio = (clientX-left)/width` clamped → `setFlexTreeRatio(nodePath, ratio)` (Zustand) → `flex: ratio` / `1-ratio`. `pointerup` `flush()` + `refitPanesUnder(prevEl/nextEl)` + `onLayoutChanged`.
4. **Fit:** Keep `TerminalPane` parking/host reparent, add `safeFit` (`proposeDimensions()===cols/rows → skip`, `MIN 48px/8cols`) + `requestStablePaneFit` (2 `rAF` stable) + `hold` deferred `SIGWINCH` (only final `cols/rows` `onResize`).

**Not in this phase:** `pane-manager` `wrapInSplit` drag-to-split, `TabGroupPanel` `anchor-name` overlays — keep current `+Agent` `AgentPicker` creation.

**Verify:** `npx tsc -b` `npm run build` clean, `2` flex side-by-side, `3` left `50%` + right `25%` rows, `4` `2×2` `25%` with independent right horiz (`2↔4` not `1↔3`), vertical `left vs right` shared, no flash/black, no snap-back (`functional setPaneSizes`).

---

## Phase 2 — `safeFit` + `stableFit` hardening

* Extract `src/utils/safeFit.ts` (`getProposedDimensions`, `canMeasurePaneForFit` `48px/8cols/4rows`) used by `ResizeObserver` + post-drag + `doFit`.
* Add `src/utils/stableFit.ts` `requestStablePaneFit` (Orca `pane-fit-resize-observer.ts:85` — wait stable `proposeDimensions` 2 `rAF` or `MAX 8`, `hasVisibleFitGeometry` guard) for `attachPaneFitResizeObserver` and `pty-connection` drift check.
* Keep `is-dragging` `width:100% !important` stretch for `xterm` viewport during drag (already added).

**Verify:** Drag within same cell → no `fit()` → no blink; Windows scrollbar wobble → no `SIGWINCH` loop.

---

## Phase 3 — PTY hold

* `src/utils/panePtyResizeHold.ts` `WeakMap<HTMLElement,{depth,pending}>` `holdPtyResizesForPaneSubtrees` → `begin`/`queuePanePtyResizeIfHeld`/`flush` `CustomEvent` `pane-pty-resize-hold-flush`.
* `TerminalPane:term.onResize` → `if (queueIfHeld(el,cols,rows)) return` else `onResize`; listener on `paneEl` flushes final `cols/rows`.
* `TerminalArea:handleResizeStart` `hold=holdPtyResizesForPaneSubtrees([prevEl,nextEl])`, `handleResizeEnd` `hold.flush()` on commit, `hold.cancel()` on `pointercancel`/`blur`/hold-without-move.

**Verify:** Shell prompt (Codex) doesn't vibrate during drag, only one `resize` on `mouseup`.

---

## Phase 4 — ShellTerminal scheduler parity

* `TerminalArea:ShellTerminal` currently direct `term.write` + `WebGL` no `terminalWriteScheduler`. Route through `createTerminalWriteScheduler(term, !dimmed)` like `TerminalPane`, `dimmed` sync, `fit` via `safeFit`.

**Verify:** `2` shells + `2` agents flood → no main-thread saturation.

---

## Phase 5 — Hidden gate (minimized window)

* Main: `BrowserWindow.on('minimize')` → `sessionManager` `pauseTerminalOutput` for panes where `!isVisible && !measurableBackground && !portal`. `RingBuffer` 64KB tail kept, replay on `restore`/`focus`.
* Renderer: `document.hidden` already releases `WebGL` — extend to `suspendPaneRendering`.

**Verify:** Minimize 10min with 4 agents → `ui`/`gpu` flat in Orchestration panel.

---

## Phase 6 — Hidden delivery gate

* Drop `pty` bytes entirely for fully-hidden panes (needs #5 `isVisible` plumbing). On visible, replay `RingBuffer` tail + `pendingLive` queue.

---

## Phase 7 — Headroom clamp

* `electron/main.ts` before `app.ready` → `app.commandLine.appendSwitch('js-flags','--max-old-space-size=4096')` on `totalMem >=8GB` (Orca `renderer-heap-headroom`).

---

## Phase 8 — Daemon `node-pty`

* Move `node-pty` to `child_process.fork` `pty-daemon.ts` + `ipc` `spawn`/`write`/`resize`/`kill`, `resourceTracker` `ps` on daemon pids. Large, needs `sessionManager`/`agentOrchestrator`/`resourceTracker` + `native` `spawn-helper` handling.

---

## Phase 9 — TUI noise stripping

* `OutputFilterService` before retaining preview: apply `CR`/`BS`/`CSI K`/`CSI ?25l` stripping (Orca `tui-redraw-noise`).

---

## Phase 10 — Cold parking

* `selectColdParkedTerminalWorktrees` `hiddenSinceMs` `>30s` → `suspendPaneRendering` + `disposeWebgl` + `unsubscribe` `onTerminalOutput`, keep `RingBuffer` + `pty` alive, remount `safeFit` + `attachWebgl` double-`rAF`.

---

## Verification checklist (every phase)

```
npx tsc -b        # must be clean
npm run build     # vite + electron-builder copy prebuilds
manual: 2/3/4 agents stretch → no flash/black, independent dividers, no snap-back
       bottomShell hscroll 6+ still 50% + scroll
       chat/stream 50ms + terminal scheduler still smooth
       RTK RtkDashboard + mcp search still answer
```

## Ground rules reminder

- Touch only `TerminalArea`/`TerminalPane`/`App.css`/`src/utils/pane-*` for Phase 1-3 — never `rtk/*`, `mcp`, `workspaceManager`, `chat`.
- Keep `paneSizes` migration or reset to `0.5` — no workspace data loss.
- Branch, no push to `main` until manual `electron:dev` pass.
