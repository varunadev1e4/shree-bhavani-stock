@echo off
title Restore golden backup
echo This puts a golden backup back into Supabase.
echo.
set /p F=Drag the golden zip file here and press Enter: 
"%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-supabase.ps1" -File "%F:"=%"
echo.
pause
