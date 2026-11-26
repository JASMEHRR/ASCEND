@echo off
rem Asks the running laptop bridge to stop (after the render in progress, if any).
cd /d "%~dp0"
python bridge.py stop
timeout /t 3 > nul
