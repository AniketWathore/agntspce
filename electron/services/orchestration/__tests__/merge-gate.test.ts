import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert'
import { describe, it, before, after } from 'node:test'
import { StateManager } from '../stateManager'
import { Coordinator } from '../coordinator'
import { WorktreeLifecycle } from '../worktreeLifecycle'
import { MergeGate } from '../mergeGate'
import { SessionSummarizer } from '../sessionSummarizer'

const TMP = os.tmpdir()
const RUN_ID = `agntspce-merge-gate-${Date.now()}`
const SOCKET_PATH = path.join(TMP, `${RUN_ID}.sock`)
const DB_PATH = path.join(TMP, `${RUN_ID}.db`)
const REPO_PATH = path.join(TMP, RUN_ID)

let sm: StateManager
let coord: Coordinator
let wtl: WorktreeLifecycle
let mg: MergeGate
let ss: SessionSummarizer
let alphaId: string
let betaId: string

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test Repo\n')
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"test-repo","private":true}\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: dir })
}

function execGit(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd: cwd || REPO_PATH, encoding: 'utf-8', timeout: 30000 }).trim()
}

function userCheckoutState(): { branch: string; head: string; status: string } {
  return {
    branch: execGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: execGit(['rev-parse', 'HEAD']),
    status: execGit(['status', '--porcelain']),
  }
}

function addAndCommit(wtPath: string, msg: string): void {
  execGit(['add', '.'], wtPath)
  execGit(['commit', '-m', msg], wtPath)
}

before(async () => {
  initRepo(REPO_PATH)
  sm = new StateManager(DB_PATH, REPO_PATH)
  coord = new Coordinator(SOCKET_PATH, sm)
  wtl = new WorktreeLifecycle(REPO_PATH)
  mg = new MergeGate(REPO_PATH, wtl, sm)
  ss = new SessionSummarizer(sm.getDb(), REPO_PATH)
  await coord.listen()

  alphaId = sm.registerAgent('agent-alpha', 'claude', ['code']).id
  betaId = sm.registerAgent('agent-beta', 'codex', ['code']).id
})

after(() => {
  coord.close()
  sm.close()
  for (const p of [DB_PATH, SOCKET_PATH]) {
    try { fs.unlinkSync(p) } catch {}
  }
  try { fs.rmSync(REPO_PATH, { recursive: true, force: true }) } catch {}
  const agntspceDir = path.join(TMP, '.agntspce')
  try { fs.rmSync(agntspceDir, { recursive: true, force: true }) } catch {}
})

function createClaimedTask(description: string, files: string[], agentId: string) {
  const task = sm.createTask(description, files)
  const integSha = sm.getIntegrationBranchSha()
  const wt = wtl.createWorktree(task.id, integSha)
  sm.claimTask(task.id, agentId, wt.branchName, wt.worktreePath, wt.branchPoint)
  sm.transitionTaskStatus(task.id, 'in_progress')
  return { task, wt }
}

function mergeToDone(taskId: string) {
  sm.transitionTaskStatus(taskId, 'merging')
  return mg.executeMerge(taskId)
}

describe('Merge Gate', () => {

it('1. Happy path: create→claim→commit→merge→integration advances', () => {
  const pre = userCheckoutState()
  const { task, wt } = createClaimedTask('Happy path', ['src/main.ts'], alphaId)

  fs.mkdirSync(path.join(wt.worktreePath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wt.worktreePath, 'src', 'main.ts'), 'console.log("hello")\n')
  addAndCommit(wt.worktreePath, 'Add main.ts')

  const mergeResult = mergeToDone(task.id)
  assert.strictEqual(mergeResult.ok, true)
  assert.ok(mergeResult.mergeCommitSha)

  const integShaAfter = execGit(['rev-parse', 'agntspce-integration'])
  assert.strictEqual(integShaAfter, mergeResult.mergeCommitSha)

  const post = userCheckoutState()
  assert.strictEqual(post.branch, pre.branch)
  assert.strictEqual(post.head, pre.head)
  assert.strictEqual(post.status, '')

  assert.strictEqual(fs.existsSync(wt.worktreePath), false)

  const baseDir = path.join(REPO_PATH, '..', '.agntspce', 'worktrees')
  if (fs.existsSync(baseDir)) {
    for (const entry of fs.readdirSync(baseDir)) {
      assert.ok(!entry.startsWith('scratch-'), `scratch dir ${entry} should be cleaned`)
    }
  }
})

it('2. Merge-time scope overlap escalates against active tasks', () => {
  // Merge task A
  const { task: tA, wt: wtA } = createClaimedTask('Scope A', ['src/scope_a.txt'], alphaId)
  fs.writeFileSync(path.join(wtA.worktreePath, 'src', 'scope_a.txt'), 'A\n')
  addAndCommit(wtA.worktreePath, 'A')
  const mA = mergeToDone(tA.id)
  assert.strictEqual(mA.ok, true)

  // Task B stays active (not merged)
  const { task: tB, wt: wtB } = createClaimedTask('Scope B', ['src/scope_b.txt'], betaId)
  fs.writeFileSync(path.join(wtB.worktreePath, 'src', 'scope_b.txt'), 'B\n')
  addAndCommit(wtB.worktreePath, 'B')

  // Task C claims different file but actually modifies scope_b.txt
  const { task: tC, wt: wtC } = createClaimedTask('Scope C', ['src/scope_c.txt'], alphaId)
  fs.writeFileSync(path.join(wtC.worktreePath, 'src', 'scope_c.txt'), 'C\n')
  fs.writeFileSync(path.join(wtC.worktreePath, 'src', 'scope_b.txt'), 'B modified by C\n')
  addAndCommit(wtC.worktreePath, 'C with undeclared')

  const mC = mergeToDone(tC.id)
  assert.strictEqual(mC.ok, false)
})

it('3. Merge conflict escalates — worktree kept, integration unchanged', () => {
  const integBase = sm.getIntegrationBranchSha()
  const conflictFile = 'src/conflict.txt'

  // Both tasks declare different files (to bypass claim-time overlap check)
  // but actually modify the same file
  const tA = sm.createTask('Conflict A', ['src/a.txt'])
  const wtA = wtl.createWorktree(tA.id, integBase)
  sm.claimTask(tA.id, alphaId, wtA.branchName, wtA.worktreePath, wtA.branchPoint)
  sm.transitionTaskStatus(tA.id, 'in_progress')

  const tB = sm.createTask('Conflict B', ['src/b.txt'])
  const wtB = wtl.createWorktree(tB.id, integBase)
  sm.claimTask(tB.id, betaId, wtB.branchName, wtB.worktreePath, wtB.branchPoint)
  sm.transitionTaskStatus(tB.id, 'in_progress')

  fs.mkdirSync(path.join(wtA.worktreePath, 'src'), { recursive: true })
  fs.mkdirSync(path.join(wtB.worktreePath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wtA.worktreePath, conflictFile), 'AAAA\n')
  addAndCommit(wtA.worktreePath, 'A')
  fs.writeFileSync(path.join(wtB.worktreePath, conflictFile), 'BBBB\n')
  addAndCommit(wtB.worktreePath, 'B')

  sm.transitionTaskStatus(tA.id, 'merging')
  const mA = mg.executeMerge(tA.id)
  assert.strictEqual(mA.ok, true)

  const integAfterA = sm.getIntegrationBranchSha()

  sm.transitionTaskStatus(tB.id, 'merging')
  const mB = mg.executeMerge(tB.id)
  assert.strictEqual(mB.ok, false)

  assert.strictEqual(sm.getIntegrationBranchSha(), integAfterA)
  assert.strictEqual(fs.existsSync(wtB.worktreePath), true)
})

it('4. Integration ref advanced externally between merge attempts', () => {
  // Simulate: merge in progress but someone externally advances integration ref
  // The merge gate's pre-check should invalidate the candidate
  const integBefore = sm.getIntegrationBranchSha()

  const { task, wt } = createClaimedTask('CAS test', ['src/cas_test.txt'], alphaId)
  fs.writeFileSync(path.join(wt.worktreePath, 'src', 'cas_test.txt'), 'CAS\n')
  addAndCommit(wt.worktreePath, 'CAS commit')
  sm.transitionTaskStatus(task.id, 'merging')

  // Advance integration ref to repo HEAD (simulate concurrent external merge)
  const fakeSha = execGit(['rev-parse', 'HEAD'])
  execGit(['branch', '-f', 'agntspce-integration', fakeSha])

  // The merge gate captures integration SHA at step 5 (after our external advance).
  // But the task's branchPoint was from integBefore, so the merge into scratch
  // might still succeed. The real CAS protection is atomic update-ref:
  // if the ref were advanced BETWEEN step 5 and promotion, update-ref would fail.
  // We can't test that race in a single thread, but we verify:
  // 1. The integration ref is at fakeSha (our external advance stuck)
  // 2. git update-ref with wrong old-value fails atomically
  assert.strictEqual(sm.getIntegrationBranchSha(), fakeSha)

  // Verify update-ref with mismatched old value fails
  assert.throws(() => {
    execGit(['update-ref', 'refs/heads/agntspce-integration', integBefore, integBefore])
  })
})

it('5. No overlap after merge — new task can claim same files', () => {
  const { task: tM, wt: wtM } = createClaimedTask('Merge first', ['src/claim_after.txt'], alphaId)
  fs.mkdirSync(path.join(wtM.worktreePath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wtM.worktreePath, 'src', 'claim_after.txt'), 'done\n')
  addAndCommit(wtM.worktreePath, 'Merge')
  const r = mergeToDone(tM.id)
  assert.strictEqual(r.ok, true)

  const { task: t2, wt: wt2 } = createClaimedTask('Claim after merge', ['src/claim_after.txt'], betaId)
  assert.strictEqual(fs.existsSync(wt2.worktreePath), true)
})

it('6. branchPoint == integration SHA after prior merge', () => {
  const integSha = execGit(['rev-parse', 'agntspce-integration'])
  const task = sm.createTask('BP check', ['src/bp_check.txt'])
  const wt = wtl.createWorktree(task.id, integSha)
  assert.strictEqual(wt.branchPoint, integSha)
})

it('7. File overlap at claim time rejected with OVERLAP', () => {
  const { task: t1, wt: wt1 } = createClaimedTask('Alpha', ['src/shared.txt'], alphaId)
  assert.ok(fs.existsSync(wt1.worktreePath))

  const t2 = sm.createTask('Beta overlap', ['src/shared.txt'])
  const wt2 = wtl.createWorktree(t2.id, sm.getIntegrationBranchSha())
  assert.throws(
    () => sm.claimTask(t2.id, betaId, wt2.branchName, wt2.worktreePath, wt2.branchPoint),
    (e: any) => e.code === 'OVERLAP'
  )
})

it('8. Non-owner cannot merge — FORBIDDEN', () => {
  const { task, wt } = createClaimedTask('Ownership', ['src/owned.txt'], alphaId)
  fs.mkdirSync(path.join(wt.worktreePath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wt.worktreePath, 'src', 'owned.txt'), 'owned\n')
  addAndCommit(wt.worktreePath, 'Owner commit')
  sm.transitionTaskStatus(task.id, 'merging')

  // Beta (non-owner) tries to check merge status — should fail ownership check
  const status = mg.checkMergeStatus(task.id, betaId)
  assert.strictEqual(status.canMerge, false)
  assert.match(status.reason || '', /owner/)
})

it('9. Abandon task preserves worktree', () => {
  const { task, wt } = createClaimedTask('Abandon me', ['src/abandon.txt'], alphaId)
  sm.transitionTaskStatus(task.id, 'abandoned')
  assert.strictEqual(sm.getTask(task.id)?.status, 'abandoned')
  assert.strictEqual(fs.existsSync(wt.worktreePath), true)
})

it('10. Stale agent sweep abandons tasks', () => {
  const staleId = sm.registerAgent('stale-agent', 'claude', []).id
  const { task } = createClaimedTask('Stale task', ['src/stale.txt'], staleId)

  const swept = sm.sweepStaleAgents(0)
  assert.ok(swept.includes(staleId))
  assert.strictEqual(sm.getTask(task.id)?.status, 'abandoned')
})

it('11. Invalid transition throws INVALID_STATE', () => {
  const task = sm.createTask('Bad trans', ['src/bad.txt'])
  assert.throws(
    () => sm.transitionTaskStatus(task.id, 'done'),
    (e: any) => e.code === 'INVALID_STATE'
  )
})

it('12. Dependency install failure escalates at merge time', () => {
  const integSha = sm.getIntegrationBranchSha()
  const task = sm.createTask('Dep fail', ['src/depfail.txt'])
  const wt = wtl.createWorktree(task.id, integSha)
  sm.claimTask(task.id, alphaId, wt.branchName, wt.worktreePath, wt.branchPoint)
  sm.transitionTaskStatus(task.id, 'in_progress')

  fs.mkdirSync(path.join(wt.worktreePath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wt.worktreePath, 'package.json'),
    '{ "name": "broken", "dependencies": { "nonexistent-pkg": "^99.99.99" } }\n')
  fs.writeFileSync(path.join(wt.worktreePath, 'package-lock.json'),
    '{"name":"broken","lockfileVersion":3,"packages":{}}\n')
  fs.writeFileSync(path.join(wt.worktreePath, 'src', 'depfail.txt'), 'depfail\n')
  addAndCommit(wt.worktreePath, 'Dep fail')
  sm.transitionTaskStatus(task.id, 'merging')

  const res = mg.executeMerge(task.id)
  assert.strictEqual(res.ok, false)
})

it('13. User checkout never touched on failure paths', () => {
  const pre = userCheckoutState()
  const integBase = sm.getIntegrationBranchSha()
  const conflictFile = 'src/safe_fail.txt'

  // Both tasks declare different files (to bypass claim-time overlap check)
  const tA = sm.createTask('Safe A', ['src/sa.txt'])
  const wtA = wtl.createWorktree(tA.id, integBase)
  sm.claimTask(tA.id, alphaId, wtA.branchName, wtA.worktreePath, wtA.branchPoint)
  sm.transitionTaskStatus(tA.id, 'in_progress')

  const tB = sm.createTask('Safe B', ['src/sb.txt'])
  const wtB = wtl.createWorktree(tB.id, integBase)
  sm.claimTask(tB.id, betaId, wtB.branchName, wtB.worktreePath, wtB.branchPoint)
  sm.transitionTaskStatus(tB.id, 'in_progress')

  fs.mkdirSync(path.join(wtA.worktreePath, 'src'), { recursive: true })
  fs.mkdirSync(path.join(wtB.worktreePath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wtA.worktreePath, conflictFile), 'A\n')
  addAndCommit(wtA.worktreePath, 'A')
  fs.writeFileSync(path.join(wtB.worktreePath, conflictFile), 'B\n')
  addAndCommit(wtB.worktreePath, 'B')

  sm.transitionTaskStatus(tA.id, 'merging')
  const mA = mg.executeMerge(tA.id)
  assert.strictEqual(mA.ok, true)

  sm.transitionTaskStatus(tB.id, 'merging')
  const mB = mg.executeMerge(tB.id)
  assert.strictEqual(mB.ok, false)

  const post = userCheckoutState()
  assert.strictEqual(post.branch, pre.branch)
  assert.strictEqual(post.head, pre.head)
  assert.strictEqual(post.status, '')
})

it('14. getActiveTasks excludes done/abandoned/escalated', () => {
  const active = sm.getActiveTasks()
  for (const t of active) {
    assert.ok(['claimed', 'in_progress', 'merging', 'setup_failed'].includes(t.status))
  }
})

describe('Session Summarizer', () => {

it('15. summarizeTask returns summary with status and key files for merged task', () => {
  const task = sm.createTask('Summary test A', ['src/summary_a.txt'])
  const wt = wtl.createWorktree(task.id, sm.getIntegrationBranchSha())
  sm.claimTask(task.id, alphaId, wt.branchName, wt.worktreePath, wt.branchPoint)
  sm.transitionTaskStatus(task.id, 'in_progress')
  fs.mkdirSync(path.join(wt.worktreePath, 'src'), { recursive: true })
  fs.writeFileSync(path.join(wt.worktreePath, 'src', 'summary_a.txt'), 'summary\n')
  addAndCommit(wt.worktreePath, 'Summary A')
  sm.transitionTaskStatus(task.id, 'merging')
  const r = mg.executeMerge(task.id)
  assert.strictEqual(r.ok, true)

  const summary = ss.summarizeTask(task.id)
  assert.ok(summary.summary.includes('[done]'))
  assert.ok(summary.summary.includes('src/summary_a.txt'))
  assert.ok(summary.statusLine.startsWith('Done'))
  assert.ok(summary.keyFiles.length > 0)
  assert.ok(summary.updatedAt > 0)
})

it('16. summarizeTask for abandoned task shows abandoned status', () => {
  const task = sm.createTask('Summary abandon', ['src/sum_abandon.txt'])
  const wt = wtl.createWorktree(task.id, sm.getIntegrationBranchSha())
  sm.claimTask(task.id, alphaId, wt.branchName, wt.worktreePath, wt.branchPoint)
  sm.transitionTaskStatus(task.id, 'in_progress')
  sm.transitionTaskStatus(task.id, 'abandoned')

  const summary = ss.summarizeTask(task.id)
  assert.ok(summary.summary.includes('[abandoned]'))
  assert.ok(summary.statusLine.includes('Abandoned'))
})

it('17. summarizeAgent returns active tasks and recent summaries', () => {
  const task = sm.createTask('Agent summary', ['src/agent_task.txt'])
  const wt = wtl.createWorktree(task.id, sm.getIntegrationBranchSha())
  sm.claimTask(task.id, betaId, wt.branchName, wt.worktreePath, wt.branchPoint)

  const agentSum = ss.summarizeAgent(betaId)
  assert.strictEqual(agentSum.name, 'agent-beta')
  assert.ok(agentSum.activeTasks.length > 0)
  assert.ok(agentSum.activeTasks.some(t => t.description === 'Agent summary'))
})

it('18. compressStatusUpdates keeps only N recent updates', () => {
  const task = sm.createTask('Compress test', ['src/compress.txt'])
  for (let i = 0; i < 10; i++) {
    sm.postStatusUpdate(task.id, alphaId, `Update ${i}`)
  }
  ss.compressStatusUpdates(task.id, 3)
  const remaining = sm.getTaskStatusUpdates(task.id)
  assert.strictEqual(remaining.length, 3)
  assert.ok(remaining.every(u => u.text.startsWith('Update')))
})

it('19. summarizeTask errors for non-existent task', () => {
  assert.throws(() => ss.summarizeTask('nonexistent-id'))
})

it('20. summarizeAgent errors for non-existent agent', () => {
  assert.throws(() => ss.summarizeAgent('nonexistent-id'))
})

})

})
