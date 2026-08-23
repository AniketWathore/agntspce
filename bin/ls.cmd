@echo off
rem ls wrapper - routes through the agntspce token-aware filter (Windows)
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "NODE=node"
if defined AGNTSPCE_NODE_PATH set "NODE=%AGNTSPCE_NODE_PATH%"
rem AGNTSPCE_NODE_PATH is the Electron binary; run it as plain Node.
set "ELECTRON_RUN_AS_NODE=1"
rem Prefer the host-provided wrapper path, but only if it is a .cmd shim
rem (an extensionless POSIX script cannot be executed by cmd.exe).
set "WRAPPER=%SCRIPT_DIR%agntspce.cmd"
if defined AGNTSPCE_WRAPPER_PATH if /I "%AGNTSPCE_WRAPPER_PATH:~-4%"==".cmd" set "WRAPPER=%AGNTSPCE_WRAPPER_PATH%"
call "%WRAPPER%" run ls %*
