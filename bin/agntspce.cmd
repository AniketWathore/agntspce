@echo off
rem agntspce - Token-aware command wrapper (Windows launcher)
rem Routes to the Node.js implementation in agntspce.mjs.
rem Uses AGNTSPCE_NODE_PATH (set by the Electron host) when available.
rem Bare commands like "agntspce git status" default to "run git status".
setlocal
set "SCRIPT_DIR=%~dp0"
if defined AGNTSPCE_NODE_PATH (set "NODE=%AGNTSPCE_NODE_PATH%") else (set "NODE=node")
echo %* | findstr /r "^rewrite ^run " >nul
if errorlevel 1 (
  "%NODE%" "%SCRIPT_DIR%agntspce.mjs" run %*
) else (
  "%NODE%" "%SCRIPT_DIR%agntspce.mjs" %*
)
