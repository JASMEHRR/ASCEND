@echo off
REM Safe commit + push helper for the ASCEND repo.
REM Usage:  push.bat "your commit message"
REM If no message is given, a timestamped default is used.
cd /d "%~dp0"

REM Prefer git on PATH; fall back to the known install location.
set "GIT=git"
where git >nul 2>nul || set "GIT=E:\imp\_Apps_For_C_Drive\Git\cmd\git.exe"

set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update %DATE% %TIME%"

echo === Staging changes ===
"%GIT%" add -A

echo === Committing: %MSG% ===
"%GIT%" commit -m "%MSG%"

echo === Pushing to origin/main ===
"%GIT%" push origin main

echo.
echo === Done. https://github.com/JASMEHRR/ASCEND ===
pause
