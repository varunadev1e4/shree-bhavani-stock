@echo off
title Golden backup
echo Making the golden backup. Please wait...
echo.
"%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-supabase.ps1"
echo.
echo Result - last line of golden.log:
"%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-Content -LiteralPath '%~dp0golden.log' -Tail 1"
echo.
echo The backup zip is in the golden folder next to this file. Copy it to a pen drive or Google Drive as well.
pause