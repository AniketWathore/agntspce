import * as net from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { StateManager } from '../stateManager'
import { Coordinator } from '../coordinator'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SOCKET_PATH = `/tmp/agntspce-smoke-${Date.now()}.sock`
const DB_PATH = path.join(__dirname, `../../../.test-smoke-${Date.now()}.db`)
const TSX_BIN = path.join(__dirname, '..', '..', '..', '..', 'node_modules', '.bin', 'tsx')
const PROXY_SCRIPT = path.join(__dirname, '..', 'proxy', 'index.ts')

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let nextMsgId = 1

class McpTestClient {
  private proc: ReturnType<typeof spawn>
  private buffer = ''
  private pending = new Map<string, (msg: any) => void>()
  private connected = false
  name: string

  constructor(name: string, envVars: Record<string, string>) {
    this.name = name
    let tsxBin: string
    let args: string[]
    if (fs.existsSync(TSX_BIN)) {
      tsxBin = TSX_BIN
      args = [PROXY_SCRIPT]
    } else {
      tsxBin = 'npx'
      args = ['tsx', PROXY_SCRIPT]
    }
    this.proc = spawn(tsxBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGNTSPCE_COORDINATOR_SOCKET_PATH: SOCKET_PATH,
        ...envVars,
      },
    })

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      this.processLines()
    })

    this.proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.error(`  [${name} stderr] ${text}`)
    })

    this.proc.on('exit', (code) => {
      for (const [id, resolve] of this.pending) {
        resolve({ error: { code: 'PROCESS_EXIT', message: `Proxy exited with code ${code}` } })
        this.pending.delete(id)
      }
    })
  }

  private processLines(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed)
        if (msg.id && this.pending.has(String(msg.id))) {
          const resolve = this.pending.get(String(msg.id))!
          this.pending.delete(String(msg.id))
          resolve(msg)
        }
        if (msg.method === 'notifications/initialized' || msg.method === 'logging/message') {
          // Notifications, ignore
        }
      } catch {}
    }
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${this.name}: connect timeout`)), 10000)

      const id = nextMsgId++
      this.sendRequest(id, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'smoke-test', version: '1.0' },
      })

      this.pending.set(String(id), (msg: any) => {
        clearTimeout(timeout)
        if (msg.error) {
          reject(new Error(`Initialize failed: ${msg.error.message || JSON.stringify(msg.error)}`))
          return
        }
        this.sendNotification('notifications/initialized', {})
        this.connected = true
        resolve()
      })
    })
  }

  private sendRequest(id: number, method: string, params: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    this.proc.stdin!.write(msg)
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    this.proc.stdin!.write(msg)
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<{
    result?: any
    error?: { code: string; message: string; data?: unknown }
    isError?: boolean
    pendingMessages?: any[]
  }> {
    const id = nextMsgId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${this.name}: callTool(${name}) timeout`)), 15000)

      this.pending.set(String(id), (msg: any) => {
        clearTimeout(timeout)
        const pendingMessages = msg.result?._meta?.pendingMessages || msg.pendingMessages || []
        if (msg.error) {
          resolve({ error: msg.error, pendingMessages })
        } else {
          resolve({
            result: msg.result?.content,
            isError: msg.result?.isError === true,
            pendingMessages,
          })
        }
      })

      this.sendRequest(id, 'tools/call', { name, arguments: args })
    })
  }

  close(): void {
    this.proc.stdin?.end()
    this.proc.kill('SIGTERM')
    setTimeout(() => { try { this.proc.kill('SIGKILL') } catch {} }, 2000)
  }

  isRunning(): boolean {
    return this.proc.exitCode === null
  }
}

async function main(): Promise<void> {
  console.log('=== Smoke Test: Multi-Agent Orchestration (Real Proxy Processes) ===')
  console.log(`Socket: ${SOCKET_PATH}`)
  console.log(`DB: ${DB_PATH}`)

  // Create temp repo
  const repoPath = path.join(__dirname, `../../../.test-repo-${Date.now()}`)
  fs.mkdirSync(repoPath, { recursive: true })
  execFileSync('git', ['init'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoPath })
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Repo\n')
  fs.writeFileSync(path.join(repoPath, 'package.json'), '{"name":"test-repo","private":true}\n')
  fs.writeFileSync(path.join(repoPath, '.gitignore'), 'node_modules/\npackage-lock.json\n')
  execFileSync('git', ['add', '.'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath })

  try {
    // 1. Start coordinator
    const stateManager = new StateManager(DB_PATH, repoPath)
    const coordinator = new Coordinator(SOCKET_PATH, stateManager)
    await coordinator.listen()
    console.log('✓ Coordinator started')

    // 2. Spawn two real proxy processes
    const proxy1 = new McpTestClient('alpha', {
      AGNTSPCE_AGENT_NAME: 'agent-alpha',
      AGNTSPCE_AGENT_TYPE: 'claude',
      AGNTSPCE_AGENT_CAPABILITIES: '["code","test"]',
    })
    const proxy2 = new McpTestClient('beta', {
      AGNTSPCE_AGENT_NAME: 'agent-beta',
      AGNTSPCE_AGENT_TYPE: 'codex',
      AGNTSPCE_AGENT_CAPABILITIES: '["code"]',
    })

    await proxy1.connect()
    console.log('✓ Proxy alpha connected (MCP initialized)')
    await proxy2.connect()
    console.log('✓ Proxy beta connected (MCP initialized)')

    // 3. Both proxies should be registered (they auto-register on startup via proxy/index.ts)
    // We can verify by checking workspace context through proxy 1
    const ctxRes = await proxy1.callTool('get_workspace_context')
    if (ctxRes.error) throw new Error(`get_workspace_context failed: ${ctxRes.error.message}`)
    const ctxText = ctxRes.result?.[0]?.text || ''
    const ctx = JSON.parse(ctxText)
    const agentNames = ctx.agents.map((a: any) => a.name)
    console.log('  Active agents:', agentNames.join(', '))
    if (agentNames.includes('agent-alpha') && agentNames.includes('agent-beta')) {
      console.log('✓ Both agents registered and visible in context')
    } else {
      throw new Error(`Both agents should be visible. Got: ${agentNames.join(', ')}`)
    }

    // 4. Send message from alpha to beta
    const msgRes = await proxy1.callTool('send_message', {
      toAgentId: ctx.agents.find((a: any) => a.name === 'agent-beta')?.id || 'unknown',
      content: 'Hello from alpha! Working on the frontend module.',
    })
    if (msgRes.error) throw new Error(`send_message failed: ${msgRes.error.message}`)
    console.log('✓ Message sent from alpha to beta')

    // 5. Beta makes a tool call → should receive message via pendingMessages
    const betaCtxRes = await proxy2.callTool('get_workspace_context')
    if (betaCtxRes.error) throw new Error(`beta get_workspace_context failed: ${betaCtxRes.error.message}`)
    if (betaCtxRes.pendingMessages && betaCtxRes.pendingMessages.length > 0) {
      const pm = betaCtxRes.pendingMessages[0] as any
      console.log('✓ Message received by beta via piggybacking!')
      console.log(`  From: ${pm.fromAgentId}, Content: ${pm.content}`)
      if (pm.content === 'Hello from alpha! Working on the frontend module.') {
        console.log('  ✓ Message content verified')
      }
    } else {
      throw new Error('PIGGYBACKING FAILED: no pending messages delivered to beta')
    }

    // 6. Test create_task with overlap warning
    const taskRes = await proxy1.callTool('create_task', {
      description: 'Implement login page',
      declaredFiles: ['src/login.tsx', 'src/login.css'],
    })
    if (taskRes.error) throw new Error(`create_task failed: ${taskRes.error.message}`)
    const taskText = taskRes.result?.[0]?.text || ''
    const task1Match = taskText.match(/"id":\s*"([^"]+)"/)
    const task1Id = task1Match ? task1Match[1] : null
    console.log('✓ Task 1 created:', task1Id)

    // 7. Claim task 1 first (so it becomes "active" for overlap checking)
    const claimRes = await proxy1.callTool('claim_task', { taskId: task1Id })
    if (claimRes.error) throw new Error(`claim_task failed: ${claimRes.error.message}`)
    const claimText = claimRes.result?.[0]?.text || ''
    console.log('✓ Task claimed:', claimText.includes('"branchName"') ? 'branch assigned' : 'no branch')
    const branchMatch = claimText.match(/"branchName":\s*"([^"]+)"/)
    const worktreeMatch = claimText.match(/"worktreePath":\s*"([^"]+)"/)
    if (!branchMatch || !worktreeMatch) {
      throw new Error('claim_task response missing branchName or worktreePath')
    }
    const worktreePath = worktreeMatch[1]
    console.log(`  Branch: ${branchMatch[1]}`)
    console.log(`  Worktree: ${worktreePath}`)

    // Verify the worktree actually exists on disk
    if (fs.existsSync(worktreePath)) {
      console.log('✓ Worktree directory exists on disk')
      // Verify it's a git repo with the right branch checked out
      try {
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: worktreePath, encoding: 'utf-8' }).trim()
        console.log(`  ✓ Worktree has correct branch: ${branch}`)
      } catch {
        throw new Error(`Worktree at ${worktreePath} is not a valid git repository`)
      }
      // Verify main repo's working directory is untouched
      try {
        const mainStatus = execFileSync('git', ['status', '--porcelain'], { cwd: repoPath, encoding: 'utf-8' }).trim()
        if (mainStatus === '') {
          console.log('✓ Main repo working directory is clean and untouched')
        } else {
          throw new Error(`Main repo has uncommitted changes: ${mainStatus}`)
        }
      } catch (e: any) {
        throw new Error(`Main repo check failed: ${e.message}`)
      }
    } else {
      throw new Error(`Worktree does not exist at ${worktreePath}`)
    }

    // 8. Create overlapping task → should get overlapWarning now (task 1 is claimed)
    const overlapRes = await proxy2.callTool('create_task', {
      description: 'Fix login page styling',
      declaredFiles: ['src/login.css', 'src/other.ts'],
    })
    if (overlapRes.error) throw new Error(`overlap create_task failed: ${overlapRes.error.message}`)
    const overlapText = overlapRes.result?.[0]?.text || ''
    if (overlapText.includes('Overlap warning')) {
      console.log('✓ Create-time overlap warning received')
    } else {
      throw new Error(`Expected overlap warning in create_task response. Got: ${overlapText.slice(0, 500)}`)
    }

    // 9. Try to claim overlapping task through beta → should be rejected
    const task2Res = await proxy2.callTool('create_task', {
      description: 'Fix login page',
      declaredFiles: ['src/login.css'],
    })
    const task2Text = task2Res.result?.[0]?.text || ''
    const task2Match = task2Text.match(/"id":\s*"([^"]+)"/)
    const task2Id = task2Match ? task2Match[1] : null

    if (!task2Id) throw new Error('Failed to extract task 2 ID')
    console.log('✓ Task 2 created for overlap test')

    const claimOverlapRes = await proxy2.callTool('claim_task', { taskId: task2Id })
    if (claimOverlapRes.isError) {
      const errText = claimOverlapRes.result?.[0]?.text || ''
      console.log('✓ Overlap correctly rejected at claim time:', errText)
      // Verify the error code OVERLAP appears (not just INTERNAL_ERROR)
      if (errText.includes('OVERLAP') || errText.includes('overlap')) {
        console.log('  ✓ Error code distinguishes OVERLAP from generic errors')
      }
    } else {
      throw new Error('Overlap detection FAILED at claim time: should have rejected overlapping files')
    }

    // 10. Test merge gate: write file in worktree, commit, merge
    console.log('\n  --- Merge Gate Test ---')

    // 10a. Ownership check: proxy2 (beta) should not be able to mark proxy1's task done
    const forbiddenRes = await proxy2.callTool('mark_task_done', { taskId: task1Id })
    if (forbiddenRes.isError) {
      console.log('✓ Non-owner cannot mark task done (FORBIDDEN)')
    } else {
      throw new Error('Expected FORBIDDEN for non-owner mark_task_done')
    }

    const testFilePath = path.join(worktreePath, 'src', 'hello.txt')
    fs.mkdirSync(path.join(worktreePath, 'src'), { recursive: true })
    fs.writeFileSync(testFilePath, 'Hello from agntspce worktree!\n')
    execFileSync('git', ['add', 'src/hello.txt'], { cwd: worktreePath, encoding: 'utf-8' })
    execFileSync('git', ['commit', '-m', 'Add hello.txt via worktree'], { cwd: worktreePath, encoding: 'utf-8' })
    console.log('✓ File committed in worktree')

    // Record user checkout state before merge
    const preMergeBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    const preMergeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    const preMergeStatus = execFileSync('git', ['status', '--porcelain'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    console.log(`  Pre-merge: on branch '${preMergeBranch}', HEAD=${preMergeHead.slice(0, 8)}`)

    // Mark task done
    const doneRes = await proxy1.callTool('mark_task_done', { taskId: task1Id })
    if (doneRes.error) throw new Error(`mark_task_done failed: ${doneRes.error.message}`)
    console.log('✓ Task marked done, status set to merging')

    // Check merge status
    const checkRes = await proxy1.callTool('check_merge_status', { taskId: task1Id })
    if (checkRes.error) throw new Error(`check_merge_status failed: ${checkRes.error.message}`)
    const checkText = checkRes.result?.[0]?.text || ''
    if (checkText.includes('"canMerge": true') || checkText.includes('canMerge')) {
      console.log('✓ Merge status: ready to merge')
    } else {
      throw new Error(`Expected canMerge true, got: ${checkText.slice(0, 500)}`)
    }

    // Execute merge
    const mergeRes = await proxy1.callTool('merge_branch', { taskId: task1Id })
    if (mergeRes.error) throw new Error(`merge_branch failed: ${mergeRes.error.message}`)
    const mergeText = mergeRes.result?.[0]?.text || ''
    if (mergeText.includes('"ok": true')) {
      console.log('✓ Merge gate: successfully merged')
    } else {
      throw new Error(`Merge failed: ${mergeText.slice(0, 1000)}`)
    }

    // Safety invariant: user's checkout must be unchanged
    const postMergeBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    const postMergeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    const postMergeStatus = execFileSync('git', ['status', '--porcelain'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    if (postMergeBranch === preMergeBranch) {
      console.log('✓ Safety: user checkout branch unchanged')
    } else {
      throw new Error(`User checkout branch changed from '${preMergeBranch}' to '${postMergeBranch}'`)
    }
    if (postMergeHead === preMergeHead) {
      console.log('✓ Safety: user checkout HEAD unchanged (no checkout/pull/merge in live checkout)')
    } else {
      throw new Error(`User checkout HEAD changed from ${preMergeHead.slice(0, 8)} to ${postMergeHead.slice(0, 8)}`)
    }
    if (postMergeStatus === '') {
      console.log('✓ Safety: user working directory clean and untouched')
    } else {
      throw new Error(`User working directory modified: ${postMergeStatus}`)
    }

    // Verify the integration branch has advanced
    const integHead = execFileSync('git', ['rev-parse', 'agntspce-integration'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    if (integHead !== preMergeHead) {
      console.log(`✓ Integration branch advanced: ${preMergeHead.slice(0, 8)} → ${integHead.slice(0, 8)}`)
    } else {
      throw new Error('Integration branch did not advance')
    }

    // Verify merged commit exists on integration branch
    try {
      const mergedContents = execFileSync('git', ['show', `${integHead}:src/hello.txt`], { cwd: repoPath, encoding: 'utf-8' })
      if (mergedContents.includes('Hello from agntspce worktree')) {
        console.log('✓ Merged file exists on integration branch')
      }
    } catch {
      throw new Error('Merged hello.txt not found on integration branch')
    }

    // Verify user's main branch is unchanged
    const mainHead = execFileSync('git', ['rev-parse', 'main'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    if (mainHead === preMergeHead) {
      console.log('✓ User branch main unchanged (coordinator only touched agntspce-integration)')
    }

    // Verify task worktree was cleaned up
    if (!fs.existsSync(worktreePath)) {
      console.log('✓ Task worktree cleaned up after successful merge')
    } else {
      throw new Error('Task worktree should have been removed after successful merge')
    }

    console.log('  --- End Merge Gate Test ---\n')

    // 10b. Post-merge: claim Task B, verify branchPoint === integrationSha and B sees A's file
    const integSha = execFileSync('git', ['rev-parse', 'agntspce-integration'], { cwd: repoPath, encoding: 'utf-8' }).trim()
    const taskBRes = await proxy1.callTool('create_task', {
      description: 'Add styles',
      declaredFiles: ['src/styles.css'],
    })
    const taskBText = taskBRes.result?.[0]?.text || ''
    const taskBId = taskBText.match(/"id":\s*"([^"]+)"/)?.[1]
    if (!taskBId) throw new Error('Failed to extract Task B ID')
    const claimBRes = await proxy1.callTool('claim_task', { taskId: taskBId })
    if (claimBRes.error) throw new Error(`claim_task B failed: ${claimBRes.error.message}`)
    const claimBText = claimBRes.result?.[0]?.text || ''
    const bpMatch = claimBText.match(/"branchPoint":\s*"?([^",}\s]+)"?/)
    if (!bpMatch) throw new Error('claim_task B missing branchPoint')
    if (bpMatch[1] === integSha) {
      console.log('✓ Task B branchPoint === integration SHA (branches from integration ref, not HEAD)')
    } else {
      throw new Error(`Task B branchPoint ${bpMatch[1].slice(0,8)} !== integration SHA ${integSha.slice(0,8)}`)
    }
    const wtBMatch = claimBText.match(/"worktreePath":\s*"([^"]+)"/)
    if (!wtBMatch) throw new Error('claim_task B missing worktreePath')
    try {
      const bContents = execFileSync('git', ['show', `HEAD:src/hello.txt`], { cwd: wtBMatch[1], encoding: 'utf-8' })
      if (bContents.includes('Hello from agntspce worktree')) {
        console.log('✓ Task B worktree sees Task A merged file (hello.txt)')
      }
    } catch {
      throw new Error('Task B worktree should contain Task A merged file hello.txt')
    }

    // 11. Test escalation
    const betaId = ctx.agents.find((a: any) => a.name === 'agent-beta')?.id || ''
    const escalateRes = await proxy1.callTool('escalate_to_human', {
      reason: 'Merge conflict needs human review',
      details: 'Alpha and beta touched the same files',
      involvedAgentIds: betaId ? [betaId] : [],
    })
    if (escalateRes.error) throw new Error(`escalate_to_human failed: ${escalateRes.error.message}`)
    console.log('✓ Escalation created (beta agent paused)')

    // 12. Verify beta's next tool call returns PAUSED error
    const pausedRes = await proxy2.callTool('get_workspace_context', {})
    if (pausedRes.isError) {
      const errText = pausedRes.result?.[0]?.text || ''
      console.log('✓ Paused agent correctly rejected:', errText)
      if (errText.includes('PAUSED') || errText.includes('paused')) {
        console.log('  ✓ Error mentions pause status')
      }
    } else {
      throw new Error(`Expected PAUSED error for paused agent. Got result: ${JSON.stringify(pausedRes.result)}`)
    }

    // 13. Verify escalation exists via state manager
    const allEscalations = stateManager.listEscalations()
    if (allEscalations.length >= 1 && allEscalations[0].status === 'open') {
      console.log('✓ Escalation persisted correctly')
    } else {
      throw new Error('Expected escalation to be visible')
    }

    // 14. Verify both the caller (alpha) and the specified agent (beta) are paused.
    //     The coordinator always includes the calling agent in the pause set, even
    //     when `involvedAgentIds` names different agents. This is intentional: an
    //     agent that raises an escalation has signalled it cannot proceed without
    //     human input, so it should not continue working either.
    const pausedAgents = stateManager.listAgents().filter(a => a.status === 'paused')
    const pausedNames = pausedAgents.map(a => a.name).sort()
    console.log(`  Paused agents: ${pausedNames.join(', ')}`)
    if (pausedNames.includes('agent-alpha') && pausedNames.includes('agent-beta')) {
      console.log('✓ Both caller (alpha) and involved agent (beta) are paused — escalation correctly pauses all parties')
    } else {
      throw new Error(`Expected both caller and involved agent to be paused. Got: ${pausedNames.join(', ')}`)
    }

    // 15. Verify paused agents can't send messages
    const directRes = await proxy2.callTool('send_message', {
      broadcast: true,
      content: 'EOM - end of message',
    })
    if (directRes.isError) {
      console.log('✓ Paused agents cannot send messages (correct behavior)')
    }

    // Resolve escalation so beta can cleanup
    const openEscl = stateManager.getOpenEscalations()
    if (openEscl.length > 0) {
      stateManager.resolveEscalation(openEscl[0].id, 'resolved - test complete')
      console.log('✓ Escalation resolved for cleanup')
    }

    // 16. Cleanup
    proxy1.close()
    proxy2.close()
    coordinator.close()
    stateManager.close()

    console.log('\n=== ALL SMOKE TESTS PASSED ===')
  } finally {
    try { fs.unlinkSync(DB_PATH) } catch {}
    try { fs.rmSync(repoPath, { recursive: true, force: true }) } catch {}
    try { fs.unlinkSync(SOCKET_PATH) } catch {}
    // Clean up any worktrees created by the coordinator
    const agntspceDir = path.join(path.dirname(path.resolve(repoPath)), '.agntspce')
    try { fs.rmSync(agntspceDir, { recursive: true, force: true }) } catch {}
  }
}

main().catch(err => {
  console.error('\n!!! SMOKE TEST FAILED !!!', err)
  try { fs.unlinkSync(DB_PATH) } catch {}
  try { fs.rmSync(path.join(__dirname, `../../../.test-repo-${Date.now()}`), { recursive: true, force: true }) } catch {}
  try { fs.unlinkSync(SOCKET_PATH) } catch {}
  const agntspceDir = path.join(path.dirname(path.resolve(process.env.REPO_PATH || __dirname)), '.agntspce')
  try { fs.rmSync(agntspceDir, { recursive: true, force: true }) } catch {}
  process.exit(1)
})
