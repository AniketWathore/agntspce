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
rem Prefer .exe over .cmd/.bat. Skip hits inside this wrapper directory and
rem any other agntspce wrapper bin (app.asar, agntspce-main) to avoid recursion
rem when current directory is a wrapper bin (e.g. manual test in D:\...\bin).
for %%E in (.exe .cmd .bat) do (
  if not defined REAL_BIN (
    for /f "delims=" %%F in ('%WHERE_EXE% %AGENT%%%E 2^>nul') do (
      if not defined REAL_BIN (
        echo %%F | findstr /I /C:"app.asar" >nul
        if errorlevel 1 (
          echo %%F | findstr /I /C:"agntspce-main" >nul
          if errorlevel 1 (
            if /I not "%%~dpF"=="%SCRIPT_DIR%" set "REAL_BIN=%%F"
          )
        )
      )
    )
  )
)

if not defined REAL_BIN (
  echo agntspce: '%AGENT%' not found on PATH 1>&2
  exit /b 127
)

echo agntspce $ %AGENT% %* 1>&2
endlocal & "%REAL_BIN%" %*
