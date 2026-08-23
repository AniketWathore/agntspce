import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface FileIndexEntry {
  file: string
  imports: string[]
  importedBy: string[]
  size: number
  mtimeMs: number
  touchedAt: number
}

export interface FileIndexData {
  version: number
  root: string
  scannedAt: number
  files: Record<string, FileIndexEntry>
}

const INDEX_VERSION = 1
const MAX_FILE_BYTES = 256 * 1024
const MAX_FILES = 20_000
const GIT_TIMEOUT = 10000

// Import-edge-only extractor (2.4). This is deliberately lightweight and
// deterministic — no LLM, no full AST. It handles the common import syntax
// for the languages agents work in most. Unknown/ambiguous edges are skipped
// rather than guessed (graphify honesty rule: never invent an edge).
function extractImports(rel: string, content: string): string[] {
  const imports: string[] = []
  const push = (m: string) => {
    if (!m || m.length > 200) return
    if (m.startsWith('.') || m.startsWith('/')) {
      imports.push(m)
    } else if (m.startsWith('@/')) {
      imports.push(m.slice(1))
    }
  }

  const ext = path.extname(rel).toLowerCase()

  if (/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(ext)) {
    for (const m of content.matchAll(/import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g)) push(m[1])
    for (const m of content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g)) push(m[1])
    for (const m of content.matchAll(/import\s+['"]([^'"]+)['"]/g)) push(m[1])
    for (const m of content.matchAll(/require\(\s*['"]([^'"]+)['"]/g)) push(m[1])
    for (const m of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) push(m[1])
  } else if (ext === '.py') {
    for (const m of content.matchAll(/^\s*(?:import|from)\s+([a-zA-Z_][\w.]*)/gm)) push(m[1])
  } else if (ext === '.go') {
    for (const m of content.matchAll(/(?:^|\n)\s*["']([^"']+)["']\s*$/gm)) push(m[1])
    for (const m of content.matchAll(/^\s*["']([^"']+)["']\s*$/gm)) push(m[1])
  } else if (ext === '.rs') {
    for (const m of content.matchAll(/\buse\s+([\w:]+)/g)) push(m[1])
    for (const m of content.matchAll(/\bmod\s+([\w]+)/g)) push(m[1])
  } else if (/\.(c|h|cpp|hpp|cc|hh|cxx)$/.test(ext)) {
    for (const m of content.matchAll(/#include\s*[<"]([^>"]+)[>"]/g)) push(m[1])
  } else if (ext === '.rb') {
    for (const m of content.matchAll(/\brequire(?:_relative)?\s*['"]([^'"]+)['"]/g)) push(m[1])
  } else if (ext === '.java') {
    for (const m of content.matchAll(/^\s*import\s+([\w.]+)/gm)) push(m[1])
  } else if (/\.(php)$/.test(ext)) {
    for (const m of content.matchAll(/\b(?:require|include)(?:_once)?\s*[(']?['"]([^'"]+)['"]/g)) push(m[1])
  }

  return Array.from(new Set(imports))
}

function isIgnored(rel: string): boolean {
  const base = rel.split('/')[0]
  const ignoreDirs = new Set(['.git', '.agntspce', 'node_modules', 'dist', 'build', '.next', '.vite', 'coverage', 'vendor', '.venv', 'venv', '__pycache__', '.cache', 'out', 'target'])
  if (ignoreDirs.has(base)) return true
  if (rel.includes('/node_modules/') || rel.includes('/.git/')) return true
  const basename = path.basename(rel)
  if (basename.startsWith('.') && basename !== '.gitignore') return true
  return false
}

const EXT_WHITELIST = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json',
  '.py', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.cc', '.hh', '.cxx',
  '.rb', '.java', '.php', '.vue', '.svelte',
])

export interface IndexStats {
  files: number
  edges: number
  skipped: number
}

// Lightweight file indexer (2.4): import edges only, stored as JSON under
// `.agntspce/file-index.json`. Scan once at workspace create, incremental
// update on git events. Never rescan the whole tree on incremental updates.
export class FileIndexer {
  private index: FileIndexData | null = null
  private root = ''
  private indexPath = ''

  constructor(repoPath?: string) {
    if (repoPath) this.setRoot(repoPath)
  }

  setRoot(repoPath: string): void {
    this.root = path.resolve(repoPath)
    this.indexPath = path.join(this.root, '.agntspce', 'file-index.json')
  }

  getRoot(): string {
    return this.root
  }

  private indexExists(): boolean {
    try {
      return fs.existsSync(this.indexPath)
    } catch {
      return false
    }
  }

  load(): boolean {
    if (!this.indexExists()) return false
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf-8')
      const data = JSON.parse(raw) as FileIndexData
      if (data.version !== INDEX_VERSION) return false
      this.index = data
      this.root = data.root
      this.indexPath = path.join(this.root, '.agntspce', 'file-index.json')
      return true
    } catch {
      return false
    }
  }

  private save(): void {
    if (!this.index) return
    try {
      fs.mkdirSync(path.dirname(this.indexPath), { recursive: true })
      fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 1), 'utf-8')
    } catch (err: any) {
      console.warn('[fileIndexer] save failed:', err?.message || err)
    }
  }

  // Full scan. Walk the repo once, extract import edges, persist.
  scan(repoPath?: string): IndexStats {
    if (repoPath) this.setRoot(repoPath)
    if (!this.root) return { files: 0, edges: 0, skipped: 0 }
    const files: Record<string, FileIndexEntry> = {}
    let skipped = 0
    const now = Date.now()

    const walk = (dir: string) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name)
        const rel = path.relative(this.root, full).split(path.sep).join('/')
        if (isIgnored(rel)) {
          if (ent.isDirectory()) skipped++
          continue
        }
        if (ent.isDirectory()) {
          walk(full)
        } else if (ent.isFile() && EXT_WHITELIST.has(path.extname(ent.name).toLowerCase())) {
          if (Object.keys(files).length >= MAX_FILES) return
          this.indexFile(files, rel, full, now)
        }
      }
    }

    walk(this.root)
    this.index = { version: INDEX_VERSION, root: this.root, scannedAt: now, files }
    this.resolveEdges()
    this.save()
    return { files: Object.keys(files).length, edges: this.countEdges(), skipped }
  }

  // Incremental update: re-index only the given files (from a git event like
  // `git status --porcelain` / diff output). Deleted files are removed.
  updateFiles(relPaths: string[], repoPath?: string): IndexStats {
    if (repoPath) this.setRoot(repoPath)
    if (!this.index) this.load()
    if (!this.index || !this.root) return { files: 0, edges: 0, skipped: 0 }
    const now = Date.now()
    for (const rel of relPaths) {
      const clean = rel.split(path.sep).join('/').replace(/^\.\//, '')
      const full = path.join(this.root, clean)
      if (isIgnored(clean) || !EXT_WHITELIST.has(path.extname(clean).toLowerCase())) continue
      try {
        if (!fs.existsSync(full)) {
          delete this.index.files[clean]
          continue
        }
        this.indexFile(this.index.files, clean, full, now)
      } catch {}
    }
    this.resolveEdges()
    this.save()
    return { files: Object.keys(this.index.files).length, edges: this.countEdges(), skipped: 0 }
  }

  // Update from a git status/diff command: parse changed paths and re-index.
  async updateFromGit(repoPath?: string): Promise<IndexStats> {
    if (repoPath) this.setRoot(repoPath)
    if (!this.root) return { files: 0, edges: 0, skipped: 0 }
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: this.root, timeout: GIT_TIMEOUT, maxBuffer: 10 * 1024 * 1024 })
      const paths: string[] = []
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue
        const p = line.slice(3).trim()
        if (p && !p.includes(' -> ')) paths.push(p)
      }
      return this.updateFiles(paths, this.root)
    } catch {
      return { files: 0, edges: 0, skipped: 0 }
    }
  }

  private indexFile(files: Record<string, FileIndexEntry>, rel: string, full: string, now: number): void {
    try {
      const stat = fs.statSync(full)
      if (stat.size > MAX_FILE_BYTES) return
      const content = fs.readFileSync(full, 'utf-8')
      files[rel] = {
        file: rel,
        imports: extractImports(rel, content),
        importedBy: [],
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        touchedAt: now,
      }
    } catch {}
  }

  // Resolve relative/aliased import targets into repo-relative paths and
  // populate the reverse `importedBy` edges. Unresolvable (bare package)
  // imports are left as-is but never create fake edges.
  private resolveEdges(): void {
    if (!this.index) return
    for (const key of Object.keys(this.index.files)) {
      this.index.files[key].importedBy = []
    }
    const files = this.index.files
    for (const rel of Object.keys(files)) {
      const entry = files[rel]
      const dir = path.posix.dirname(rel)
      const seen = new Set<string>()
      for (const imp of entry.imports) {
        if (seen.has(imp)) continue
        seen.add(imp)
        let target: string | null = null
        if (imp.startsWith('.')) {
          target = resolveToFile(path.posix.normalize(path.posix.join(dir, imp)), files)
        } else if (imp.startsWith('/')) {
          target = resolveToFile(normalizeRel(imp.slice(1)), files)
        } else {
          // alias like @/utils → resolve from root if it exists
          target = resolveToFile(normalizeRel(imp.replace(/^@\//, '')), files)
        }
        if (target && target !== rel) {
          files[target].importedBy.push(rel)
        }
      }
    }
    // dedupe importedBy
    for (const key of Object.keys(files)) {
      files[key].importedBy = Array.from(new Set(files[key].importedBy))
    }
  }

  private countEdges(): number {
    if (!this.index) return 0
    let n = 0
    for (const f of Object.values(this.index.files)) n += f.importedBy.length
    return n
  }

  // Connected-files slice: BFS over import edges (both directions), depth-limited,
  // with a hard node cap — never dump the whole graph. This is what the preamble
  // and context writers consume.
  getConnectedFiles(startRel: string, depth = 2, maxNodes = 20): { file: string; depth: number }[] {
    if (!this.index) this.load()
    if (!this.index) return []
    const start = normalizeRel(startRel)
    if (!this.index.files[start]) return []
    const result: { file: string; depth: number }[] = []
    const visited = new Set<string>([start])
    const queue: { file: string; depth: number }[] = [{ file: start, depth: 0 }]
    while (queue.length > 0 && result.length < maxNodes) {
      const cur = queue.shift()!
      if (cur.depth > 0) result.push({ file: cur.file, depth: cur.depth })
      if (cur.depth >= depth) continue
      const entry = this.index.files[cur.file]
      const neighbors = [...(entry?.imports || []).filter(t => this.index!.files[t]), ...(entry?.importedBy || [])]
      for (const nb of neighbors) {
        if (visited.has(nb)) continue
        visited.add(nb)
        queue.push({ file: nb, depth: cur.depth + 1 })
      }
    }
    return result
  }

  has(rel: string): boolean {
    if (!this.index) this.load()
    return !!this.index?.files[normalizeRel(rel)]
  }

  getIndex(): FileIndexData | null {
    return this.index
  }

  getStats(): IndexStats {
    if (!this.index) this.load()
    if (!this.index) return { files: 0, edges: 0, skipped: 0 }
    return { files: Object.keys(this.index.files).length, edges: this.countEdges(), skipped: 0 }
  }
}

function normalizeRel(p: string): string {
  let clean = p.split(path.sep).join('/')
  while (clean.startsWith('./')) clean = clean.slice(2)
  return clean
}

// Resolve an import specifier (without extension) to an actual indexed file:
// exact match, then common source extensions, then index-file fallback.
function resolveToFile(base: string, files: Record<string, FileIndexEntry>): string | null {
  const candidates = [base]
  const extless = !path.extname(base)
  if (extless) {
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.vue', '.svelte', '.py', '.rb', '.php']
    for (const ex of exts) candidates.push(base + ex)
    candidates.push(base + '/index.ts', base + '/index.tsx', base + '/index.js', base + '/index.jsx', base + '/index.mjs', base + '/index.cjs')
  }
  for (const c of candidates) {
    const norm = normalizeRel(c)
    if (files[norm]) return norm
  }
  return null
}
