@echo off
rem agntspce - Token-aware command wrapper (Windows launcher)
rem Routes to the Node.js implementation in agntspce.mjs.
rem Uses AGNTSPCE_NODE_PATH (set by the Electron host) when available.
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "NODE=node"
if defined AGNTSPCE_NODE_PATH set "NODE=%AGNTSPCE_NODE_PATH%"
rem AGNTSPCE_NODE_PATH is the Electron binary (process.execPath); run it as plain Node.
set "ELECTRON_RUN_AS_NODE=1"
"%NODE%" "%SCRIPT_DIR%agntspce.mjs" %*
