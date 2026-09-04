#!/usr/bin/env node
// run-electron-builder.cjs — Wrapper that fixes env then delegates to electron-builder
//
// Usage: node scripts/run-electron-builder.cjs [--flags for electron-builder]
// It first ensures the Windows PATH contains the system directories required
// to spawn powershell.exe (see fix-env.cjs), then spawns electron-builder
// with the patched environment.

require('./fix-env.cjs');

const { spawn } = require('node:child_process');
const path = require('node:path');

const args = process.argv.slice(2);

// Resolve electron-builder bin: prefer local node_modules/.bin/electron-builder
const localBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const { existsSync } = require('node:fs');
let cmd = localBin;
let cmdArgs = args;

if (!existsSync(localBin)) {
  // Fallback to npx
  cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  cmdArgs = ['electron-builder', ...args];
}

console.log(`[run-builder] Spawning: ${cmd} ${cmdArgs.join(' ')}`);

const child = spawn(cmd, cmdArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32', // needed for .cmd shims
});

child.on('close', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('[run-builder] Failed to spawn electron-builder:', err);
  process.exit(1);
});
