# Automatic backup of the Profit Maker data file. Never changes the original file.
# Reads its settings from sync-config.json (data_file, backup_folder, optional backup_keep_days).
$ErrorActionPreference = "Stop"
$log = Join-Path $PSScriptRoot "auto-backup.log"
try {
  $cfg = Get-Content (Join-Path $PSScriptRoot "sync-config.json") -Raw | ConvertFrom-Json
  if (-not $cfg.data_file) { throw "data_file is not set in sync-config.json" }
  $dest = $cfg.backup_folder
  $keepDays = if ($cfg.backup_keep_days) { [int]$cfg.backup_keep_days } else { 1000 }
  if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

  # Use the highest-numbered Data####.Mdb in that folder, so a new financial year is picked up by itself
  $dataDir = Split-Path $cfg.data_file
  $liveFile = Get-ChildItem $dataDir -File -Filter "Data*.mdb" | Where-Object { $_.Name -match '^Data\d{4}\.mdb$' } |
              Sort-Object Name -Descending | Select-Object -First 1
  if (-not $liveFile) { throw "No Data####.Mdb file found in $dataDir" }

  $stamp = Get-Date -Format "ddMMyyyy_HHmmss"
  $name  = [IO.Path]::GetFileNameWithoutExtension($liveFile.Name)
  $tmp   = Join-Path $env:TEMP ("pmbk_" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Copy-Item $liveFile.FullName $tmp
  $zip = Join-Path $dest ("{0}_{1}.zip" -f $name, $stamp)
  Compress-Archive -Path (Join-Path $tmp $liveFile.Name) -DestinationPath $zip
  Remove-Item $tmp -Recurse -Force

  Get-ChildItem $dest -Filter "Data*.zip" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keepDays) } | Remove-Item -Force
  "{0}  OK  {1}" -f (Get-Date -Format s), (Split-Path $zip -Leaf) | Add-Content $log
}
catch {
  "{0}  ERROR  {1}" -f (Get-Date -Format s), $_.Exception.Message | Add-Content $log
  exit 1
}
