# Remaining Features to Port from `agent-workspace-main`

> This is a comprehensive gap analysis between the original Tauri project at `/Users/prashik/Aniket/CodingAgents/agent-workspace-main` and the Electron port at `/Users/prashik/Aniket/CodingAgents/codingagentsworkspace`. Organised by priority for the next model/agent.

## Legend
- 🟢 **Already ported** (in `codingagentsworkspace`)
- 🟡 **Partially ported** (skeleton exists, missing features)
- 🔴 **Not ported** (missing entirely)

---

## Tier 1 — Core Session & Workspace UX (Highest Priority)

### 1A. Session Recovery & Continuity 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Session recovery persistence | `server/sessionRecoveryService.js` | Save/restore session state (CWD, running agents, conversation context) across app restarts |
| Recovery filtering & pruning | `server/sessionRecoveryService.js` | Filter stale recovery entries, prune old ones |
| Undelivered output replay | `server/sessionManager.js` (backlog) | The `backlog` mechanism exists but frontend never requests it on reconnect. Need to emit backlog on socket `connect` |
| Session heartbeat | Socket event `session-heartbeat` | Keep-alive mechanism to detect stale sessions |

### 1B. Workspace Enhancement 🟡
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Workspace export/import | `/api/workspaces/:id/export`, `/api/workspaces/import` | Download workspace config as JSON, upload to restore |
| Workspace archive/restore | `/api/workspaces/:id` DELETE (archives), `/api/workspaces/deleted/:id/restore` | Soft-delete workspaces, archived list view, restore |
| Workspace suggestions | `server/workspaceSuggestionService.js`, `/api/workspaces/suggestions` | Auto-suggest workspaces from recent git activity/directory scan |
| Mixed-repo workspace support | `server/workspaceTypes.js`, `server/workspaceSchemas.js` | Combine multiple repos under one workspace, cascaded config merging |
| Workspace wizard | `client/workspace-wizard.js` | Step-by-step creation: scan directories, pick repos, choose single/mixed |
| Workspace switch with recovery | `server/sessionManager.js` | Preserve sessions per workspace, restore when switching back |

### 1C. Tab/Grid Management 🟡
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Browser-like tab bar | `client/workspace-tab-manager.js` | Horizontal tabs for each session, close buttons, drag reorder, keyboard shortcuts (Cmd+W, Cmd+Tab, Cmd+1-9) |
| View presets / grid layouts | `client/workspace-tab-manager.js` | 1×1, 2×2, 1+2 (main + side), 3×3 layouts |
| Focus overlay | `client/workspace-tab-manager.js` | Cmd+Shift+F dims inactive terminals, highlights active one |
| Tab state preservation | `client/workspace-tab-manager.js` | Reorder, collapse, restore tabs on workspace switch |

### 1D. Dashboard 🟢→🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Workspace dashboard | `client/dashboard.js` | Overview page showing all workspaces with session counts, recent activity, quick actions |
| Create/delete/restore from dashboard | `client/dashboard.js` | CRUD ops without going to sidebar |
| Quick links (favorites, recent) | `client/quick-links.js`, `server/quickLinksService.js` | Pinned favorites, recently accessed sessions |
| Activity summary | `client/dashboard.js` | Recent events per workspace |

---

## Tier 2 — Agent & Commander System

### 2A. Commander Panel 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Top-Level Commander PTY | `server/commanderService.js`, `client/commander-panel.js` | A dedicated "commander" terminal (Claude/Codex) that can spawn/manage other agent sessions |
| Commander context enrichment | `server/commanderContextService.js` | Auto-inject workspace/worktree context into commander prompts |
| Commander launch buffering | `server/commanderService.js` | Buffer input until commander PTY is ready |
| Commander API endpoints | `/api/commander/*` | Start, stop, restart, input, sessions, send-to-session, execute command |

### 2B. Agent Provider Abstraction 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Agent provider registry | `server/agentProviderService.js` | Abstract interface for listing sessions, building resume plans, fetching transcripts (per provider) |
| Provider API endpoints | `/api/agent-providers/*` | List providers, list sessions, resume plan, resume payload, history search, transcript fetch |
| Claude Code version checking | `server/claudeVersionChecker.js` | Detect installed Claude version, warn on outdated |

### 2C. Conversation Management 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Conversation history browser | `client/conversation-browser.js` | Search, filter, sort conversations |
| Conversation search API | `/api/conversations/search`, `server/conversationService.js` | Full-text search across all agent conversations |
| Conversation autocomplete | `/api/conversations/autocomplete` | Type-ahead suggestions from conversation history |
| Conversation export | `server/conversationExportService.js` | Export conversations as markdown |
| Conversation stats | `/api/conversations/stats` | Aggregate statistics (total, by agent, by workspace, tokens) |
| Intent Haiku summariser | `server/intentHaikuService.js` | Auto-generate <200 char intent summaries for sessions using Anthropic Haiku or heuristic |

### 2D. Agent Modal Enhancements 🟡
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Model selector | `client/agent-modal.js` | Dropdown for available models per agent (e.g., GPT-4 vs GPT-5 for Codex) |
| Reasoning effort slider | `client/agent-modal.js` | Low/medium/high reasoning effort |
| Verbosity selector | `client/agent-modal.js` | Low/medium/high verbosity |
| Quick presets (YOLO/Safe/Custom) | `client/agent-modal.js` | Single-click preset selection |
| Resume ID input | `client/agent-modal.js` | Specify conversation ID to resume |

---

## Tier 3 — Projects, Tasks & PRs

### 3A. Projects Board 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Kanban board | `client/projects-board.js`, `server/projectBoardService.js` | 6 columns: Archive/Someday/Backlog/Active/Ship Next/Done |
| Drag-drop between columns | `client/projects-board.js` | Move projects between status columns |
| Project metadata | `server/projectMetadataService.js` | Persist project info, tags, descriptions |
| Project taxonomy | `server/projectTypeService.js`, `config/project-types.json` | Categories (website, game, tool, API, library, writing, other), frameworks, templates |
| API endpoints | `/api/projects/board`, `/api/projects/board/move`, `/api/projects/board/patch` | Board CRUD |

### 3B. Task Management 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Task lifecycle | `server/processTaskService.js` | Create, update, watch tasks |
| Task dependency graph | `server/taskDependencyService.js` | DAG of task dependencies |
| Task records | `server/taskRecordService.js` | Tier, risk, pFail, promptRef persistence |
| Batch launch agents from queue | `server/batchLaunchService.js` | Launch multiple agent sessions from task queue |
| Task ticketing | `server/taskTicketingService.js` | Trello/Linear integration |
| Process workflow advisor | `server/processAdvisorService.js` | Recommendations for workflow optimisation |

### 3C. Pull Request & Diff Review 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| PR listing & status | `server/pullRequestService.js`, `/api/webhooks/github` | List open PRs, get status |
| PR merge automation | `server/prMergeAutomationService.js` | Auto-merge approved PRs based on policies |
| PR review automation | `server/prReviewAutomationService.js` | Auto-spawn reviewer agents on new PRs |
| Diff viewer | `diff-viewer/` (complete sub-project) | Syntax-highlighted diff, AI-powered analysis & summary, inline comments |
| Cache system | `diff-viewer/server/cache/` | Diff caching for performance |

---

## Tier 4 — Notifications, Activity & Communication

### 4A. Notification System 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Notification manager | `client/notifications.js` | In-app notification bell icon, count badge, slide-out panel |
| Browser notifications | `client/notifications.js` | OS-native notifications for key events |
| Workflow modes | `client/notifications.js` | Quiet/Normal/Aggressive notification filtering |
| Sound cues | `client/notifications.js` | Optional sound on session complete/error |
| Server notification API | `server/notificationService.js`, `socket.io notification` | Push notifications via socket events |

### 4B. Activity Feed 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Activity feed panel | `client/activity-feed.js` | Chronological event feed (agents, PRs, tests, workspace changes) |
| Event filtering | `client/activity-feed.js` | Filter by type, agent, workspace |
| Pause/play | `client/activity-feed.js` | Pause live feed, scroll back in history |
| Errors-only mode | `client/activity-feed.js` | Show only errors |
| Unseen count | `client/activity-feed.js` | Badge with count of new events since last view |
| Backend activity service | `server/activityFeedService.js`, `/api/activity` | Event tracking and storage |

### 4C. VoIP / Voice Control 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Push-to-talk | `client/voice-control.js` | Microphone button, push-to-talk via Space |
| Google Web Speech / Whisper | `client/voice-control.js` | Default STT engine vs local Whisper fallback |
| Command parsing | `client/voice-control.js` | Rule-based, Ollama, or Claude-powered intent extraction |
| Backend integration | `server/voiceCommandService.js` | Voice command processing |

### 4D. Discord Integration 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Discord queue bridge | `server/discordIntegrationService.js` | Orchestrate agents via Discord messages |
| Queue processing | `/api/discord/process-queue` | Process pending Discord jobs |
| Status endpoint | `/api/discord/status` | Integration health check |

---

## Tier 5 — Settings, Config & Policies

### 5A. User Settings 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Settings panel UI | (None in client/ — would need creation) | Preferences modal/panel |
| Global settings | `server/userSettingsService.js`, `/api/user-settings/global` | Theme, skins, auto-start, recovery mode, font, token limits |
| Per-terminal settings | `/api/user-settings/terminal/:sessionId` | Override global settings per session |
| Default template | `/api/user-settings/default` | Factory defaults |
| Cascade/merge | `/api/user-settings/effective/:sessionId` | Global + terminal-level setting merge |
| Settings reset | `/api/user-settings/reset` | Factory reset |

### 5B. Policy & Access Control 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Role-based policies | `server/policyService.js` | Viewer/operator/admin roles |
| Policy templates | `/api/policy/templates`, `server/policyBundleService.js` | Policy template catalog |
| Policy bundles | `/api/policy/bundles/export`, `/api/policy/bundles/import` | Export/import policy bundles |
| License validation | `server/licenseService.js`, `server/licenseMiddleware.js` | License key validation, Pro-only middleware, entitlement checks |
| Audit export | `server/auditExportService.js`, `/api/audit/export` | Redacted audit log as JSON/CSV with signature |

### 5C. Service Stack & Plugins 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Service stack registry | `server/workspaceServiceStackService.js` | Manifest of services attached to a workspace |
| Runtime supervisor | `server/serviceStackRuntimeService.js` | Start/stop/restart services, health checks |
| Plugin loader | `server/pluginLoaderService.js`, `client/plugin-host.js` | Load external plugins, register commands, UI slots |
| Plugin API endpoints | `/api/workspaces/:id/service-stack/*` | CRUD for service stacks |

---

## Tier 6 — Developer & Release Tooling

### 6A. Release Management 🟡
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Version consistency check | `scripts/release/check-version-consistency.js` | Validate `package.json` vs Electron build configs |
| Installer verification | `scripts/release/verify-bundle-version.js` | Ensure installer filename matches version |
| Release readiness report | `scripts/generate-release-readiness-report.js` | Automated QA checks |
| Benchmark snapshots | `server/processTelemetryBenchmarkService.js` | Capture/release benchmark metrics |
| Release notes generation | `/api/process/telemetry/benchmarks/release-notes` | Auto-generate release notes from benchmarks |

### 6B. Telemetry & Diagnostics 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Process performance metrics | `/api/process/performance` | RSS, child process count, CPU |
| Diagnostic endpoints | `/api/diagnostics` | Cross-platform environment checks |
| Dependency checks | `server/diagnosticsService.js` | Check for required CLI tools (gh, git, claude, codex, gemini) |
| Onboarding wizard | `server/setupActionService.js`, `server/onboardingStateService.js` | First-run dependency installation wizard |

### 6C. Tests 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Unit tests | `tests/unit/` | Jest tests for core services |
| E2E tests | `tests/e2e/`, `playwright.config.js` | Playwright browser tests |
| Diff viewer tests | `tests/e2e-diff-viewer/` | Specialised dif viewer E2E |

---

## Tier 7 — Greenfield & Scaffolding

### 7A. Greenfield Project Creation 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Greenfield wizard UI | `client/greenfield-wizard.js` | Step-by-step new project creation |
| Project taxonomy detection | `server/greenfieldService.js`, `/api/greenfield/detect-category` | Auto-detect project category from description |
| Template catalog | `/api/greenfield/templates` | Available starter templates |
| Full project creation | `/api/greenfield/create-full` | Create project + GitHub repo + Claude session |

### 7B. Templates & Scaffolds 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Launch settings templates | `templates/launch-settings/` | Pre-built launch configs (website, hytopia-game, writing) |
| Project kits | `templates/project-kits/` | Starter kits (generic-empty, hytopia-game-starter, node-typescript-tool, website-starter) |
| Scaffolds | `templates/scaffolds/` | Code generation scaffolds (cli-tool, generic, hytopia-game, website) |
| Greenfield framework modal | `client/greenfield-framework-modal.js` | Framework selector modal |

---

## Tier 8 — GitHub & Git Enhancements

### 8A. GitHub Integration 🔴
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| GitHub repo browser | `/api/github/repos`, `server/githubRepoService.js` | List repos from `gh` CLI |
| Clone + add worktree | `/api/github/clone-and-add-worktree` | Clone repo and bootstrap worktrees in one step |
| Webhook handler | `/api/webhooks/github` | Receive GitHub webhooks (PR events, reviews) |

### 8B. Git Enhancements 🟡
| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Auto-pull updates | `server/gitUpdateService.js` | `git pull` on startup or interval |
| Worktree conflict detection | `server/worktreeConflictService.js` | Detect branch conflicts between worktrees |
| Worktree tagging | `server/worktreeTagService.js` | Tags like `readyForReview` for worktrees |
| Worktree metadata | `server/worktreeMetadataService.js` | Persist metadata per worktree |
| File sync | `server/fileSyncService.js` | Sync files across worktrees |

---

## Tier 9 — Scheduler & Automation

| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Cron-like job scheduler | `server/schedulerService.js` | Scheduled tasks (daily PR review, weekly cleanup) |
| Pager/alerting | `server/pagerService.js` | Send alerts on critical failures |
| Recommendations engine | `server/recommendationsService.js`, `client/recommendations.js` | Tool recommendations based on detected gaps |
| Test orchestration | `server/testOrchestrationService.js` | Orchestrate test runs across sessions |
| Product launcher | `server/productLauncherService.js` | Launch products/workflows with one click |
| Build production | `server/buildProductionService.js`, socket events `build-started/completed/failed` | Build project for production from within terminal |

---

## Tier 10 — Rust/Native Features (Tauri-specific, maybe skip for Electron)

| Feature | Original File(s) | Description |
|---------|-----------------|-------------|
| Native terminal (portable-pty) | `src-tauri/src/terminal.rs` | Rust-native PTY (already replaced by node-pty) |
| File watcher | `src-tauri/src/file_watcher.rs` | Native filesystem watching via `notify` crate |
| System tray | `src-tauri/src/main.rs` | Tray icon with quick actions |
| Update checker | `src-tauri/src/main.rs` | Auto-update via Tauri updater plugin |
| ConPTY compat | `server/utils/nodePtyCompat.js` | Windows ConPTY shim (optional for Electron) |

---

## Summary Table

| Tier | Category | Total Items | Ported (🟢) | Partial (🟡) | Missing (🔴) |
|------|----------|:-----------:|:-----------:|:------------:|:------------:|
| 1 | Core Session & Workspace UX | ~18 | 4 | 4 | 10 |
| 2 | Agent & Commander | ~13 | 1 | 1 | 11 |
| 3 | Projects, Tasks & PRs | ~12 | 0 | 0 | 12 |
| 4 | Notifications & Activity | ~15 | 0 | 0 | 15 |
| 5 | Settings & Policies | ~14 | 0 | 1 | 13 |
| 6 | Developer & Release | ~10 | 0 | 1 | 9 |
| 7 | Greenfield & Scaffolding | ~8 | 0 | 0 | 8 |
| 8 | GitHub & Git | ~7 | 0 | 1 | 6 |
| 9 | Scheduler & Automation | ~7 | 0 | 0 | 7 |
| 10 | Rust/Native (skip) | ~5 | — | — | — |
| **TOTAL** | | **~109** | **5** | **8** | **96** |

---

## Recommended Implementation Order

1. **Session recovery & backlog replay** — because without it, restarting the app loses all state
2. **Tab bar with keyboard shortcuts** — biggest UX gap vs original (Cmd+W, Cmd+Tab, grid presets)
3. **Focus overlay & view presets** — makes many-agent workflows usable
4. **Dashboard** — workspace overview, quick actions
5. **Commander panel** — the "brain" that coordinates all agents
6. **Conversation browser** — search/export conversation history
7. **Activity feed** — chronological event tracking
8. **Notification system** — in-app + OS notifications
9. **Settings panel** — user preferences UI
10. **Projects board** — Kanban workflow
11. **PR/Review automation + Diff viewer** — if git integration is wanted
12. **Greenfield wizards** — if project creation is wanted
13. Everything else

For reference, the original `client/app.js` is **36,159 lines** and the `server/index.js` serves **~130+ API routes** with **~40+ Socket.IO events** across **~80+ backend service files**.
