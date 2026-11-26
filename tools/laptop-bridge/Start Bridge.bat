@echo off
rem Starts the laptop bridge in this window. Close it, or run Stop Bridge.bat, to stop.
cd /d "%~dp0"
title Laptop bridge
python bridge.py run
