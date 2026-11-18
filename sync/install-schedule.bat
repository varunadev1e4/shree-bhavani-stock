REM @echo off
REM schtasks /create /tn "StockSync" /sc minute /mo 30 /f /tr "\"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe\" -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0sync.ps1\""
REM echo.
REM echo If it says SUCCESS, the sync will now run every 30 minutes.
REM pause
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-schedule.ps1"
echo.
pause