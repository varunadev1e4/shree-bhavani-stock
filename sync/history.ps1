param([Parameter(Mandatory = $true)][string]$Mdb, [string]$Fy = "")
# Reads one year's Profit Maker data file and uploads monthly totals for the Trends tab.
# Old years: run once per file, e.g.  history.ps1 -Mdb "D:\old\Data2425.Mdb"
# The financial year is taken from the file name (Data2425 = 2024-25).
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $here "sync-config.json") -Raw | ConvertFrom-Json
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = $cfg.supabase_url.TrimEnd("/"); $key = $cfg.supabase_key
$hdr = @{ apikey = $key; Prefer = "return=minimal" }
if ($key.StartsWith("eyJ")) { $hdr["Authorization"] = "Bearer $key" }

if (-not $Fy) {
  if ((Split-Path $Mdb -Leaf) -notmatch "(\d{2})(\d{2})") { throw "Cannot work out the year from the file name" }
  $Fy = "20{0}-{1}" -f $Matches[1], $Matches[2]
}
$y1 = [int]("20" + $Fy.Substring(2, 2))
$lo = $y1 * 100 + 4; $hi = ($y1 + 1) * 100 + 3   # April to March

$work = Join-Path $env:TEMP ("hist_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null
$conn = $null
try {
  Copy-Item $Mdb $work
  $copy = Join-Path $work (Split-Path $Mdb -Leaf)
  $err = ""
  foreach ($prov in "Microsoft.Jet.OLEDB.4.0", "Microsoft.ACE.OLEDB.12.0") {
    try { $c = New-Object System.Data.OleDb.OleDbConnection("Provider=$prov;Data Source=$copy;Mode=Read"); $c.Open(); $conn = $c; break } catch { $err = $_.Exception.Message }
  }
  if (-not $conn) { throw "Could not open $Mdb : $err" }

  function Rows($sql) {
    $da = New-Object System.Data.OleDb.OleDbDataAdapter($sql, $conn)
    $dt = New-Object System.Data.DataTable
    [void]$da.Fill($dt)
    ,$dt
  }
  $ymA = "Year(h.FeedDate)*100+Month(h.FeedDate)"
  $ymT = "Year(m.InvDate)*100+Month(m.InvDate)"

  $monthly = New-Object System.Collections.Generic.List[object]
  foreach ($r in (Rows "SELECT $ymA AS ym, h.TranType AS tt, COUNT(*) AS n, SUM(h.NetAmt) AS amt FROM AccHead h WHERE h.TranType IN ('S','SR','P','RS','PA') GROUP BY $ymA, h.TranType").Rows) {
    if ($r["ym"] -is [DBNull] -or $r["amt"] -is [DBNull]) { continue }
    $ym = [int]$r["ym"]; if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $monthly.Add([ordered]@{ fy = $Fy; ym = $ym; kind = ([string]$r["tt"]).Trim(); bills = [int]$r["n"]; amount = [Math]::Round([double]$r["amt"], 2) })
  }
  $prod = New-Object System.Collections.Generic.List[object]
  $sqlP = "SELECT $ymT AS ym, p.[Name] AS pn, c.[Name] AS cn, SUM(i.Qty) AS q, SUM(i.ProValue) AS amt, SUM((i.Qty + Nz(i.Free,0)) * Nz(b.CostPrice,0)) AS cst FROM (((TranItem i INNER JOIN TranMain m ON i.TranId=m.RndId) INNER JOIN Product p ON i.ProdId=p.RndId) LEFT JOIN Company c ON p.ComId=c.RndId) LEFT JOIN Batch b ON i.BatchId=b.RndId WHERE m.TranType='S' GROUP BY $ymT, p.[Name], c.[Name]"
  foreach ($r in (Rows $sqlP).Rows) {
    if ($r["ym"] -is [DBNull] -or $r["pn"] -is [DBNull]) { continue }
    $ym = [int]$r["ym"]; if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $cn = if ($r["cn"] -is [DBNull]) { "Other" } else { ([string]$r["cn"]).Trim() }
    $q = if ($r["q"] -is [DBNull]) { 0 } else { [double]$r["q"] }
    $a = if ($r["amt"] -is [DBNull]) { 0 } else { [double]$r["amt"] }
    $ct = if ($r["cst"] -is [DBNull]) { 0 } else { [double]$r["cst"] }
    $prod.Add([ordered]@{ fy = $Fy; ym = $ym; product = ([string]$r["pn"]).Trim(); company = $cn; qty = [Math]::Round($q, 2); amount = [Math]::Round($a, 2); cost = [Math]::Round($ct, 2) })
  }
  $party = New-Object System.Collections.Generic.List[object]
  foreach ($r in (Rows "SELECT $ymA AS ym, a.[Name] AS pn, SUM(h.NetAmt) AS amt FROM AccHead h INNER JOIN Accounts a ON h.AccId=a.RndId WHERE h.TranType='S' GROUP BY $ymA, a.[Name]").Rows) {
    if ($r["ym"] -is [DBNull] -or $r["pn"] -is [DBNull] -or $r["amt"] -is [DBNull]) { continue }
    $ym = [int]$r["ym"]; if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $party.Add([ordered]@{ fy = $Fy; ym = $ym; party = ([string]$r["pn"]).Trim(); amount = [Math]::Round([double]$r["amt"], 2) })
  }
  Write-Host ("{0}: {1} monthly rows, {2} product rows, {3} party rows" -f $Fy, $monthly.Count, $prod.Count, $party.Count)
  if ($monthly.Count -eq 0) { throw "No transactions found for $Fy (check the file)" }

  function Replace-Table($table, $rows) {
    Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/$table`?fy=eq.$Fy" -Headers $hdr | Out-Null
    for ($i = 0; $i -lt $rows.Count; $i += 500) {
      $chunk = $rows.GetRange($i, [Math]::Min(500, $rows.Count - $i))
      $json = ConvertTo-Json -InputObject @($chunk) -Depth 4 -Compress
      Invoke-RestMethod -Method Post -Uri "$base/rest/v1/$table" -Headers $hdr -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json; charset=utf-8" | Out-Null
    }
  }
  Replace-Table "fy_monthly" $monthly
  Replace-Table "fy_product_monthly" $prod
  Replace-Table "fy_party_monthly" $party
  Write-Host "History uploaded for $Fy"
}
finally {
  if ($conn) { $conn.Close(); $conn.Dispose() }
  [System.Data.OleDb.OleDbConnection]::ReleaseObjectPool(); [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Start-Sleep -Seconds 1
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}