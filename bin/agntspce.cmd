@echo off
rem agntspce - Token-aware command wrapper (Windows launcher)
rem Routes to the Node.js implementation in agntspce.mjs.
rem Uses AGNTSPCE_NODE_PATH (set by the Electron host) when available.
setlocal
set "SCRIPT_DIR=%~dp0"
if defined AGNTSPCE_NODE_PATH (set "NODE=%AGNTSPCE_NODE_PATH%") else (set "NODE=node")
"%NODE%" "%SCRIPT_DIR%agntspce.mjs" %*
