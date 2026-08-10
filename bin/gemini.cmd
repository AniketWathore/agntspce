@echo off
rem Agent wrapper: intercepts agent CLI invocations for RTK tracking.
rem Passes through to the real binary; emits the agntspce marker.
setlocal
set "AGENT=%~n0"
set "SCRIPT_DIR=%~dp0"

rem Find real binary (skip wrapper dir to avoid recursion)
set "REAL_BIN="
for %%D in (%PATH%) do (
  if exist "%%D\%AGENT%.exe" (
    set "REAL_BIN=%%D\%AGENT%.exe"
    goto :found_real
  )
  if exist "%%D\%AGENT%.cmd" (
    set "REAL_BIN=%%D\%AGENT%.cmd"
    goto :found_real
  )
)
:found_real
if not defined REAL_BIN (
  set "REAL_BIN=%AGENT%"
)

echo agntspce $ %AGENT% %* 1>&2
exec "%REAL_BIN%" %*
