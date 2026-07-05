# AgntSpce — Feature Roadmap from Superset

> Based on comprehensive analysis of Superset (a production Electron + React + tRPC + Bun monorepo).  
> Features are organized by priority tier. Excluded: mobile app, organization/team/multi-tenant, marketing site, CLI tool, web app (desktop-only focus).

## Legend
- ✅ **Already have** (in AgntSpce now)
- 🟡 **Partial** (skeleton exists, needs expansion)
- 🔴 **Not yet** (need to build)

---

## Tier 1 — Core Infrastructure (High Priority)

### 1A. Agent Wrapper System
*Superset wraps 11 external agents with lifecycle hooks. You have 4 agents with basic config.*

| Feature | Status | Description |
|---------|--------|-------------|
| Agent wrapper abstraction | 🟡 | `agentManager.ts` has config but no lifecycle hook injection |
| Agent wrapper — Claude Code | ✅ | Configured with modes + flags |
| Agent wrapper — OpenCode | ✅ | Configured with modes |
| Agent wrapper — Codex CLI | ✅ | Configured with modes + flags + model/reasoning/verbosity |
| Agent wrapper — Gemini CLI | ✅ | Configured with modes + models |
| Agent wrapper — Cursor Agent | ✅ | Configured with modes, flags, models |
| Agent wrapper — GitHub Copilot | ✅ | Configured with explain/suggest modes |
| Agent wrapper — Mastra Code | ✅ | Configured with agent mode + model |
| Agent wrapper — Droid | ✅ | Configured with review/plan modes |
| Agent wrapper — Amp Code | ✅ | Configured with continue mode |
| Agent wrapper — Pi | ✅ | Configured with chat/review modes |
| Agent lifecycle hooks | 🔴 | Inject notify-scripts so agents report start/stop/error to Superset |
| Binary resolver | 🔴 | `buildRealBinaryResolver()` — detect agent binary path per-platform |
| Hook reconciliation | 🔴 | `reconcileManagedEntries()` — merge Superset hooks with user's existing hooks |
| Agent preset router | 🔴 | Settings UI for creating/editing custom agent presets with custom commands |

### 1B. Session Orchestrator
*Superset has a dedicated orchestrator with queue, idempotency, and dual adapters.*

| Feature | Status | Description |
|---------|--------|-------------|
| Agent session launch | 🟡 | `startAgent` exists but basic — no queue or idempotency |
| Session queue | 🔴 | `queueAgentSessionLaunch()` — sequential dispatch to avoid conflicts |
| Idempotency key | 🔴 | `buildIdempotencyKey()` — deduplicate identical launches |
| Launch adapters (chat vs terminal) | 🔴 | `selectAgentLaunchAdapter()` — different launch paths per agent type |
| Tab adapter system | 🔴 | `AgentLaunchTabsAdapter` — how agent sessions appear in the UI |

### 1C. Session Recovery & Persistence
*Critical for reliability — survive app restarts.*

| Feature | Status | Description |
|---------|--------|-------------|
| Session recovery persistence | 🔴 | Save/restore session state (CWD, running agents, context) across restarts |
| Undelivered output replay | 🔴 | Backlog mechanism on socket reconnect — replay missed output |
| Session heartbeat | 🔴 | Keep-alive to detect stale sessions |
| Automatic reconnect | 🟡 | Socket.io reconnection exists but no replay/backlog handling |
| Per-workspace session state | 🔴 | Preserve sessions per workspace, restore when switching back |

### 1D. Terminal Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| PTY terminal sessions | ✅ | `node-pty` + xterm.js |
| Shell-ready detection | 🔴 | Detect when shell/agent is ready for input (vs still booting) |
| Terminal resize handling | ✅ | `sendTerminalResize` exists |
| Terminal presets | 🔴 | Pre-configured terminal setups (font, colors, shell type, CWD) |
| Terminal settings | 🔴 | Scrollback lines, link behavior, font size/family configuration |
| Terminal CWD in workspace path | ✅ | Starts in workspace repo path |

---

## Tier 2 — Workspace & Git (High Priority)

### 2A. Git Worktree Isolation

| Feature | Status | Description |
|---------|--------|-------------|
| Git worktree support | 🟡 | `worktreeHelper.ts` exists but not fully wired |
| Git operations (status/diff/commit/branch/push/pull) | 🔴 | No tRPC router for git — agent Manager manages worktrees manually |
| Diff viewer | 🔴 | Syntax-highlighted split/unified diff for reviewing agent changes |
| Branch management | 🔴 | Branch prefix config, PR checkout, branch name suggestions |
| Git credential providers | 🔴 | Cloud-stored or local SSH keys with GUI prompt |
| Git task worker | 🔴 | Background thread for git ops to avoid blocking UI |
| Git watcher | 🔴 | Watch filesystem for git changes and emit events |
| Worktree conflict detection | 🔴 | Detect branch conflicts between worktrees |
| File sync across worktrees | 🔴 | Sync specific files across worktrees |

### 2B. Workspace Management

| Feature | Status | Description |
|---------|--------|-------------|
| Workspace CRUD | ✅ | Create/read/update/delete with `workspaceManager.ts` |
| Workspace sidebar | ✅ | Left panel with workspace list |
| Workspace switching | ✅ | Switch active workspace, preserve sessions |
| Workspace creation from Git URL | 🔴 | Clone repo + bootstrap worktrees in one step |
| Workspace suggestions | 🔴 | Auto-suggest from recent git activity / directory scan |
| Workspace export/import | 🟡 | Menu actions exist (`exportWorkspace`, `importWorkspace`) but basic |
| Workspace archive/restore (soft delete) | ✅ | `restoreWorkspace`, `permanentDeleteWorkspace` |
| Setup/teardown scripts | 🔴 | Run `.superset/setup.sh` on creation, `teardown.sh` on deletion |
| Workspace environment variables | 🔴 | Per-workspace env vars injected into terminals |

---

## Tier 3 — Projects, Tasks & Automations (Medium Priority)

### 3A. Project Management

| Feature | Status | Description |
|---------|--------|-------------|
| Project CRUD | 🔴 | Create/read/update/delete projects (repositories) |
| Project dashboard | 🔴 | Per-project view with workspaces, settings, activity |
| Project settings | 🔴 | Configure project metadata, icon, description |
| Template gallery | 🔴 | Starter templates (Next.js, Hono, T3, React Native, etc.) |

### 3B. Task Management

| Feature | Status | Description |
|---------|--------|-------------|
| Task CRUD | 🔴 | Full task lifecycle with title, description, priority, status, assignee |
| Task status workflow | 🔴 | Customizable statuses (backlog, todo, working, in review, done) |
| Task labels | 🔴 | Color-coded labels per task |
| Task-PR linking | 🔴 | Link tasks to pull requests |
| Task dependency graph | 🔴 | DAG of task dependencies |
| Task board (Kanban) | 🔴 | Drag-drop columns: Backlog → Active → Review → Done |
| Batch agent launch from tasks | 🔴 | Launch multiple agent sessions from task queue |

### 3C. Pull Requests

| Feature | Status | Description |
|---------|--------|-------------|
| PR listing & status | 🔴 | List open PRs with status (CI checks, mergeable state) |
| PR checkout | 🔴 | Create workspace from a PR's branch |
| PR management | 🔴 | Create, review, merge PRs from within the app |
| PR review automation | 🔴 | Auto-spawn reviewer agents on new PRs |
| PR merge automation | 🔴 | Auto-merge approved PRs based on policies |

### 3D. Automations (Scheduled Agents)

| Feature | Status | Description |
|---------|--------|-------------|
| Automation CRUD | 🔴 | Scheduled recurring agent executions (CRON / RRULE) |
| Automation templates | 🔴 | Pre-built automation templates |
| Automation prompt versioning | 🔴 | Version history with diff tracking and restore |
| Automation run history | 🔴 | Execution logs with status, timing, session info |
| Automation dispatch engine | 🔴 | Backend service that evaluates schedules and dispatches agents |

---

## Tier 4 — File System & Editor (Medium Priority)

### 4A. File System Integration

| Feature | Status | Description |
|---------|--------|-------------|
| File explorer | 🔴 | Browse workspace files in sidebar (tree view) |
| File read/write operations | 🔴 | CRUD files within workspace boundaries |
| File search | 🔴 | Full-text search across workspace files (ripgrep-based) |
| File watching | 🔴 | Watch filesystem for changes (chokidar) |
| Config file preview | 🔴 | Inline preview of config files with syntax highlighting |

### 4B. Diff & Editor Features

| Feature | Status | Description |
|---------|--------|-------------|
| Diff viewer (split) | 🔴 | Side-by-side diff with syntax highlighting |
| Diff viewer (unified) | 🔴 | Unified diff view |
| Diff section ordering | 🔴 | Collapse/expand, reorder diff sections |
| Diff inline comments | 🔴 | Comment on specific lines in diffs |

---

## Tier 5 — User Interface (Medium Priority)

### 5A. Tab & Layout Management

| Feature | Status | Description |
|---------|--------|-------------|
| Agent terminal tabs | ✅ | Multiple agent terminals in center grid |
| Shell terminal panel | ✅ | Right sidebar for shell terminals |
| Tab close | ✅ | Close individual tabs |
| Tab keyboard shortcuts (Cmd+W/Tab/1-9) | ✅ | Tab cycling and close |
| Tab drag reorder | 🔴 | Drag to reorder agent tabs |
| Browser-like tab bar | 🔴 | Horizontal tab bar at top (not grid) with close buttons |
| View presets / grid layouts | 🟡 | `layoutPreset` state exists but limited (`auto` only) |
| Focus overlay | 🟡 | `focusMode` exists but no visual dimming of inactive terminals |
| Split pane resizing | ✅ | Left/right resizer with drag handles |

### 5B. Command Palette & Hotkeys

| Feature | Status | Description |
|---------|--------|-------------|
| Command palette (Cmd+K) | 🔴 | VS Code-style quick-action search |
| Customizable hotkey system | 🔴 | User-configurable keyboard shortcuts |
| Hotkey display | 🔴 | Show registered hotkeys in settings |
| Hotkey conflicts detection | 🔴 | Detect and warn on overlapping bindings |

### 5C. Theme System

| Feature | Status | Description |
|---------|--------|-------------|
| Dark/light theme toggle | ✅ | Theme switcher in settings |
| Theme persistence | ✅ | Saved to localStorage |
| Custom theme colors | 🔴 | User-defined color schemes |
| Theme presets | 🔴 | Multiple built-in themes beyond dark/light |
| Syntax highlighting themes | 🔴 | Configurable editor/terminal color schemes |

---

## Tier 6 — Integrations (Medium Priority)

### 6A. GitHub Integration

| Feature | Status | Description |
|---------|--------|-------------|
| GitHub OAuth login | 🔴 | Sign in with GitHub |
| GitHub repo browser | 🔴 | Browse and select repos for workspace creation |
| GitHub App installation | 🔴 | Webhook-based sync (PR events, push) |
| GitHub PR integration | 🔴 | Link workspaces to PRs, checkout PR branches |
| GitHub issue tracking | 🔴 | Create/link issues from tasks |

### 6B. AI Provider Integration

| Feature | Status | Description |
|---------|--------|-------------|
| Cloud model provider | 🔴 | Proxy API calls to Anthropic/OpenAI/Google through backend |
| Local model provider | 🔴 | Run models locally via Ollama |
| API key management | 🔴 | Store and manage API keys for AI providers |
| Model selector | 🟡 | Agent model picker exists for Codex but not for other agents |

### 6C. Other Integrations

| Feature | Status | Description |
|---------|--------|-------------|
| Linear integration | 🔴 | Issue tracker sync, task linking |
| Slack integration | 🔴 | Messaging, notifications, commands |
| Stripe billing | 🔴 | Subscription management, payment handling |

---

## Tier 7 — Notifications & Activity (Lower Priority)

### 7A. Notification System

| Feature | Status | Description |
|---------|--------|-------------|
| In-app notification bell | 🔴 | Bell icon with unread badge |
| Notification panel | 🔴 | Slide-out panel with sorted notification list |
| OS-native notifications | 🔴 | System notifications for key events (agent done, error) |
| Sound cues | 🔴 | Optional sounds on session complete/error |
| Notification filtering | 🔴 | Quiet/Normal/Aggressive modes |
| Socket-based push notifications | 🔴 | Real-time notifications via socket events |

### 7B. Activity Feed

| Feature | Status | Description |
|---------|--------|-------------|
| Activity feed panel | 🔴 | Chronological event feed (agents, PRs, workspace changes) |
| Event filtering | 🔴 | Filter by type, agent, workspace |
| Live/pause mode | 🔴 | Pause feed, scroll back in history |
| Errors-only mode | 🔴 | Show only error events |
| Event tracking backend | 🔴 | Server-side event storage and querying |

---

## Tier 8 — Settings & Configuration (Lower Priority)

### 8A. Settings Pages

| Feature | Status | Description |
|---------|--------|-------------|
| Theme settings (dark/light) | ✅ | Theme toggle |
| Profile page | ✅ | User profile |
| Agent settings | 🔴 | Enable/disable agents, configure defaults |
| Model settings | 🔴 | Configure which models agents use |
| Terminal settings | 🔴 | Font, scrollback, shell configuration |
| Keyboard shortcut settings | 🔴 | View and customize keyboard shortcuts |
| API keys page | 🔴 | Generate and manage API keys |
| Behavior settings | 🔴 | Auto-start, default file open mode, etc. |
| Appearance settings | 🔴 | Font, layout density, animation preferences |
| Experimental features | 🔴 | Toggle alpha/beta features |

---

## Tier 9 — Chat & AI Interface (Lower Priority)

### 9A. Chat System

| Feature | Status | Description |
|---------|--------|-------------|
| Chat interface | 🔴 | Built-in AI chat panel for workspace conversations |
| Chat session management | 🔴 | Create sessions, send messages, get history |
| Chat attachments | 🔴 | File upload/download in chat |
| Multi-turn conversations | 🔴 | Persistent conversation context |
| Tool execution in chat | 🔴 | Agents can run tools within chat context |

### 9B. AI Elements (UI Components)

| Feature | Status | Description |
|---------|--------|-------------|
| Chain of thought display | 🔴 | Show AI reasoning step-by-step |
| Artifact display | 🔴 | AI-generated code/document display |
| Source citations | 🔴 | Show which files the AI referenced |
| Diff display in chat | 🔴 | Inline file diffs in chat responses |
| Thinking toggle | 🔴 | Show/hide AI thinking process |

---

## Tier 10 — Developer Experience (Lower Priority)

### 10A. Diagnostics & Monitoring

| Feature | Status | Description |
|---------|--------|-------------|
| Daemon supervisor | 🔴 | Background process monitor — restart crashed services |
| Process health check | 🔴 | Liveness/readiness probes for backend services |
| Diagnostics page | 🔴 | Cross-platform environment checks |
| Dependency checks | 🔴 | Check for required CLI tools (gh, git, claude, codex, gemini) |
| Version consistency check | 🔴 | Validate package.json vs Electron build config |

### 10B. Telemetry & UX

| Feature | Status | Description |
|---------|--------|-------------|
| Auto-update mechanism | 🔴 | Check for updates, download and apply |
| Onboarding wizard | 🔴 | First-run guided setup |
| Error boundaries | 🔴 | Graceful error handling for boot failures |
| Update notification | 🔴 | In-app update toast/banner |
| Zoom controls | 🔴 | Pinch-to-zoom with session persistence |

---

## Tier 11 — Supabase/Cloud Backend (Future)

### 11A. Database & Sync

| Feature | Status | Description |
|---------|--------|-------------|
| User accounts | 🔴 | User registration and login |
| Session/auth management | 🔴 | JWT tokens, session validation |
| Real-time sync (Electric SQL) | 🔴 | Live database sync between desktop and cloud |
| Device presence tracking | 🔴 | Track which devices are online |
| Agent command queue (cross-device) | 🔴 | Dispatch agent commands to any connected device |

---

## Summary Table

| Tier | Category | Total Items | Have (✅) | Partial (🟡) | Missing (🔴) |
|------|----------|:-----------:|:---------:|:------------:|:------------:|
| 1 | Agent Wrapper System | 14 | 4 | 2 | 8 |
| 1 | Session Orchestrator | 5 | 0 | 1 | 4 |
| 1 | Session Recovery | 5 | 0 | 1 | 4 |
| 1 | Terminal Enhancements | 5 | 2 | 1 | 2 |
| 2 | Git Worktree | 9 | 0 | 1 | 8 |
| 2 | Workspace Management | 9 | 4 | 1 | 4 |
| 3 | Project Management | 4 | 0 | 0 | 4 |
| 3 | Task Management | 7 | 0 | 0 | 7 |
| 3 | Pull Requests | 5 | 0 | 0 | 5 |
| 3 | Automations | 5 | 0 | 0 | 5 |
| 4 | File System | 5 | 0 | 0 | 5 |
| 4 | Diff & Editor | 4 | 0 | 0 | 4 |
| 5 | Tab & Layout | 9 | 4 | 2 | 3 |
| 5 | Command Palette | 4 | 0 | 0 | 4 |
| 5 | Theme System | 4 | 2 | 0 | 2 |
| 6 | GitHub Integration | 5 | 0 | 0 | 5 |
| 6 | AI Provider | 4 | 0 | 1 | 3 |
| 6 | Other Integrations | 3 | 0 | 0 | 3 |
| 7 | Notifications | 6 | 0 | 0 | 6 |
| 7 | Activity Feed | 5 | 0 | 0 | 5 |
| 8 | Settings Pages | 10 | 2 | 0 | 8 |
| 9 | Chat System | 5 | 0 | 0 | 5 |
| 9 | AI Elements | 5 | 0 | 0 | 5 |
| 10 | Diagnostics | 5 | 0 | 0 | 5 |
| 10 | Telemetry & UX | 5 | 0 | 0 | 5 |
| 11 | Cloud Backend | 5 | 0 | 0 | 5 |
| **TOTAL** | | **146** | **18** | **10** | **118** |

---

## Recommended Implementation Order

### Phase 1 — Reliability (Week 1-2)
1. **Session recovery & backlog replay** — survive restarts, don't lose output
2. **Git worktree isolation** — proper worktree management (the foundation for parallel agents)
3. **Terminal settings** — scrollback, font, behavior config

### Phase 2 — Agent Power (Week 2-4)
4. **Agent wrapper expansion** — add Cursor Agent, Copilot, Mastra, Droid, Amp, Pi wrappers
5. **Agent lifecycle hooks** — inject notify-scripts so agents report start/stop/error
6. **Agent session queue** — sequential dispatch with idempotency
7. **Agent modal enhancements** — model selector, reasoning effort, verbosity, resume ID, presets

### Phase 3 — Workspace & Git (Week 4-6)
8. **Git operations UI** — status, diff, commit, branch management
9. **Diff viewer** — split/unified diff with syntax highlighting
10. **Branch management** — branch prefix config, PR checkout, branch suggestions
11. **Workspace setup/teardown scripts** — run scripts on workspace create/delete

### Phase 4 — Project Management (Week 6-8)
12. **Project CRUD** — create/read/update/delete projects (repositories)
13. **Task management** — full task lifecycle with status workflow
14. **Task board (Kanban)** — drag-drop columns
15. **Basic GitHub integration** — repo browser, PR linking
16. **File explorer** — browse workspace files in sidebar

### Phase 5 — UX Polish (Week 8-10)
17. **Command palette** — Cmd+K quick-action search
18. **Tab drag reorder & view presets** — grid layouts, focus mode
19. **Notification system** — in-app + OS notifications
20. **Activity feed** — chronological event tracking

### Phase 6 — Advanced (Week 10+)
21. **Automations** — scheduled agent executions
22. **Chat interface** — AI chat panel
23. **Settings pages** — agent, model, keyboard, api keys
24. **Integrations** — Linear, Slack, Stripe
25. **Cloud sync** — real-time sync via Electric SQL
