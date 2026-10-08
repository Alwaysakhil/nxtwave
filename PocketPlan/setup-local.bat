@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-local.ps1"
if errorlevel 1 (
  echo.
  echo Setup did not finish. Read the error above and share it if you need help.
  pause
)
