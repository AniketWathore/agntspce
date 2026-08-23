import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert'
import { describe, it, before, after } from 'node:test'
import {
  getWorkspaceRoot,
  getSocketPath,
  getDbPath,
  getDiscoveryPath,
  readDiscovery,
  writeDiscovery,
  clearDiscovery,
  isCoordinatorAlive,
  ensureCoordinator,
} from '../bootstrap'

const RUN_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agntspce-bootstrap-'))
const REPO_PATH = path.join(RUN_TMP, 'repo')
const SUBDIR = path.join(REPO_PATH, 'packages', 'my-pkg')

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init'], { cwd: dir, encoding: 'utf-8', timeout: 10000 })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, encoding: 'utf-8', timeout: 10000 })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, encoding: 'utf-8', timeout: 10000 })
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test\n')
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"test"}\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
  execFileSync('git', ['add', '.'], { cwd: dir, encoding: 'utf-8', timeout: 10000 })
  execFileSync('git', ['commit', '-m', 'Initial'], { cwd: dir, encoding: 'utf-8', timeout: 10000 })
}

before(() => {
  initRepo(REPO_PATH)
  fs.mkdirSync(SUBDIR, { recursive: true })
})

after(() => {
  fs.rmSync(RUN_TMP, { recursive: true, force: true })
})

describe('getWorkspaceRoot', () => {
  it('finds root from repo root', () => {
    assert.strictEqual(getWorkspaceRoot(REPO_PATH), REPO_PATH)
  })

  it('finds root from subdirectory', () => {
    assert.strictEqual(getWorkspaceRoot(SUBDIR), REPO_PATH)
  })

  it('returns null for random dir without markers', () => {
    // Use /.agntspce-external (no markers upward from /) to ensure clean isolation
    const cleanRoot = path.join('/', 'tmp', `agntspce-clean-${Date.now()}-${process.pid}`)
    const randomDir = path.join(cleanRoot, 'subdir')
    fs.mkdirSync(randomDir, { recursive: true })
    try {
      const result = getWorkspaceRoot(randomDir)
      assert.strictEqual(result, null)
    } finally {
      fs.rmSync(cleanRoot, { recursive: true, force: true })
    }
  })

  it('detects .agntspce directory as root marker', () => {
    const dir = path.join(RUN_TMP, `dot-agntspce-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(path.join(dir, '.agntspce'))
    try {
      assert.strictEqual(getWorkspaceRoot(dir), dir)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses cwd when no startPath given', () => {
    const cwd = process.cwd()
    const expected = getWorkspaceRoot(cwd)
    assert.strictEqual(getWorkspaceRoot(), expected)
  })
})

describe('getSocketPath', () => {
  it('returns consistent path for same root', () => {
    const a = getSocketPath(REPO_PATH)
    const b = getSocketPath(REPO_PATH)
    assert.strictEqual(a, b)
  })

  it('returns different paths for different roots', () => {
    const other = path.join(RUN_TMP, `other-${Date.now()}`)
    fs.mkdirSync(other, { recursive: true })
    try {
      const a = getSocketPath(REPO_PATH)
      const b = getSocketPath(other)
      assert.notStrictEqual(a, b)
    } finally {
      try { fs.rmSync(other, { recursive: true, force: true }) } catch {}
    }
  })

  it('uses named pipe on Windows', () => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const result = getSocketPath(REPO_PATH)
      assert.ok(result.startsWith('\\\\.\\pipe\\agntspce-'), `got ${result}`)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('uses tmpdir socket on non-Windows', () => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    try {
      const result = getSocketPath(REPO_PATH)
      assert.ok(result.endsWith('.sock'), `got ${result}`)
      // Result should live in os.tmpdir() — use path prefix, not string start
      assert.ok(result.startsWith(os.tmpdir().replace(/\/+$/, '')), `got ${result}`)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })
})

describe('getDbPath', () => {
  it('returns path inside .agntspce', () => {
    const result = getDbPath(REPO_PATH)
    assert.ok(result.startsWith(REPO_PATH))
    assert.ok(result.endsWith('coordinator.db'))
    assert.ok(result.includes('.agntspce'))
  })
})

describe('getDiscoveryPath', () => {
  it('returns path inside .agntspce', () => {
    const result = getDiscoveryPath(REPO_PATH)
    assert.ok(result.startsWith(REPO_PATH))
    assert.ok(result.endsWith('coordinator.json'))
    assert.ok(result.includes('.agntspce'))
  })
})

describe('read/write/clear discovery', () => {
  const wsRoot = path.join(RUN_TMP, `discovery-test-${Date.now()}`)

  before(() => {
    fs.mkdirSync(wsRoot, { recursive: true })
  })

  after(() => {
    fs.rmSync(wsRoot, { recursive: true, force: true })
  })

  it('returns null when no discovery file', () => {
    assert.strictEqual(readDiscovery(wsRoot), null)
  })

  it('writes and reads discovery info', () => {
    const info = {
      pid: 12345,
      socketPath: '/tmp/test.sock',
      dbPath: path.join(wsRoot, '.agntspce', 'coordinator.db'),
      workspaceRoot: wsRoot,
      startedAt: Date.now(),
    }
    writeDiscovery(info)
    const read = readDiscovery(wsRoot)
    assert.deepStrictEqual(read, info)
  })

  it('clears discovery', () => {
    clearDiscovery(wsRoot)
    assert.strictEqual(readDiscovery(wsRoot), null)
  })
})

describe('isCoordinatorAlive', () => {
  it('returns true for current process', () => {
    const info = {
      pid: process.pid,
      socketPath: '/tmp/test.sock',
      dbPath: '/tmp/test.db',
      workspaceRoot: REPO_PATH,
      startedAt: Date.now(),
    }
    assert.ok(isCoordinatorAlive(info))
  })

  it('returns false for nonexistent PID', () => {
    const info = {
      pid: 999_999_999,
      socketPath: '/tmp/test.sock',
      dbPath: '/tmp/test.db',
      workspaceRoot: REPO_PATH,
      startedAt: Date.now(),
    }
    assert.ok(!isCoordinatorAlive(info))
  })
})

describe('ensureCoordinator', () => {
  const wsRoot = path.join(RUN_TMP, `ensure-${Date.now()}`)
  let coordRef: { close: () => void } | null = null

  before(() => {
    initRepo(wsRoot)
  })

  after(() => {
    if (coordRef) {
      coordRef.close()
      coordRef = null
    }
    const disc = readDiscovery(wsRoot)
    if (disc) {
      try { fs.unlinkSync(disc.socketPath) } catch {}
    }
    clearDiscovery(wsRoot)
    try { fs.rmSync(wsRoot, { recursive: true, force: true }) } catch {}
  })

  it('starts coordinator in workspace root', async () => {
    const result = await ensureCoordinator({ workspaceRoot: wsRoot })
    assert.strictEqual(result.status, 'started')
    assert.ok(result.coordinator)
    assert.ok(result.stateManager)
    assert.strictEqual(result.workspaceRoot, wsRoot)

    // Store coordinator reference for cleanup
    coordRef = result.coordinator

    // Discovery file exists
    const disc = readDiscovery(wsRoot)
    assert.ok(disc)
    assert.strictEqual(disc.pid, process.pid)
    assert.ok(disc.socketPath.endsWith('.sock'))
  })

  it('detects already running coordinator', async () => {
    const result = await ensureCoordinator({ workspaceRoot: wsRoot })
    assert.strictEqual(result.status, 'already_running')
    assert.strictEqual(result.workspaceRoot, wsRoot)
  })

  it('clears stale discovery and starts fresh', async () => {
    // Clear previous coordinator first
    if (coordRef) {
      coordRef.close()
      coordRef = null
    }

    // Write stale discovery
    writeDiscovery({
      pid: 999_999_999,
      socketPath: getSocketPath(wsRoot),
      dbPath: getDbPath(wsRoot),
      workspaceRoot: wsRoot,
      startedAt: 0,
    })

    const result = await ensureCoordinator({ workspaceRoot: wsRoot })
    assert.strictEqual(result.status, 'started')
    assert.ok(result.coordinator)
    assert.ok(result.stateManager)
    coordRef = result.coordinator
  })

  it('starts coordinator for explicit workspaceRoot even without markers', async () => {
    const cleanRoot = path.join('/', 'tmp', `agntspce-clean-${Date.now()}-${process.pid}`)
    const randomDir = path.join(cleanRoot, 'subdir')
    fs.mkdirSync(randomDir, { recursive: true })
    try {
      // Explicit workspaceRoot bypasses marker detection; starts coordinator there
      const result = await ensureCoordinator({ workspaceRoot: randomDir })
      assert.strictEqual(result.status, 'started')
      assert.ok(result.coordinator)
      assert.ok(result.stateManager)
      assert.strictEqual(result.workspaceRoot, randomDir)
      result.coordinator!.close()
    } finally {
      try { fs.rmSync(cleanRoot, { recursive: true, force: true }) } catch {}
    }
  })
})
