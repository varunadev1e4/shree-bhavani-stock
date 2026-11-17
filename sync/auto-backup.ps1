# Automatic backup of the Profit Maker data file.
# Makes a zip in the same style as Profit Maker's own backups. Never changes the original file.
# 1) Set $live to the full path of your live Data2627.Mdb file.
# 2) Schedule it (see the instructions in chat).

$live     = "D:\TriColor\Data\Data2627.Mdb"   # <-- CHANGE THIS
$dest     = "D:\ProfitBk"
$keepDays = 365                         # zips in $dest older than this are deleted

$ErrorActionPreference = "Stop"
$log = Join-Path $PSScriptRoot "auto-backup.log"
try {
  if (-not (Test-Path $live)) { throw "Live data file not found: $live" }
  if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

  $stamp = Get-Date -Format "ddMMyyyy_HHmmss"
  $name  = [IO.Path]::GetFileNameWithoutExtension($live)
  $tmp   = Join-Path $env:TEMP ("pmbk_" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null

  Copy-Item $live $tmp
  $zip = Join-Path $dest ("{0}_{1}.zip" -f $name, $stamp)
  Compress-Archive -Path (Join-Path $tmp (Split-Path $live -Leaf)) -DestinationPath $zip
  Remove-Item $tmp -Recurse -Force

  Get-ChildItem $dest -Filter "Data*.zip" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keepDays) } |
    Remove-Item -Force

  "{0}  OK  {1}" -f (Get-Date -Format s), (Split-Path $zip -Leaf) | Add-Content $log
}
catch {
  "{0}  ERROR  {1}" -f (Get-Date -Format s), $_.Exception.Message | Add-Content $log
  exit 1
}
