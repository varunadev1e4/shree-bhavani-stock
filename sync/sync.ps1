param([switch]$DryRun)
# Shree Bhavani: Profit Maker -> Supabase stock sync.
# Run with 32-bit PowerShell. Use -DryRun to read the data without uploading.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $here "sync-config.json") -Raw | ConvertFrom-Json
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$logFile = Join-Path $here "sync.log"

function Log($m) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Get-Rows($sql) {
  $da = New-Object System.Data.OleDb.OleDbDataAdapter($sql, $script:conn)
  $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt)
  ,$dt
}

function Map-Rows($dt, $map, $syncId) {
  $list = New-Object System.Collections.Generic.List[object]
  foreach ($r in $dt.Rows) {
    $o = [ordered]@{}
    foreach ($k in $map.Keys) {
      $v = $r[$k]
      if ($v -is [DBNull]) { $v = $null }
      elseif ($v -is [string]) { $v = $v.Trim() }
      elseif ($v -is [datetime]) { $v = if ($v.Year -lt 2000) { $null } else { $v.ToString("yyyy-MM-dd") } }
      $o[$map[$k]] = $v
    }
    $o["sync_id"] = $syncId
    $list.Add($o)
  }
  ,$list
}

function Upload($table, $rows) {
  for ($i = 0; $i -lt $rows.Count; $i += 500) {
    $n = [Math]::Min(500, $rows.Count - $i)
    $chunk = $rows.GetRange($i, $n)
    $json = ConvertTo-Json -InputObject @($chunk) -Depth 4 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    Invoke-RestMethod -Method Post -Uri "$($script:base)/rest/v1/$table`?on_conflict=id" `
      -Headers $script:hdr -Body $bytes -ContentType "application/json; charset=utf-8" | Out-Null
  }
}

function Remove-Stale($table, $syncId) {
  Invoke-RestMethod -Method Delete -Uri "$($script:base)/rest/v1/$table`?sync_id=neq.$syncId" `
    -Headers $script:hdr | Out-Null
}

$work = Join-Path $env:TEMP ("profit_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null
$script:conn = $null
$exit = 0

try {
  # 1. Get a private copy of the data (live file if set, otherwise newest backup zip)
  if ($cfg.live_mdb -and (Test-Path $cfg.live_mdb)) {
    Copy-Item $cfg.live_mdb $work
    $mdb = Join-Path $work (Split-Path $cfg.live_mdb -Leaf)
    $source = "live"
  } else {
    $zip = Get-ChildItem $cfg.backup_folder -Filter "Data*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $zip) { throw "No Data*.zip found in $($cfg.backup_folder)" }
    Expand-Archive -Path $zip.FullName -DestinationPath $work -Force
    $mdb = (Get-ChildItem $work -Filter *.mdb | Select-Object -First 1).FullName
    $source = $zip.Name
  }
  Log "Source: $source"

  # 2. Open the database
  $err = ""
  foreach ($prov in "Microsoft.Jet.OLEDB.4.0", "Microsoft.ACE.OLEDB.12.0") {
    try {
      $c = New-Object System.Data.OleDb.OleDbConnection("Provider=$prov;Data Source=$mdb;Mode=Read")
      $c.Open(); $script:conn = $c; break
    } catch { $err = $_.Exception.Message }
  }
  if (-not $script:conn) { throw "Could not open database: $err" }

  # 3. Read the tables we need
  $syncId = Get-Date -Format "yyyyMMddHHmmss"
  $companies = Map-Rows (Get-Rows "SELECT RndId, [Name], ShortName, Deleted FROM Company") ([ordered]@{
    RndId = "id"; Name = "name"; ShortName = "short_name"; Deleted = "deleted" }) $syncId
  $products = Map-Rows (Get-Rows "SELECT RndId, [Code], [Name], Packing, Mrp, SaleGst, ComId, Deleted, RackNo, OrdLevel, LSaleDate FROM Product") ([ordered]@{
    RndId = "id"; Code = "code"; Name = "name"; Packing = "packing"; Mrp = "mrp"; SaleGst = "gst"; ComId = "company_id"; Deleted = "deleted"; RackNo = "rack_no"; OrdLevel = "ord_level"; LSaleDate = "last_sale" }) $syncId
  $batches = Map-Rows (Get-Rows "SELECT RndId, ProdId, BatchNo, ExpMonth, ExpYear, Qty, Mrp, BillPrice, CostPrice FROM Batch WHERE Qty > 0") ([ordered]@{
    RndId = "id"; ProdId = "product_id"; BatchNo = "batch_no"; ExpMonth = "exp_month"; ExpYear = "exp_year"; Qty = "qty"; Mrp = "mrp"; BillPrice = "bill_price"; CostPrice = "cost_price" }) $syncId

  $parties = Map-Rows (Get-Rows "SELECT RndId, [Code], [Name], City, Cell, Phone, OpBal, SubGroupId, Deleted FROM Accounts WHERE SubGroupId IN (2,3)") ([ordered]@{
    RndId = "id"; Code = "code"; Name = "name"; City = "city"; Cell = "phone"; Phone = "phone2"; OpBal = "cur_bal"; SubGroupId = "group_id"; Deleted = "deleted" }) $syncId
  # Dues are worked out bill by bill, the same way Profit Maker's Receivables and Payables reports do:
  # every CREDIT bill (payment terms = credit) with a balance left. Cash bills are left out.
  $recvMap = @{}; $payMap = @{}; $ageMap = @{}; $today = (Get-Date).Date
  foreach ($r in (Get-Rows "SELECT AccId, TranType, InvDate, NetAmt, PaidAmt FROM TranMain WHERE TranType IN ('S','P') AND Terms = 1").Rows) {
    if ($r["NetAmt"] -is [DBNull]) { continue }
    $paid = if ($r["PaidAmt"] -is [DBNull]) { 0.0 } else { [double]$r["PaidAmt"] }
    $o = [double]$r["NetAmt"] - $paid
    if ($o -le 0.5) { continue }
    $k = [string]$r["AccId"]
    if (([string]$r["TranType"]).Trim() -eq "S") {
      $recvMap[$k] = $(if ($recvMap.ContainsKey($k)) { $recvMap[$k] } else { 0.0 }) + $o
      $age = if ($r["InvDate"] -is [DBNull]) { 999 } else { ($today - ([datetime]$r["InvDate"]).Date).Days }
      $bi = if ($age -le 30) { 0 } elseif ($age -le 60) { 1 } elseif ($age -le 90) { 2 } else { 3 }
      if (-not $ageMap.ContainsKey($k)) { $ageMap[$k] = @(0.0, 0.0, 0.0, 0.0) }
      $ageMap[$k][$bi] += $o
    } else {
      $payMap[$k] = $(if ($payMap.ContainsKey($k)) { $payMap[$k] } else { 0.0 }) + $o
    }
  }
  # Last bill date per customer (cash bills count here)
  $lastMap = @{}
  foreach ($r in (Get-Rows "SELECT AccId, MAX(InvDate) AS d FROM TranMain WHERE TranType='S' GROUP BY AccId").Rows) {
    if ($r["d"] -isnot [DBNull]) { $lastMap[[string]$r["AccId"]] = ([datetime]$r["d"]).ToString("yyyy-MM-dd") }
  }
  foreach ($p in $parties) {
    $k = [string]$p["id"]
    $recv = if ($recvMap.ContainsKey($k)) { $recvMap[$k] } else { 0.0 }
    $pay = if ($payMap.ContainsKey($k)) { $payMap[$k] } else { 0.0 }
    $b = if ($ageMap.ContainsKey($k)) { $ageMap[$k] } else { @(0.0, 0.0, 0.0, 0.0) }
    $p["receivable"] = [Math]::Round($recv, 2)
    $p["payable"] = [Math]::Round($pay, 2)
    $p["cur_bal"] = [Math]::Round($recv - $pay, 2)
    $p["last_sale"] = $lastMap[$k]
    $p["age_30"] = [Math]::Round($b[0], 2); $p["age_60"] = [Math]::Round($b[1], 2)
    $p["age_90"] = [Math]::Round($b[2], 2); $p["age_90p"] = [Math]::Round($b[3], 2)
  }
  $daily = New-Object System.Collections.Generic.List[object]
  foreach ($r in (Get-Rows "SELECT FeedDate, TranType, COUNT(*) AS n, SUM(NetAmt) AS amt FROM AccHead WHERE TranType IN ('S','SR','P','RS','PA') AND FeedDate >= DateAdd('d', -90, Date()) GROUP BY FeedDate, TranType").Rows) {
    if ($r["FeedDate"] -is [DBNull] -or $r["amt"] -is [DBNull]) { continue }
    $daily.Add([ordered]@{ day = ([datetime]$r["FeedDate"]).ToString("yyyy-MM-dd"); kind = ([string]$r["TranType"]).Trim(); bills = [int]$r["n"]; amount = [Math]::Round([double]$r["amt"], 2) })
  }
  Log ("Read {0} companies, {1} products, {2} batches with stock, {3} parties" -f $companies.Count, $products.Count, $batches.Count, $parties.Count)
  if ($products.Count -lt 1) { throw "No products read - stopping so Supabase data is not wiped." }

  if ($DryRun) {
    Log "Dry run: nothing uploaded."
  } else {
    # 4. Upload (insert or update), then remove rows no longer in Profit Maker
    $script:base = $cfg.supabase_url.TrimEnd("/")
    $key = $cfg.supabase_key
    $script:hdr = @{ apikey = $key; Prefer = "resolution=merge-duplicates,return=minimal" }
    if ($key.StartsWith("eyJ")) { $script:hdr["Authorization"] = "Bearer $key" }

    Upload "companies" $companies
    Upload "products" $products
    Upload "batches" $batches
    Upload "parties" $parties
    Remove-Stale "companies" $syncId
    Remove-Stale "products" $syncId
    Remove-Stale "batches" $syncId
    Remove-Stale "parties" $syncId
    Invoke-RestMethod -Method Delete -Uri "$($script:base)/rest/v1/daily_summary?id=gt.0" -Headers $script:hdr | Out-Null
    for ($i = 0; $i -lt $daily.Count; $i += 500) {
      $ch = $daily.GetRange($i, [Math]::Min(500, $daily.Count - $i))
      $jd = ConvertTo-Json -InputObject @($ch) -Depth 4 -Compress
      Invoke-RestMethod -Method Post -Uri "$($script:base)/rest/v1/daily_summary" -Headers $script:hdr -Body ([Text.Encoding]::UTF8.GetBytes($jd)) -ContentType "application/json; charset=utf-8" | Out-Null
    }

    $logRow = @(@{ source = $source; products = $products.Count; batches = $batches.Count })
    $json = ConvertTo-Json -InputObject $logRow -Compress
    Invoke-RestMethod -Method Post -Uri "$($script:base)/rest/v1/sync_log" -Headers $script:hdr `
      -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json" | Out-Null
    # Refresh sales/purchase history for this financial year (only when the backup changed)
    try {
      $tag = if ($source -eq "live") { "live-" + (Get-Date -Format "yyyyMMddHH") } else { $source }
      $mark = Join-Path $here "history.last"
      if (-not (Test-Path $mark) -or ((Get-Content $mark -Raw).Trim() -ne $tag)) {
        & (Join-Path $here "history.ps1") -Mdb $mdb
        Set-Content $mark $tag
      }
    } catch { Log ("History skipped: " + $_.Exception.Message) }
    Log "Upload complete."
  }
}
catch {
  $msg = $_.Exception.Message
  if ($_.ErrorDetails) { $msg += " | " + $_.ErrorDetails.Message }
  if (-not $_.ErrorDetails -and $_.Exception.Response) {
    try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $msg += " | " + $sr.ReadToEnd() } catch { }
  }
  Log "ERROR: $msg"
  $exit = 1
}
finally {
  if ($script:conn) { $script:conn.Close(); $script:conn.Dispose() }
  [System.Data.OleDb.OleDbConnection]::ReleaseObjectPool()
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Start-Sleep -Seconds 1
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
exit $exit