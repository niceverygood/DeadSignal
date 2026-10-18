@echo off
setlocal
set "DS_NODE=%~dp0..\..\work\node22\node-v22.23.3-win-x64"
if exist "%DS_NODE%\node.exe" set "PATH=%DS_NODE%;%PATH%"
cd /d "%~dp0"
call npm.cmd start %*
