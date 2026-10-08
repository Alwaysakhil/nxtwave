@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-local.ps1"
if errorlevel 1 (
  echo.
  echo PocketPlan did not start. Check the error above and local logs if shown.
  pause
)
