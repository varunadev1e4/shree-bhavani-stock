# Creates two Windows scheduled tasks that run from THIS folder:
#   ProfitAutoBackup : every hour, makes a backup zip
#   SBMAGoldenBackup : every day at 7:45 pm, saves a golden backup zip of everything in Supabase
#   StockSync        : every 30 minutes, uploads to Supabase (32-bit PowerShell, needed for the Access driver)
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
$ps64 = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

function Add-Task($name, $exe, $script, $minuteOffset, $everyMinutes) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  $arg = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f (Join-Path $dir $script)
  $act = New-ScheduledTaskAction -Execute $exe -Argument $arg -WorkingDirectory $dir
  $trg = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddMinutes($minuteOffset)) `
         -RepetitionInterval (New-TimeSpan -Minutes $everyMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
  # Run on battery, catch up after the PC was off, never stack two runs
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
         -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
  Register-ScheduledTask -TaskName $name -Action $act -Trigger $trg -Settings $set -Description "Shree Bhavani stock app" | Out-Null
  Write-Host "Created $name"
}
Add-Task "ProfitAutoBackup" $ps64 "auto-backup.ps1" 0 60
Add-Task "StockSync" $ps32 "sync.ps1" 10 30
Add-Task "SBMAGoldenBackup" $ps64 "backup-supabase.ps1" 1185 1440
Write-Host ""
Write-Host "Starting both once now to test..."
Start-ScheduledTask -TaskName "ProfitAutoBackup"
Start-Sleep -Seconds 25
Start-ScheduledTask -TaskName "StockSync"
Start-Sleep -Seconds 60
foreach ($n in "ProfitAutoBackup", "StockSync") {
  $i = Get-ScheduledTaskInfo -TaskName $n
  "{0}: last run {1}, result {2} (0 = success), next run {3}" -f $n, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime
}
Write-Host "Now open sync.log and auto-backup.log in this folder and check for a new line just now."