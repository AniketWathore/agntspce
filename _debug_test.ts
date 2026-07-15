import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agntspce-dbg-'))
const repo = path.join(tmp, 'repo')
fs.mkdirSync(repo, { recursive: true })
execFileSync('git', ['init'], { cwd: repo, timeout: 10000 })
execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: repo, timeout: 10000 })
execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo, timeout: 10000 })
fs.writeFileSync(path.join(repo, 'package.json'), '{"n":"t"}')
execFileSync('git', ['add', '.'], { cwd: repo, timeout: 10000 })
execFileSync('git', ['commit', '-m', 'x'], { cwd: repo, timeout: 10000 })

const { ensureCoordinator } = await import('./electron/services/orchestration/bootstrap')
const r = await ensureCoordinator({ workspaceRoot: repo })
console.log('STATUS:', r.status, r.error || '')
if (r.coordinator) r.coordinator.close()
fs.rmSync(tmp, { recursive: true, force: true })
