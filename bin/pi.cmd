@echo off
rem Agent wrapper: intercepts agent CLI invocations for RTK tracking.
rem Passes through to the real binary; emits the agntspce marker.
setlocal EnableExtensions
set "AGENT=%~n0"
set "SCRIPT_DIR=%~dp0"
set "REAL_BIN="
set "WHERE_EXE=where.exe"
if exist "%SystemRoot%\System32\where.exe" set "WHERE_EXE=%SystemRoot%\System32\where.exe"

rem Resolve the real binary via where.exe (returns PATH-ordered matches).
rem Prefer .exe over .bat/.cmd. Skip hits inside this wrapper directory to
rem avoid recursion. for /f keeps entries with spaces/parentheses intact.
for %%E in (.exe .bat .cmd) do (
  if not defined REAL_BIN (
    for /f "delims=" %%F in ('%WHERE_EXE% %AGENT%%%E 2^>nul') do (
      if not defined REAL_BIN if /I not "%%~dpF"=="%SCRIPT_DIR%" set "REAL_BIN=%%F"
    )
  )
)

if not defined REAL_BIN (
  echo agntspce: '%AGENT%' not found on PATH 1>&2
  exit /b 127
)

echo agntspce $ %AGENT% %* 1>&2
endlocal & "%REAL_BIN%" %*
