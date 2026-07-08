#!/usr/bin/env node

import { spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// ── Filter Definitions ─────────────────────────────────────────

const BUILTIN_FILTERS = [
  {
    matchCommand: /^git\s+status\b/,
    stripAnsi: true,
    matchOutput: [{ pattern: /not a git repository/, message: 'Not a git repository' }],
    replace: [
      { pattern: /^## HEAD \(no branch\).*$/gm, replacement: 'HEAD (detached)' },
      { pattern: /^## (\S+?)(?:\.\.\.\S+)?\s+\[(.+)\]$/gm, replacement: '$1 [$2]' },
      { pattern: /^## (\S+?)\.\.\.\S+$/gm, replacement: '$1 [synced]' },
      { pattern: /^## (\S+)$/gm, replacement: '$1 (no upstream)' },
    ],
    stripLinesMatching: [/^\(use "git/, /^\(create\/copy/, /^\(use "git restore/, /^\(use "git add /],
    headLines: 50,
    onEmpty: 'clean',
  },
  {
    matchCommand: /^git\s+diff\b/,
    stripAnsi: true,
    truncateLinesAt: 500,
    headLines: 100,
    onEmpty: 'no changes',
  },
  {
    matchCommand: /^git\s+log\b/,
    stripAnsi: true,
    stripLinesMatching: [/^commit\s+[a-f0-9]{40}$/, /^Author:/, /^Date:/],
    truncateLinesAt: 200,
    headLines: 80,
    onEmpty: 'no commits',
  },
  {
    matchCommand: /^git\s+branch\b/,
    stripAnsi: true,
    stripLinesMatching: [/^$/],
    maxLines: 30,
  },
  {
    matchCommand: /^git\s+push\b/,
    stripAnsi: true,
    matchOutput: [
      { pattern: /Everything up-to-date/, message: 'ok (up-to-date)' },
      { pattern: /non-fast-forward/, message: 'push rejected' },
    ],
    stripLinesMatching: [/^Enumerating objects:/, /^Counting objects:/, /^Compressing objects:/, /^Writing objects:/, /^Delta compression/, /^Total\s+/, /^remote:/, /^Receiving objects:/, /^Resolving deltas:/],
    onEmpty: 'ok pushed',
  },
  {
    matchCommand: /^git\s+pull\b/,
    stripAnsi: true,
    matchOutput: [
      { pattern: /Already up to date/, message: 'ok (up-to-date)' },
      { pattern: /Already up-to-date/, message: 'ok (up-to-date)' },
    ],
    stripLinesMatching: [/^remote:/, /^From\s+/, /^Updating\s+/, /^Fast-forward/],
    onEmpty: 'ok pulled',
  },
  {
    matchCommand: /^git\s+add\b/,
    onEmpty: 'ok',
  },
  {
    matchCommand: /^git\s+commit\b/,
    stripAnsi: true,
    stripLinesMatching: [/^\[/, /^create mode/, /^delete mode/, /^\s+\d+ files? changed/, /^\d+ insertions?/, /^\d+ deletions?/],
    matchOutput: [
      { pattern: /nothing to commit/, message: 'nothing to commit' },
      { pattern: /no changes added/, message: 'no changes added' },
    ],
    onEmpty: 'ok committed',
  },
  {
    matchCommand: /^git\s+show\b/,
    stripAnsi: true,
    truncateLinesAt: 500,
    headLines: 80,
  },
  {
    matchCommand: /^npm\b/,
    stripAnsi: true,
    stripLinesMatching: [/^npm (WARN|notice)/, /^added \d+ package/, /^removed \d+ package/, /^changed \d+ package/],
    matchOutput: [
      { pattern: /up to date/, message: 'up to date' },
      { pattern: /found \d+ vulnerabilities/, message: 'has vulnerabilities' },
    ],
    headLines: 80,
    onEmpty: 'ok',
  },
  {
    matchCommand: /^cargo\b/,
    stripAnsi: true,
    stripLinesMatching: [/^Compiling /, /^Finished /, /^Downloading /, /^Fresh /, /^\s+Blocking/, /^\s+Updating/],
    headLines: 50,
    onEmpty: 'ok',
  },
  {
    matchCommand: /^ls\b/,
    stripAnsi: true,
    headLines: 60,
    tailLines: 10,
    maxLines: 100,
  },
  {
    matchCommand: /^tree\b/,
    stripAnsi: true,
    headLines: 80,
  },
  {
    matchCommand: /^docker\s+(ps|images)\b/,
    stripAnsi: true,
    headLines: 40,
    onEmpty: 'none',
  },
  {
    matchCommand: /^docker\s+build\b/,
    stripAnsi: true,
    stripLinesMatching: [/^Step \d+\//, /^ ---> /, /^ ---> [a-f0-9]{12}$/, /^Successfully built /, /^Successfully tagged /, /^\s*$/],
    matchOutput: [{ pattern: /Successfully built/, message: 'ok built' }],
    tailLines: 10,
    onEmpty: 'ok built',
  },
  {
    matchCommand: /^pip\b/,
    stripAnsi: true,
    stripLinesMatching: [/^Requirement already/, /^Collecting /, /^Downloading /, /^\s+Preparing /, /^\s+Installing /, /^Successfully installed /, /^Installed /],
    headLines: 20,
    onEmpty: 'ok',
  },
  {
    matchCommand: /^pytest\b/,
    stripAnsi: true,
    stripLinesMatching: [/^\.+s?$/, /^=+ (test|session|short|passed|failed|error|warnings)/, /^[\.FEs\b]+$/],
    headLines: 20,
    tailLines: 30,
    onEmpty: 'ok',
  },
  {
    matchCommand: /^(make|just)\b/,
    stripAnsi: true,
    matchOutput: [{ pattern: /Nothing to be done/, message: 'nothing to do' }],
    stripLinesMatching: [/^(make|just): (Entering|Leaving)/, /^\s*$/],
    tailLines: 20,
  },
  {
    matchCommand: /^kubectl\b/,
    stripAnsi: true,
    headLines: 60,
    truncateLinesAt: 300,
  },
  {
    matchCommand: /^terraform\b/,
    stripAnsi: true,
    matchOutput: [{ pattern: /No changes/, message: 'no changes' }],
    stripLinesMatching: [/^\s+\+(created)/, /^\s+~/, /^\s+-\s/],
    headLines: 40,
  },
]

function findFilter(command) {
  return BUILTIN_FILTERS.find(f => f.matchCommand.test(command))
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[\d;]*[A-Za-z]/g, '')
    .replace(/\x1b\][\s\S]*?(?:\x1b\\|\x07)/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4))
}

function applyFilter(filter, output) {
  let lines = output.split('\n')

  if (filter.stripAnsi) {
    lines = lines.map(l => stripAnsi(l))
  }

  if (filter.replace) {
    const blob = lines.join('\n')
    let result = blob
    for (const rule of filter.replace) {
      result = result.replace(rule.pattern, rule.replacement)
    }
    lines = result.split('\n')
  }

  if (filter.matchOutput) {
    const blob = lines.join('\n')
    for (const rule of filter.matchOutput) {
      if (rule.pattern.test(blob)) {
        return rule.message
      }
    }
  }

  if (filter.stripLinesMatching) {
    lines = lines.filter(line => !filter.stripLinesMatching.some(p => p.test(line)))
  }

  if (filter.truncateLinesAt) {
    lines = lines.map(l => l.length > filter.truncateLinesAt ? l.slice(0, filter.truncateLinesAt) + '...' : l)
  }

  const total = lines.length
  if (filter.headLines && filter.tailLines) {
    if (total > filter.headLines + filter.tailLines) {
      const head = lines.slice(0, filter.headLines)
      const tail = lines.slice(total - filter.tailLines)
      lines = [...head, `... (${total - filter.headLines - filter.tailLines} lines omitted)`, ...tail]
    }
  } else if (filter.headLines) {
    if (total > filter.headLines) {
      lines = [...lines.slice(0, filter.headLines), `... (${total - filter.headLines} lines omitted)`]
    }
  } else if (filter.tailLines) {
    if (total > filter.tailLines) {
      lines = [`... (${total - filter.tailLines} lines omitted)`, ...lines.slice(total - filter.tailLines)]
    }
  }

  if (filter.maxLines && lines.length > filter.maxLines) {
    const truncated = lines.length - filter.maxLines
    lines = [...lines.slice(0, filter.maxLines), `... (${truncated} lines truncated)`]
  }

  let result = lines.join('\n').trim()
  if (!result && filter.onEmpty) {
    result = filter.onEmpty
  }

  return result
}

function resolveBinary(name) {
  if (name.includes('/')) return name
  const originalPath = process.env.AGNTSPCE_ORIGINAL_PATH || process.env.PATH || ''
  const dirs = originalPath.split(':')
  for (const dir of dirs) {
    if (!dir) continue
    try {
      const fullPath = path.resolve(dir, name)
      fs.accessSync(fullPath, fs.constants.X_OK)
      const stat = fs.statSync(fullPath)
      if (stat.isFile()) return fullPath
    } catch {}
  }
  return name
}

// ── Subcommand: rewrite ────────────────────────────────────────

function cmdRewrite(command) {
  if (!command || !command.trim()) return command
  const filter = findFilter(command.trim())
  if (filter) {
    return `agntspce run ${command.trim()}`
  }
  return command.trim()
}

// ── Subcommand: run ────────────────────────────────────────────

function cmdRun(args) {
  if (args.length === 0) {
    process.exit(1)
  }

  const commandStr = args.join(' ')
  const filter = findFilter(commandStr)
  const binary = resolveBinary(args[0])

  const result = spawnSync(binary, args.slice(1), {
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: process.cwd(),
    env: { ...process.env, AGNTSPCE_RUN: '1' },
    maxBuffer: 50 * 1024 * 1024,
  })

  const stdout = result.stdout ? result.stdout.toString() : ''
  const stderr = result.stderr ? result.stderr.toString() : ''
  const raw = (stdout + stderr).trim()
  const exitCode = result.status ?? 0

  if (!filter) {
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    process.exit(exitCode)
  }

  const filtered = applyFilter(filter, raw)

  const origBytes = raw.length
  const filtBytes = filtered.length
  const origTokens = estimateTokens(raw)
  const filtTokens = estimateTokens(filtered)

  // Output: tag line + compressed output
  process.stdout.write('agntspce $ ' + commandStr + '\n')
  if (filtered) {
    process.stdout.write(filtered + '\n')
  }
  process.exit(exitCode)
}

// ── Entry Point ────────────────────────────────────────────────

const subcommand = process.argv[2]

if (subcommand === 'rewrite') {
  const command = process.argv.slice(3).join(' ')
  process.stdout.write(cmdRewrite(command))
} else if (subcommand === 'run') {
  cmdRun(process.argv.slice(3))
} else {
  process.exit(1)
}
