@echo off
rem ls wrapper - routes through the agntspce token-aware filter (Windows)
setlocal
set "SCRIPT_DIR=%~dp0"
if defined AGNTSPCE_NODE_PATH (set "NODE=%AGNTSPCE_NODE_PATH%") else (set "NODE=node")
rem AGNTSPCE_NODE_PATH is the Electron binary; run it as plain Node.
set "ELECTRON_RUN_AS_NODE=1"
if defined AGNTSPCE_WRAPPER_PATH (
  call "%AGNTSPCE_WRAPPER_PATH%" run ls %*
) else (
  "%NODE%" "%SCRIPT_DIR%agntspce.mjs" run ls %*
)
