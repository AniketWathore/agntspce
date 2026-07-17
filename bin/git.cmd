@echo off
rem git wrapper - routes through the agntspce token-aware filter (Windows)
setlocal
set "SCRIPT_DIR=%~dp0"
if defined AGNTSPCE_NODE_PATH (set "NODE=%AGNTSPCE_NODE_PATH%") else (set "NODE=node")
if defined AGNTSPCE_WRAPPER_PATH (
  call "%AGNTSPCE_WRAPPER_PATH%" run git %*
) else (
  "%NODE%" "%SCRIPT_DIR%agntspce.mjs" run git %*
)
