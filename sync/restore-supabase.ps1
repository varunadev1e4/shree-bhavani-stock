param([Parameter(Mandatory = $true)][string]$File, [switch]$Yes)
# RESTORE from a golden backup zip made by backup-supabase.ps1.
#  - Tables that Profit Maker fills (history, GST, ledger, pending bills...) are emptied and refilled from the backup.
#  - Your own records (staff, expenses, directory, temp bills/returns/collections) and the stock tables are put back by number:
#    rows in the backup replace rows with the same number; other rows are NOT deleted.
# Profit Maker's own files are never touched.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $here "sync-config.json") -Raw | ConvertFrom-Json
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Web.Extensions
$js = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$js.MaxJsonLength = [int]::MaxValue

$base = $cfg.supabase_url.TrimEnd("/")
$key = $cfg.supabase_key
$hdr = @{ apikey = $key; Prefer = "resolution=merge-duplicates,return=minimal" }
if ($key.StartsWith("eyJ")) { $hdr["Authorization"] = "Bearer $key" }

$UPSERT = @("companies","products","batches","parties","employees","emp_entries","trips","emp_cash","shop_fund","emp_tasks","staff_reports","field_returns","fund_requests","counts","count_items","count_expected","bill_tags","delivery_skip","activity_log","expenses","directory","directory_people","temp_bills","temp_returns","temp_collections")
$REPLACE = @("fy_monthly","fy_product_monthly","fy_party_monthly","sales_lines","gst_bills","hsn_monthly","ledger_entries","party_opening","fy_margin_monthly","bill_payments","pending_bills","daily_summary")

if (-not (Test-Path $File)) { throw "File not found: $File" }
$work = Join-Path $env:TEMP ("restore_" + [guid]::NewGuid().ToString("N"))
try {
  [IO.Compression.ZipFile]::ExtractToDirectory($File, $work)
  $man = Get-Content (Join-Path $work "manifest.json") -Raw | ConvertFrom-Json
  Write-Host ""
  Write-Host ("Backup made on: " + $man.created)
  Write-Host ("Restoring into: " + ([uri]$base).Host)
  foreach ($p in $man.tables.PSObject.Properties) { Write-Host ("  {0}: {1} rows" -f $p.Name, $p.Value) }
  if (-not $Yes) {
    $a = Read-Host "Type YES to restore this backup into the project above"
    if ($a -ne "YES") { Write-Host "Cancelled. Nothing was changed."; exit 0 }
  }

  function Send($t, $rows, $upsert) {
    $h = @{} + $hdr
    $uri = $base + "/rest/v1/" + $t
    if ($upsert) { $uri += "?on_conflict=id" } else { $h["Prefer"] = "return=minimal" }
    for ($i = 0; $i -lt $rows.Count; $i += 500) {
      $end = [Math]::Min($i + 499, $rows.Count - 1)
      $slice = @($rows[$i..$end])
      if (-not $upsert) { foreach ($r in $slice) { [void]$r.Remove("id") } }
      $json = $js.Serialize($slice)
      Invoke-RestMethod -Method Post -Uri $uri -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json; charset=utf-8" | Out-Null
    }
  }
  function Load($t) {
    $f = Join-Path $work ($t + ".json")
    if (-not (Test-Path $f)) { return @() }
    return @($js.DeserializeObject([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)))
  }

  foreach ($t in $UPSERT) {
    $rows = Load $t
    if ($rows.Count -gt 0) { Send $t $rows $true }
    Write-Host ("Restored {0}: {1} rows" -f $t, $rows.Count)
  }
  foreach ($t in $REPLACE) {
    $rows = Load $t
    Invoke-RestMethod -Method Delete -Uri ($base + "/rest/v1/" + $t + "?id=gt.0") -Headers $hdr | Out-Null
    if ($rows.Count -gt 0) { Send $t $rows $false }
    Write-Host ("Restored {0}: {1} rows" -f $t, $rows.Count)
  }
  try {
    Invoke-RestMethod -Method Post -Uri ($base + "/rest/v1/rpc/reset_sequences") -Headers $hdr -Body "{}" -ContentType "application/json" | Out-Null
  } catch { Write-Host "Could not reset counters. Run migration-19.sql in Supabase, then run this restore again." -ForegroundColor Yellow }
  Write-Host ""
  Write-Host "RESTORE DONE. Now run run-sync.bat to bring today's Profit Maker data." -ForegroundColor Green
}
finally {
  if (Test-Path $work) { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}
