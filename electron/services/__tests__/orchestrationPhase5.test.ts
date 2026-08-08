import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadOrchestrationConfig } from '../orchestration/config'
import { StructuredLogger } from '../orchestration/logger'
import { WorktreeLifecycle } from '../orchestration/worktreeLifecycle'

const tmpDirs: string[] = []

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agntspce-p5-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

// ── 5.4 config ──
describe('Phase 5.4 — loadOrchestrationConfig', () => {
  it('returns defaults when no config file exists', () => {
    const cfg = loadOrchestrationConfig(tmpDir())
    expect(cfg.maxConcurrentSessions).toBe(8)
    expect(cfg.useWorktrees).toBe(true)
    expect(cfg.gateAutoApprove).toBe(false)
    expect(cfg.circuitBreakerThreshold).toBe(3)
    expect(cfg.sweepIntervalMs).toBe(60_000)
    expect(cfg.logLevel).toBe('info')
  })

  it('reads orchestration values from config.json', () => {
    const dir = tmpDir()
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      orchestration: { maxConcurrentSessions: 4, useWorktrees: false, gateAutoApprove: true, logLevel: 'warn' },
    }))
    const cfg = loadOrchestrationConfig(dir)
    expect(cfg.maxConcurrentSessions).toBe(4)
    expect(cfg.useWorktrees).toBe(false)
    expect(cfg.gateAutoApprove).toBe(true)
    expect(cfg.logLevel).toBe('warn')
  })

  it('falls back per-field for invalid values', () => {
    const dir = tmpDir()
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      orchestration: { maxConcurrentSessions: -5, logLevel: 'nope', circuitBreakerThreshold: 'x' },
    }))
    const cfg = loadOrchestrationConfig(dir)
    expect(cfg.maxConcurrentSessions).toBe(8)
    expect(cfg.logLevel).toBe('info')
    expect(cfg.circuitBreakerThreshold).toBe(3)
  })
})

// ── 5.3 structured logging ──
describe('Phase 5.3 — StructuredLogger', () => {
  it('writes JSON-lines entries to orchestration.log', async () => {
    const dir = tmpDir()
    const logger = new StructuredLogger({ logDir: dir })
    logger.info('task', 'claim', { taskId: 't1', agentId: 'a1' })
    logger.warn('merge', 'failed', { taskId: 't1', reason: 'conflict' })
    logger.close()
    await new Promise(r => setTimeout(r, 100))

    const logPath = path.join(dir, 'orchestration.log')
    expect(fs.existsSync(logPath)).toBe(true)
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n')
    expect(lines.length).toBe(2)

    const first = JSON.parse(lines[0])
    expect(first.level).toBe('info')
    expect(first.component).toBe('task')
    expect(first.event).toBe('claim')
    expect(first.taskId).toBe('t1')
    expect(first.agentId).toBe('a1')
    expect(typeof first.ts).toBe('string')

    const second = JSON.parse(lines[1])
    expect(second.level).toBe('warn')
    expect(second.reason).toBe('conflict')
  })

  it('respects the configured level threshold', async () => {
    const dir = tmpDir()
    const logger = new StructuredLogger({ logDir: dir, level: 'error' })
    logger.info('task', 'claim', { taskId: 't1' })
    logger.warn('merge', 'failed', {})
    logger.error('coordinator', 'crash', {})
    logger.close()
    await new Promise(r => setTimeout(r, 100))

    const lines = fs.readFileSync(path.join(dir, 'orchestration.log'), 'utf-8').trim().split('\n').filter(Boolean)
    expect(lines.length).toBe(1)
    expect(JSON.parse(lines[0]).event).toBe('crash')
  })
})

// ── 5.1 orphan worktree sweep ──
describe('Phase 5.1 — orphan worktree sweep', () => {
  function initRepo(dir: string): void {
    const repo = path.join(dir, 'repo')
    fs.mkdirSync(repo, { recursive: true })
    const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8', timeout: 30000 })
    git(['init', '-b', 'main'])
    git(['config', 'user.email', 'test@test.com'])
    git(['config', 'user.name', 'Test'])
    fs.writeFileSync(path.join(repo, 'README.md'), '# Test\n')
    git(['add', '.'])
    git(['commit', '-m', 'init'])
    git(['branch', 'agntspce-integration', 'main'])
  }

  it('removes only worktrees whose task is not active', () => {
    const dir = tmpDir()
    initRepo(dir)
    const repo = path.join(dir, 'repo')
    const wtl = new WorktreeLifecycle(repo)

    const active = wtl.createWorktree('task-active', 'agntspce-integration')
    const done = wtl.createWorktree('task-done', 'agntspce-integration')

    // merge task-done's branch so its work is preserved
    fs.writeFileSync(path.join(done.worktreePath, 'done.ts'), 'done\n')
    execFileSync('git', ['add', '.'], { cwd: done.worktreePath })
    execFileSync('git', ['commit', '-m', 'work'], { cwd: done.worktreePath })
    execFileSync('git', ['checkout', 'agntspce-integration'], { cwd: repo })
    execFileSync('git', ['merge', 'worktree/task-done', '--no-ff', '-m', 'merge done'], { cwd: repo })
    execFileSync('git', ['checkout', 'main'], { cwd: repo })

    const removed = wtl.sweepOrphanWorktrees(new Set(['task-active']), 'agntspce-integration')
    expect(removed).toBe(1)
    expect(fs.existsSync(active.worktreePath)).toBe(true)
    expect(fs.existsSync(done.worktreePath)).toBe(false)
  })

  it('cleanupScratchWorktrees removes scratch-* dirs only', () => {
    const dir = tmpDir()
    initRepo(dir)
    const repo = path.join(dir, 'repo')
    const wtl = new WorktreeLifecycle(repo)
    const scratch = wtl.createScratchWorktree('agntspce-integration')
    const task = wtl.createWorktree('keep-me', 'agntspce-integration')

    wtl.cleanupScratchWorktrees()
    expect(fs.existsSync(scratch.worktreePath)).toBe(false)
    expect(fs.existsSync(task.worktreePath)).toBe(true)
  })

  it('createInRepoBranch + cleanupInRepoTaskBranch (no-worktree mode)', () => {
    const dir = tmpDir()
    initRepo(dir)
    const repo = path.join(dir, 'repo')
    const wtl = new WorktreeLifecycle(repo)
    const integSha = execFileSync('git', ['rev-parse', 'agntspce-integration'], { cwd: repo, encoding: 'utf-8' }).trim()

    wtl.createInRepoBranch('task-1', integSha)
    const head = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim()
    expect(head).toBe('worktree/task-1')

    // agent commits, then branch merged into integration
    fs.writeFileSync(path.join(repo, 'README.md'), '# Changed\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'work'], { cwd: repo })
    execFileSync('git', ['checkout', 'agntspce-integration'], { cwd: repo })
    execFileSync('git', ['merge', 'worktree/task-1', '--no-ff', '-m', 'merge'], { cwd: repo })

    wtl.cleanupInRepoTaskBranch('task-1', 'agntspce-integration')
    const afterHead = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim()
    const branches = execFileSync('git', ['branch', '--format', '%(refname:short)'], { cwd: repo, encoding: 'utf-8' }).trim()
    expect(afterHead).toBe('agntspce-integration')
    expect(branches).not.toContain('worktree/task-1')
  })
})
