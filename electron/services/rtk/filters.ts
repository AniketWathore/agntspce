import { FilterDefinition } from './tomlFilter'

export const BUILTIN_FILTERS: Record<string, FilterDefinition> = {
  'git-status': {
    description: 'Compact git status output',
    matchCommand: '^git\\s+status\\b',
    stripAnsi: true,
    matchOutput: [
      { pattern: 'not a git repository', message: 'Not a git repository' },
    ],
    replace: [
      { pattern: '^## HEAD \\(no branch\\).*$', replacement: 'HEAD (detached)' },
      { pattern: '^## (\\S+?)(?:\\.\\.\\.\\S+)?\\s+\\[(.+)\\]$', replacement: '$1 [$2]' },
      { pattern: '^## (\\S+?)\\.\\.\\.\\S+$', replacement: '$1 [synced]' },
      { pattern: '^## (\\S+)$', replacement: '$1 (no upstream)' },
    ],
    stripLinesMatching: [
      '^\\(use "git',
      '^\\(create/copy',
      '^\\(use "git restore',
      '^\\(use "git add',
    ],
    headLines: 50,
    onEmpty: 'clean',
  },

  'git-diff': {
    description: 'Compact git diff output',
    matchCommand: '^git\\s+diff\\b',
    stripAnsi: true,
    truncateLinesAt: 500,
    headLines: 100,
    onEmpty: 'no changes',
  },

  'git-log': {
    description: 'Compact git log output',
    matchCommand: '^git\\s+log\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^commit\\s+[a-f0-9]{40}$',
      '^Author:',
      '^Date:',
    ],
    truncateLinesAt: 200,
    headLines: 80,
    onEmpty: 'no commits',
  },

  'git-branch': {
    description: 'Compact git branch output',
    matchCommand: '^git\\s+branch\\b',
    stripAnsi: true,
    stripLinesMatching: ['^$'],
    maxLines: 30,
  },

  'git-push': {
    description: 'Compact git push output',
    matchCommand: '^git\\s+push\\b',
    stripAnsi: true,
    matchOutput: [
      { pattern: 'Everything up-to-date', message: 'ok (up-to-date)' },
      { pattern: 'non-fast-forward', message: 'push rejected' },
    ],
    stripLinesMatching: [
      '^Enumerating objects:',
      '^Counting objects:',
      '^Compressing objects:',
      '^Writing objects:',
      '^Delta compression',
      '^Total\\s+',
      '^remote:',
      '^Receiving objects:',
      '^Resolving deltas:',
    ],
    onEmpty: 'ok pushed',
  },

  'git-pull': {
    description: 'Compact git pull output',
    matchCommand: '^git\\s+pull\\b',
    stripAnsi: true,
    matchOutput: [
      { pattern: 'Already up to date', message: 'ok (up-to-date)' },
      { pattern: 'Already up-to-date', message: 'ok (up-to-date)' },
    ],
    stripLinesMatching: [
      '^remote:',
      '^From\\s+',
      '^Updating\\s+',
      '^Fast-forward',
    ],
    onEmpty: 'ok pulled',
  },

  'git-add': {
    description: 'Compact git add output',
    matchCommand: '^git\\s+add\\b',
    onEmpty: 'ok',
  },

  'git-commit': {
    description: 'Compact git commit output',
    matchCommand: '^git\\s+commit\\b',
    stripAnsi: true,
    matchOutput: [
      { pattern: 'nothing to commit', message: 'nothing to commit' },
      { pattern: '^\\[', message: 'ok committed' },
    ],
    stripLinesMatching: [
      '^$',
      '^create mode',
      '^delete mode',
    ],
    onEmpty: 'ok',
  },

  'git-fetch': {
    description: 'Compact git fetch output',
    matchCommand: '^git\\s+fetch\\b',
    matchOutput: [
      { pattern: 'Everything up-to-date', message: 'ok fetched' },
    ],
    stripLinesMatching: [
      '^remote:',
      '^From\\s+',
      '^\\s+[a-f0-9]+\\.\\.',
    ],
    onEmpty: 'ok fetched',
  },

  'npm-test': {
    description: 'Compact npm test output',
    matchCommand: '^npm\\s+test\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^>\\s+',
      '^npm \\w+ using',
      '^\\s+$',
    ],
    tailLines: 30,
    onEmpty: 'ok',
  },

  'npm-run': {
    description: 'Compact npm run output',
    matchCommand: '^npm\\s+run\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^>\\s+',
      '^npm \\w+ using',
      '^\\s+$',
    ],
    tailLines: 30,
    onEmpty: 'ok',
  },

  'npm-install': {
    description: 'Compact npm install output',
    matchCommand: '^npm\\s+install\\b',
    stripAnsi: true,
    matchOutput: [
      { pattern: 'up to date', message: 'ok (up-to-date)' },
      { pattern: 'added \\d+', message: 'ok installed' },
    ],
    stripLinesMatching: [
      '^npm \\w+ using',
      '^\\s+$',
      '^added \\d+',
      '^removed \\d+',
      '^changed \\d+',
      '^audited \\d+',
      '^found \\d+',
    ],
    onEmpty: 'ok',
  },

  'npx': {
    description: 'Compact npx output',
    matchCommand: '^npx\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^Need to install',
      '^npm \\w+ using',
    ],
    maxLines: 200,
  },

  'cargo-build': {
    description: 'Compact cargo build output',
    matchCommand: '^cargo\\s+build\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s+(Compiling|Downloading|Fetching|Checking)\\s+',
      '^\\s+Finished\\s+',
      '^\\s+$',
    ],
    tailLines: 50,
    onEmpty: 'ok',
  },

  'cargo-test': {
    description: 'Compact cargo test output',
    matchCommand: '^cargo\\s+test\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s+(Compiling|Downloading|Fetching|Checking)\\s+',
      '^\\s+Finished\\s+',
      '^\\s+$',
      '^\\s+Running\\s+',
    ],
    tailLines: 50,
    onEmpty: 'ok',
  },

  'cargo-check': {
    description: 'Compact cargo check output',
    matchCommand: '^cargo\\s+check\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s+(Compiling|Checking|Downloading)\\s+',
      '^\\s+Finished\\s+',
      '^\\s+$',
    ],
    tailLines: 50,
    onEmpty: 'ok (no issues)',
  },

  'cargo-clippy': {
    description: 'Compact cargo clippy output',
    matchCommand: '^cargo\\s+clippy\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s+(Compiling|Checking|Downloading)\\s+',
      '^\\s+Finished\\s+',
      '^\\s+$',
    ],
    tailLines: 50,
  },

  'ls': {
    description: 'Compact ls output',
    matchCommand: '^ls\\b',
    stripAnsi: true,
    stripEmpty: true,
    headLines: 50,
    onEmpty: '(empty)',
  },

  'find': {
    description: 'Compact find output',
    matchCommand: '^find\\b',
    headLines: 100,
    onEmpty: 'no matches',
  },

  'grep': {
    description: 'Compact grep output',
    matchCommand: '^(grep|rg|ripgrep)\\b',
    headLines: 100,
    onEmpty: 'no matches',
  },

  'tree': {
    description: 'Compact tree output',
    matchCommand: '^tree\\b',
    headLines: 80,
    onEmpty: '(empty)',
  },

  'docker-ps': {
    description: 'Compact docker ps output',
    matchCommand: '^docker\\s+ps\\b',
    stripAnsi: true,
    stripLinesMatching: ['^$'],
    headLines: 30,
    onEmpty: 'no containers',
  },

  'docker-images': {
    description: 'Compact docker images output',
    matchCommand: '^docker\\s+images\\b',
    stripLinesMatching: ['^$'],
    headLines: 30,
  },

  'kubectl-get': {
    description: 'Compact kubectl get output',
    matchCommand: '^kubectl\\s+get\\b',
    stripAnsi: true,
    stripLinesMatching: ['^$'],
    headLines: 50,
  },

  'make': {
    description: 'Compact make output',
    matchCommand: '^make\\b',
    stripLinesMatching: [
      '^make\\[\\d+\\]:',
      '^\\s*$',
      '^Nothing to be done',
    ],
    maxLines: 50,
    onEmpty: 'make: ok',
  },

  'pytest': {
    description: 'Compact pytest output',
    matchCommand: '^pytest\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s*$',
      '^=+\\s+',
      '^-+\\s+',
      '^platform\\s+',
      '^rootdir:\\s+',
      '^plugins:\\s+',
      '^collected\\s+',
    ],
    tailLines: 50,
  },

  'ruff': {
    description: 'Compact ruff output',
    matchCommand: '^ruff\\b',
    stripAnsi: true,
    stripLinesMatching: ['^\\s*$'],
    maxLines: 100,
    onEmpty: 'ok (no issues)',
  },

  'tsc': {
    description: 'Compact TypeScript compiler output',
    matchCommand: '^tsc\\b',
    stripAnsi: true,
    stripLinesMatching: ['^\\s*$'],
    maxLines: 100,
    onEmpty: 'ok (no errors)',
  },

  'eslint': {
    description: 'Compact eslint output',
    matchCommand: '^eslint\\b',
    stripAnsi: true,
    stripLinesMatching: ['^\\s*$'],
    maxLines: 100,
    onEmpty: 'ok (no issues)',
  },

  'prettier': {
    description: 'Compact prettier output',
    matchCommand: '^prettier\\b',
    stripAnsi: true,
    stripLinesMatching: ['^\\s*$'],
    maxLines: 100,
    onEmpty: 'ok (no issues)',
  },

  'vitest': {
    description: 'Compact vitest output',
    matchCommand: '^vitest\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s*$',
      '^\\s+stdout',
      '^\\s+stderr',
    ],
    tailLines: 50,
  },

  'jest': {
    description: 'Compact jest output',
    matchCommand: '^jest\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s*$',
      '^(PASS|FAIL)\\s+',
    ],
    tailLines: 50,
  },

  'playwright': {
    description: 'Compact playwright output',
    matchCommand: '^(playwright|npx\\s+playwright)\\b',
    stripAnsi: true,
    stripLinesMatching: ['^\\s*$'],
    tailLines: 50,
  },

  'go-test': {
    description: 'Compact go test output',
    matchCommand: '^go\\s+test\\b',
    stripAnsi: true,
    stripLinesMatching: ['^(ok|FAIL)\\s+'],
    tailLines: 30,
    onEmpty: 'ok',
  },

  'go-build': {
    description: 'Compact go build output',
    matchCommand: '^go\\s+build\\b',
    stripAnsi: true,
    onEmpty: 'ok',
  },

  'pip-install': {
    description: 'Compact pip install output',
    matchCommand: '^pip\\s+install\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^\\s+$',
      '^Collecting\\s+',
      '^Downloading\\s+',
      '^Installing collected',
      '^Successfully installed',
      '^Requirement already',
    ],
    tailLines: 20,
    onEmpty: 'ok installed',
  },

  'pip-freeze': {
    description: 'Compact pip freeze output',
    matchCommand: '^pip\\s+freeze\\b',
    headLines: 50,
  },

  'ps': {
    description: 'Compact ps output',
    matchCommand: '^ps\\b',
    headLines: 30,
    stripLinesMatching: ['^\\s*$'],
  },

  'df': {
    description: 'Compact df output',
    matchCommand: '^df\\b',
    headLines: 20,
    stripLinesMatching: ['^\\s*$'],
  },

  'du': {
    description: 'Compact du output',
    matchCommand: '^du\\b',
    headLines: 30,
  },

  'env': {
    description: 'Compact env output',
    matchCommand: '^env\\b',
    stripLinesMatching: ['^\\s*$'],
    maxLines: 50,
  },

  'cat': {
    description: 'Compact cat output (large files)',
    matchCommand: '^cat\\b',
    headLines: 100,
  },

  'wc': {
    description: 'Compact wc output',
    matchCommand: '^wc\\b',
    onEmpty: '0',
  },

  'curl': {
    description: 'Compact curl output',
    matchCommand: '^curl\\b',
    stripLinesMatching: [
      '^\\s+$',
      '^\\s+%\\s+Total',
      '^\\s+\\d+\\s+\\d+',
    ],
    maxLines: 200,
  },

  'wget': {
    description: 'Compact wget output',
    matchCommand: '^wget\\b',
    stripLinesMatching: [
      '^--\\d{4}-\\d{2}-\\d{2}',
      '^Resolving\\s+',
      '^Connecting to\\s+',
      '^HTTP request',
      '^Length:',
      '^Saving to:',
      '^\\s+[0-9]+%',
    ],
    maxLines: 50,
  },

  'terraform-plan': {
    description: 'Compact terraform plan output',
    matchCommand: '^terraform\\s+plan\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^Refreshing state',
      '^Acquiring state lock',
      '^Releasing state lock',
      '^\\(use',
      '^\\s*$',
    ],
    tailLines: 30,
  },

  'terraform-apply': {
    description: 'Compact terraform apply output',
    matchCommand: '^terraform\\s+apply\\b',
    stripAnsi: true,
    stripLinesMatching: [
      '^Refreshing state',
      '^Acquiring state lock',
      '^Releasing state lock',
      '^Apply complete',
      '^\\s*$',
    ],
    tailLines: 30,
  },

  'ping': {
    description: 'Compact ping output',
    matchCommand: '^ping\\b',
    stripLinesMatching: ['^PING\\s+'],
    tailLines: 5,
    onEmpty: 'ok',
  },
}

export const RUST_HANDLED_COMMANDS = new Set([
  'ls', 'tree', 'read', 'smart', 'git', 'gh', 'aws', 'psql', 'pnpm',
  'err', 'test', 'json', 'deps', 'env', 'find', 'diff', 'log',
  'docker', 'kubectl', 'summary', 'grep', 'wget', 'wc', 'gain',
  'config', 'vitest', 'prisma', 'tsc', 'next', 'lint', 'prettier',
  'format', 'playwright', 'cargo', 'npm', 'npx', 'curl', 'ruff',
  'pytest', 'mypy', 'pip', 'go', 'golangci-lint', 'make',
])
