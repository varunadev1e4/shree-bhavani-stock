@echo off
title Profit Maker backup
echo Making a backup now. Please wait...
echo.
"%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-backup.ps1"
echo.
echo Result (last line of auto-backup.log):
powershell -NoProfile -Command "Get-Content -LiteralPath '%~dp0auto-backup.log' -Tail 1"
echo.
echo If it says OK, the backup is done. If it says ERROR, send a photo of this window.
pause
