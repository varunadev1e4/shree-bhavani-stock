param([string]$Dir)
# GOLDEN BACKUP: copies every table from Supabase into one zip file you can keep anywhere.
# It only READS from Supabase. Nothing in Supabase or Profit Maker is changed.
# Optional settings in sync-config.json:  "golden_dir": "D:\\SBMA-golden"   "golden_keep": 60
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $here "sync-config.json") -Raw | ConvertFrom-Json
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$logFile = Join-Path $here "golden.log"
function Log($m) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

$base = $cfg.supabase_url.TrimEnd("/")
$key = $cfg.supabase_key
$hdr = @{ apikey = $key }
if ($key.StartsWith("eyJ")) { $hdr["Authorization"] = "Bearer $key" }
$outDir = $Dir
if (-not $outDir) { $outDir = $cfg.golden_dir }
if (-not $outDir) { $outDir = Join-Path $here "golden" }
$keep = 60
if ($cfg.golden_keep) { $keep = [int]$cfg.golden_keep }

# Same order is used by the restore script (parents before children)
$TABLES = @("companies","products","batches","parties",
  "employees","emp_entries","expenses","directory","directory_people","temp_bills","temp_returns","temp_collections",
  "fy_monthly","fy_product_monthly","fy_party_monthly","sales_lines","gst_bills","hsn_monthly","ledger_entries","party_opening",
  "fy_margin_monthly","bill_payments","pending_bills","daily_summary")

function Dump-Table($t, $file) {
  $sb = New-Object System.Text.StringBuilder
  $offset = 0; $total = 0
  while ($true) {
    $uri = $base + "/rest/v1/" + $t + "?select=*&order=id.asc&limit=1000&offset=" + $offset
    $r = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $hdr
    $txt = ([string]$r.Content).Trim()
    if ($txt.Length -lt 3) { break }
    $inner = $txt.Substring(1, $txt.Length - 2).Trim()
    if ($inner.Length -eq 0) { break }
    $range = [string]$r.Headers["Content-Range"]
    if ($range -notmatch '^(\d+)-(\d+)/') { break }
    $n = [int]$Matches[2] - [int]$Matches[1] + 1
    if ($sb.Length -gt 0) { [void]$sb.Append(",") }
    [void]$sb.Append($inner)
    $offset += $n; $total += $n
  }
  [IO.File]::WriteAllText($file, "[" + $sb.ToString() + "]", (New-Object Text.UTF8Encoding($false)))
  return $total
}

$work = Join-Path $env:TEMP ("golden_" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path $work | Out-Null
  $counts = [ordered]@{}
  foreach ($t in $TABLES) {
    $counts[$t] = Dump-Table $t (Join-Path $work ($t + ".json"))
    Log ("  {0}: {1} rows" -f $t, $counts[$t])
  }
  $manifest = [ordered]@{ created = (Get-Date -Format "yyyy-MM-dd HH:mm:ss"); supabase_host = ([uri]$base).Host; tables = $counts }
  [IO.File]::WriteAllText((Join-Path $work "manifest.json"), (ConvertTo-Json -InputObject $manifest -Depth 4), (New-Object Text.UTF8Encoding($false)))
  $readme = @"
SBMA GOLDEN BACKUP - how to bring everything back
1. Make a new Supabase project (or use the existing one) and run setup-new-shop.sql, then every migration file (migration-3 ... latest) in the SQL Editor.
2. Put the new Supabase address and SERVICE key into sync-config.json, and the new address and anon key into Vercel (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), then redeploy.
3. Create the login user again in Supabase (Authentication > Users).
4. Double-click restore-golden.bat and give it this zip file. It puts all tables back.
5. Run run-sync.bat once to bring today's Profit Maker data.
This file contains customer, staff and sales data. Keep it private.
"@
  [IO.File]::WriteAllText((Join-Path $work "README-RESTORE.txt"), $readme, (New-Object Text.UTF8Encoding($false)))

  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  $zip = Join-Path $outDir ("SBMA-golden-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".zip")
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $work "*") -DestinationPath $zip -Force
  $mb = [Math]::Round((Get-Item $zip).Length / 1MB, 2)
  Log ("Golden backup saved: {0} ({1} MB)" -f $zip, $mb)

  # Keep the newest backups only (deletes only older SBMA-golden-*.zip files in this folder)
  Get-ChildItem -Path $outDir -Filter "SBMA-golden-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep | ForEach-Object { Remove-Item $_.FullName -Force; Log ("Removed old backup " + $_.Name) }
}
catch {
  $msg = $_.Exception.Message
  if ($_.ErrorDetails) { $msg += " | " + $_.ErrorDetails.Message }
  Log ("ERROR: " + $msg)
  exit 1
}
finally {
  if (Test-Path $work) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}
