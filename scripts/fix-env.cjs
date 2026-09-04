#!/usr/bin/env node
// fix-env.cjs — Ensures Windows system directories are present in PATH
// before electron-builder spawns powershell.exe.
//
// Root cause: app-builder-lib's NodeModulesCollector on Windows wraps
// `npm list` in `powershell.exe -EncodedCommand` (see node_modules/app-builder-lib/out/node-module-collector/nodeModulesCollector.js:324).
// If %PATH% lacks C:\Windows\System32\WindowsPowerShell\v1.0, Node's
// `child_process.spawn('powershell.exe', ...)` fails with ENOENT:
//   "Node module collector spawn (...) failed: spawn powershell.exe ENOENT"
// On this machine the Machine registry PATH was corrupted — it contained only
// Python/Node/Git entries and was missing the default Windows entries:
//
//   C:\Windows\system32
//   C:\Windows
//   C:\Windows\System32\Wbem
//   C:\Windows\System32\WindowsPowerShell\v1.0\
//   C:\Windows\System32\OpenSSH\
//
// This script patches process.env.PATH at runtime so the build works even
// when the persisted registry PATH is still broken. A permanent fix is
// scripts/fix-system-path.ps1 (run as Administrator) which also patched
// the current user's PATH.

const { spawnSync } = require('node:child_process');

function ensureWindowsSystemPath() {
  if (process.platform !== 'win32') return false;

  const required = [
    'C:\\Windows\\system32',
    'C:\\Windows',
    'C:\\Windows\\System32\\Wbem',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\',
    'C:\\Windows\\System32\\OpenSSH\\',
  ];

  const current = process.env.PATH || '';
  const lower = current.toLowerCase();
  const missing = required.filter((p) => !lower.includes(p.toLowerCase().replace(/\\+$/, '')));

  if (missing.length > 0) {
    console.log('[fix-env] Detected corrupted PATH — injecting missing system entries:');
    missing.forEach((p) => console.log('  +', p));
    process.env.PATH = current + ';' + required.join(';');
    // Also set Path for case-sensitive consumers
    process.env.Path = process.env.PATH;
    return true;
  }

  // Even if no obvious missing entry, verify powershell.exe is actually spawnable
  try {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'echo ok'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });
    if (r.error && r.error.code === 'ENOENT') throw r.error;
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      console.warn('[fix-env] powershell.exe still not found — prepending PowerShell directory');
      process.env.PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0;' + (process.env.PATH || '');
      process.env.Path = process.env.PATH;
      return true;
    }
  }
  return false;
}

const patched = ensureWindowsSystemPath();
if (patched) {
  console.log('[fix-env] PATH patched. electron-builder should now be able to spawn powershell.exe');
} else {
  console.log('[fix-env] PATH looks OK');
}

// Export for programmatic use
module.exports = { ensureWindowsSystemPath };
