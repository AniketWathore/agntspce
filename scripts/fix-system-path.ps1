# fix-system-path.ps1 — Permanently repairs the Windows Machine PATH
# Run as Administrator: Right-click PowerShell -> Run as Administrator -> .\scripts\fix-system-path.ps1
#
# The Machine PATH on this system was found corrupted on 2026-09-01: it contained only
# Python/Node/Git entries and was missing the default Windows system directories.
# Without those entries, electron-builder cannot spawn powershell.exe (ENOENT) and
# many other tools (where, cmd helpers) also break.
#
# This script prepends the missing system entries if they are not already present.
# It also repairs the current User PATH similarly (no admin needed for User).

$ErrorActionPreference = 'Stop'

$required = @(
  'C:\Windows\system32',
  'C:\Windows',
  'C:\Windows\System32\Wbem',
  'C:\Windows\System32\WindowsPowerShell\v1.0\',
  'C:\Windows\System32\OpenSSH\'
)

function Test-IsAdmin {
  return ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Repair-Path($scope) {
  $current = [Environment]::GetEnvironmentVariable('PATH', $scope)
  if (-not $current) { $current = '' }
  $lower = $current.ToLower()
  $missing = @()
  foreach ($p in $required) {
    $key = $p.TrimEnd('\').ToLower()
    if (-not $lower.Contains($key)) { $missing += $p }
  }
  if ($missing.Count -eq 0) {
    Write-Host "[$scope] PATH already contains all system entries — no change needed." -ForegroundColor Green
    return
  }
  Write-Host "[$scope] Missing entries:" -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host "  + $_" }
  $new = ($required -join ';') + ';' + $current
  # Deduplicate while preserving order
  $parts = $new -split ';' | Where-Object { $_ -and $_.Trim() -ne '' }
  $seen = @{}
  $deduped = @()
  foreach ($part in $parts) {
    $k = $part.TrimEnd('\').ToLower()
    if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $deduped += $part }
  }
  $final = $deduped -join ';'
  [Environment]::SetEnvironmentVariable('PATH', $final, $scope)
  Write-Host "[$scope] PATH repaired successfully." -ForegroundColor Green
  Write-Host "[$scope] New PATH length: $($final.Length)"
}

Write-Host "=== AgntSpce PATH Repair ===" -ForegroundColor Cyan
Write-Host "Required system entries:"
$required | ForEach-Object { Write-Host "  $_" }

# Always repair User (no admin needed)
Repair-Path -scope 'User'

# Repair Machine only if admin
if (Test-IsAdmin) {
  Repair-Path -scope 'Machine'
} else {
  Write-Host ""
  Write-Host "[Machine] Skipped — not running as Administrator." -ForegroundColor Yellow
  Write-Host "To fix the Machine PATH permanently for all users, re-run this script as Administrator:"
  Write-Host "  Right-click PowerShell -> Run as Administrator"
  Write-Host "  .\scripts\fix-system-path.ps1"
  Write-Host ""
  Write-Host "The User PATH fix already applied will allow the current user to build"
  Write-Host "after a logoff/logon (or reboot). For immediate builds without reboot,"
  Write-Host "the project wrapper scripts/fix-env.cjs and scripts/run-electron-builder.cjs"
  Write-Host "patch PATH at runtime automatically."
}

Write-Host ""
Write-Host "Done. Please close and reopen your terminal (or log off/on) for changes to take full effect." -ForegroundColor Cyan
