# Graph Report - .  (2026-07-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1312 nodes · 2214 edges · 92 communities (56 shown, 36 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 87
- Community 90

## God Nodes (most connected - your core abstractions)
1. `StateManager` - 61 edges
2. `SessionManager` - 43 edges
3. `WorkspaceManager` - 43 edges
4. `GitHelper` - 34 edges
5. `react` - 32 edges
6. `asarUnpack` - 30 edges
7. `Workspace` - 25 edges
8. `AgentOrchestrator` - 23 edges
9. `Coordinator` - 23 edges
10. `CavemanService` - 22 edges

## Surprising Connections (you probably didn't know these)
- `_generate_intelligent_overrides()` --calls--> `search()`  [INFERRED]
  .opencode/skills/ui-ux-pro-max/scripts/design_system.py → .opencode/skills/ui-ux-pro-max/scripts/core.py
- `startServer()` --calls--> `injectClaudeCodeConfig()`  [EXTRACTED]
  electron/main.ts → electron/services/searchManager.ts
- `SessionManager` --references--> `AgentOrchestrator`  [EXTRACTED]
  electron/services/sessionManager.ts → electron/services/agentOrchestrator.ts
- `SessionManager` --references--> `GitHelper`  [EXTRACTED]
  electron/services/sessionManager.ts → electron/services/gitHelper.ts
- `EnsureCoordinatorOptions` --references--> `StateManager`  [EXTRACTED]
  electron/services/orchestration/bootstrap.ts → electron/services/orchestration/stateManager.ts

## Import Cycles
- None detected.

## Communities (92 total, 36 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (45): clearDiscovery(), DiscoveryInfo, ensureCoordinator(), getDbPath(), getDiscoveryPath(), getSocketPath(), getWorkspaceRoot(), hashWorkspaceRoot() (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (12): RingBuffer, CwdState, GitBranchInfo, SavedSessionData, Session, SessionConfig, TerminalConfig, UserSettings (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (13): ChatManager, AIProvider, ChatMessage, ChatRequest, ChatResponse, ChatThread, ProviderConfig, ProviderId (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (42): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (47): ai, @ai-sdk/anthropic, @ai-sdk/deepseek, @ai-sdk/google, @ai-sdk/openai, better-sqlite3, cors, dotenv (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (46): electron, electron-builder, oxlint, allowScripts, better-sqlite3@12.11.1, node-pty@1.1.0, devDependencies, electron (+38 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (15): applyFilter(), CompiledFilter, CompiledMatchOutputRule, CompiledReplaceRule, compileFilter(), FilterDefinition, FilterRegistry, findFilterIn() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (9): MergeGate, MergeResult, detectBuildCommand(), detectInstallCommand(), detectPackageManager(), runCommands(), ScratchWorktreeResult, WorktreeLifecycle (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (30): asarUnpack, bin/agntspce, bin/agntspce.exe, bin/agntspce.mjs, bin/cargo, bin/cargo.exe, bin/docker, bin/docker.exe (+22 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (21): AGENT_IMAGE_MAP, getAgentColorImage(), getAgentTextImage(), App(), AgentItem, AgentPicker(), Props, Status (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (22): ActivityEvent, ActivityFeed(), AGENT_LABELS, Props, timeAgo(), typeLabel(), Dashboard(), DeletedWs (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (7): CavemanAggregateStats, CavemanRun, CavemanService, CavemanStats, claudeMdRulesForLevel(), InternalSession, skillMdForLevel()

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (9): BlockStreamFilter, CaptureResult, FilterMode, LineHandler, LineStreamFilter, runStreaming(), RunStreamingOptions, StreamFilter (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (23): AgentCheck, AGNENT_CHECKS, cleanupStaleSitePackages(), findInstalledBinary(), fixSearchBinary(), getBundledSearchDir(), getBundledVersion(), getInstalledBinaryCandidates() (+15 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (14): react, Command, CommanderPanel(), Props, CreateWorkspaceModalProps, DiffChunk, GitDiffViewer(), GitDiffViewerProps (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (22): DOM, src, vite/client, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib (+14 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (16): AGENTS_LIST, FALLBACK_AGENTS, ModalState, CodeEditor(), CodeEditorProps, EditorTabs(), EditorTabsProps, ICONS (+8 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (18): Props, OrchestratorStats, UseSocketReturn, AgentCapabilities, AgentFlag, AgentMode, BranchChange, CavemanAggregateStats (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.12
Nodes (16): agentManager, agentOrchestrator, app_, chatManager, createNewWindow(), createWindow(), gitHelper, httpServer (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (16): AGENT_COMMANDS, findExecutable(), getAllAgentBinaryDirs(), getAllAgentPaths(), getLoginPath(), getLoginShell(), resetCache(), resolveAgent() (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (7): DB_PATH, __dirname, __filename, main(), McpTestClient, PROXY_SCRIPT, TSX_BIN

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.18
Nodes (16): neverWorse(), CaptureFilter, emitGuarded(), ExitAwareCaptureFilter, run(), runFiltered(), runFilteredWithExit(), RunMode (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (7): AgentCapabilities, AgentConfig, AgentFlag, AgentManager, AgentMode, AgentStartConfig, AgentUIConfig

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (4): DEFAULT_THRESHOLDS, ResourceThresholds, ResourceTracker, SessionResourceUsage

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (11): AggressiveFilter, CommentPatterns, DATA_EXTENSIONS, detectLanguage(), EXT_MAP, FilterLevel, FilterStrategy, getCommentPatterns() (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (3): OutputCompressor, PromptOptimizer, TokenUsageTracker

### Community 31 - "Community 31"
Cohesion: 0.21
Nodes (11): AGENT_CHECKS, AgentInfo, detectInstalledAgents(), getBinaryVersion(), getBundledRtkPath(), getBundledVersion(), getInstalledRtkPath(), getInstalledVersion() (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (15): ChatSidebar(), generateId(), Props, SUGGESTIONS, defaultPrefs, FONT_FAMILIES, loadPrefs(), Props (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (12): DiffLine, DiffViewer(), parseDiff(), Props, FileStatus, FullStatus, Props, StatusFilter (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.21
Nodes (8): AGENT_TYPES, CommandEvent, BUILTIN_FILTERS, RUST_HANDLED_COMMANDS, formatCommand(), filterCommandOutput(), getRegistry(), hasSpecificFilter()

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (4): GainSummary, TimedExecution, Tracker, TrackRecord

### Community 38 - "Community 38"
Cohesion: 0.21
Nodes (3): SessionRecord, PrioritySemaphore, QueuedWaiter

### Community 40 - "Community 40"
Cohesion: 0.24
Nodes (8): FileExplorer(), FileExplorerProps, FileIcon(), FileTree(), FileTreeProps, FileTreeNode, getFileIconClass(), ICON_MAP

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (9): agntspceAvailable(), applyFilter(), BUILTIN_FILTERS, cmdRewrite(), cmdRun(), findFilter(), normalizeCommand(), resolveBinary() (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (7): addAndCommit(), DB_PATH, execGit(), REPO_PATH, SOCKET_PATH, TMP, userCheckoutState()

### Community 43 - "Community 43"
Cohesion: 0.22
Nodes (8): __dirname, __filename, findAgntspceScript(), getRtkBinaryPath(), hasRtkRewrite(), registry, rewriteCommand(), RewriteResult

### Community 44 - "Community 44"
Cohesion: 0.20
Nodes (10): build, appId, directories, extraResources, productName, win, output, artifactName (+2 more)

### Community 45 - "Community 45"
Cohesion: 0.36
Nodes (6): AgentModalProps, StartupUIProps, Props, Props, AgentConfig, AgentStartConfig

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (3): buildShellArgs(), getDefaultShell(), getShellName()

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (8): BranchEntry, CommitEntry, CommitFileEntry, FileStatus, FullStatus, GitReviewPanel(), Props, statusBadge()

### Community 50 - "Community 50"
Cohesion: 0.43
Nodes (6): fmt(), Props, RtkDashboard(), timeStr(), ExecutionEvent, stripAnsi()

### Community 51 - "Community 51"
Cohesion: 0.38
Nodes (6): AGENT_LABELS, HistoryEntry, HistoryPanel(), Props, timeAgo(), typeLabel()

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (5): binaryMap, dest, __dirname, src, versionDest

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (6): files, bin/**/*, !bin/rtk, !bin/rtk.exe, dist/**/*, dist-electron/**/*

### Community 54 - "Community 54"
Cohesion: 0.33
Nodes (4): ARCH_MAP, __dirname, PROJECT_DIR, SEARCH_DIR

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (4): execFileAsync, FileStatus, FullStatus, GitStatus

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (4): completionPatterns, SessionState, toolPatterns, typingPatterns

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (4): dest, __dirname, root, src

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (4): linux, artifactName, target, AppImage

### Community 61 - "Community 61"
Cohesion: 0.50
Nodes (4): mac, artifactName, target, dmg

## Knowledge Gaps
- **322 isolated node(s):** `npx`, `$schema`, `typescript`, `oxc`, `react/rules-of-hooks` (+317 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Coordinator` connect `Community 34` to `Community 0`, `Community 6`, `Community 9`, `Community 42`, `Community 21`, `Community 24`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `StateManager` connect `Community 6` to `Community 0`, `Community 34`, `Community 9`, `Community 42`, `Community 24`, `Community 91`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `SessionManager` connect `Community 11` to `Community 1`, `Community 39`, `Community 8`, `Community 46`, `Community 21`, `Community 22`, `Community 23`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `npx`, `$schema`, `typescript` to the rest of the system?**
  _322 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05583972719522592 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06120218579234973 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08590441621294616 - nodes in this community are weakly interconnected._