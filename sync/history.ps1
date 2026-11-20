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
  $sqlP = "SELECT $ymT AS ym, p.[Name] AS pn, c.[Name] AS cn, SUM(i.Qty) AS q, SUM(i.TaxValue * (1 + IIf(IsNull(i.GstPer),0,i.GstPer) / 100)) AS amt, SUM(i.TaxValue) AS amtx, SUM((i.Qty + IIf(IsNull(i.Free),0,i.Free)) * IIf(IsNull(b.ActCostPrice),0,b.ActCostPrice)) AS cst FROM (((TranItem i INNER JOIN TranMain m ON i.TranId=m.RndId) INNER JOIN Product p ON i.ProdId=p.RndId) LEFT JOIN Company c ON p.ComId=c.RndId) LEFT JOIN Batch b ON i.BatchId=b.RndId WHERE m.TranType='S' GROUP BY $ymT, p.[Name], c.[Name]"
  foreach ($r in (Rows $sqlP).Rows) {
    if ($r["ym"] -is [DBNull] -or $r["pn"] -is [DBNull]) { continue }
    $ym = [int]$r["ym"]; if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $cn = if ($r["cn"] -is [DBNull]) { "Other" } else { ([string]$r["cn"]).Trim() }
    $q = if ($r["q"] -is [DBNull]) { 0 } else { [double]$r["q"] }
    $a = if ($r["amt"] -is [DBNull]) { 0 } else { [double]$r["amt"] }
    $ct = if ($r["cst"] -is [DBNull]) { 0 } else { [double]$r["cst"] }
    $ax = if ($r["amtx"] -is [DBNull]) { 0 } else { [double]$r["amtx"] }
    $prod.Add([ordered]@{ fy = $Fy; ym = $ym; product = ([string]$r["pn"]).Trim(); company = $cn; qty = [Math]::Round($q, 2); amount = [Math]::Round($a, 2); cost = [Math]::Round($ct, 2); amount_ex = [Math]::Round($ax, 2) })
  }
  $party = New-Object System.Collections.Generic.List[object]
  foreach ($r in (Rows "SELECT $ymA AS ym, a.[Name] AS pn, SUM(h.NetAmt) AS amt FROM AccHead h INNER JOIN Accounts a ON h.AccId=a.RndId WHERE h.TranType='S' GROUP BY $ymA, a.[Name]").Rows) {
    if ($r["ym"] -is [DBNull] -or $r["pn"] -is [DBNull] -or $r["amt"] -is [DBNull]) { continue }
    $ym = [int]$r["ym"]; if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $party.Add([ordered]@{ fy = $Fy; ym = $ym; party = ([string]$r["pn"]).Trim(); amount = [Math]::Round([double]$r["amt"], 2) })
  }
  # Every bill line (sales and purchases) so reports can be made for any dates
  function S($v) { if ($v -is [DBNull]) { "" } else { ([string]$v).Trim() } }
  function N($v) { if ($v -is [DBNull]) { 0.0 } else { [Math]::Round([double]$v, 2) } }
  $lines = New-Object System.Collections.Generic.List[object]
  $sqlL = "SELECT m.InvDate AS d, m.FeedNo AS bn, m.TranType AS tt, m.Terms AS tm, a.[Name] AS pn, a.City AS cty, p.[Name] AS prd, c.[Name] AS cmp, i.Qty AS q, i.Free AS fr, i.TaxValue AS tv, i.ProValue AS pv, i.DisPer AS dp, i.Rate AS rt, i.GstPer AS gp, p.Packing AS pk, b.BatchNo AS bno, a.[Code] AS cd FROM (((((TranItem i INNER JOIN TranMain m ON i.TranId=m.RndId) INNER JOIN Accounts a ON m.AccId=a.RndId) INNER JOIN Product p ON i.ProdId=p.RndId) LEFT JOIN Company c ON p.ComId=c.RndId) LEFT JOIN Batch b ON i.BatchId=b.RndId) WHERE m.TranType IN ('S','P')"
  foreach ($r in (Rows $sqlL).Rows) {
    if ($r["d"] -is [DBNull]) { continue }
    $dt = [datetime]$r["d"]; $ym = $dt.Year * 100 + $dt.Month
    if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $lines.Add([ordered]@{ fy = $Fy; kind = (S $r["tt"]); d = $dt.ToString("yyyy-MM-dd"); bill_no = (S $r["bn"]); party = (S $r["pn"]); city = (S $r["cty"]); company = $(if ((S $r["cmp"]) -eq "") { "Other" } else { S $r["cmp"] }); product = (S $r["prd"])
      qty = (N $r["q"]); free = (N $r["fr"]); gst = (N $r["gp"]); pack = (S $r["pk"]); batch = (S $r["bno"]); rate = (N $r["rt"]); dis = (N $r["dp"]); party_code = (S $r["cd"]).TrimStart('0')
      # value after discount, before GST (sales: TaxValue; purchase bills keep TaxValue empty, so use rate x qty less discount)
      amount = $(if ((S $r["tt"]) -eq "P") { [Math]::Round((N $r["pv"]) * (1 - (N $r["dp"]) / 100), 2) } else { N $r["tv"] }); terms = $(if ($r["tm"] -is [DBNull]) { 1 } else { [int]$r["tm"] }) })
  }
  # GST registers (bill by bill) and HSN totals, for the CA reports. Interstate = party GSTIN does not start with the home state code.
  $homeSt = if ($cfg.PSObject.Properties["home_state"] -and $cfg.home_state) { [string]$cfg.home_state } else { "36" }
  function IsInter($g) { $g = (S $g); return ($g.Length -ge 2 -and -not $g.StartsWith($homeSt)) }
  $bills = New-Object System.Collections.Generic.List[object]
  $sqlB = "SELECT m.TranType AS tt, m.FeedNo AS fn, m.FeedDate AS fd, m.InvNo AS ino, m.InvDate AS idt, m.Terms AS tm, a.[Code] AS cd, a.[Name] AS pn, a.GstIn AS gin, m.GstVal0 AS v0, m.GstVal1 AS v1, m.Gst1 AS g1, m.GstVal2 AS v2, m.Gst2 AS g2, m.GstVal3 AS v3, m.Gst3 AS g3, m.GstVal4 AS v4, m.Gst4 AS g4, m.SumGst AS sg, m.NetAmt AS net FROM TranMain m INNER JOIN Accounts a ON m.AccId=a.RndId WHERE m.TranType IN ('S','P')"
  foreach ($r in (Rows $sqlB).Rows) {
    if ($r["fd"] -is [DBNull]) { continue }
    $dt = [datetime]$r["fd"]; $ym = $dt.Year * 100 + $dt.Month
    if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $idt = if ($r["idt"] -is [DBNull]) { $null } else { ([datetime]$r["idt"]).ToString("yyyy-MM-dd") }
    $bills.Add([ordered]@{ fy = $Fy; kind = (S $r["tt"]); typ = $(if ($r["tm"] -is [DBNull] -or [int]$r["tm"] -eq 1) { "Credit" } else { "Cash" }); feed_no = (S $r["fn"]); feed_date = $dt.ToString("yyyy-MM-dd"); inv_no = (S $r["ino"]); inv_date = $idt
      code = (S $r["cd"]); name = (S $r["pn"]); gstin = (S $r["gin"]); v0 = (N $r["v0"]); v5 = (N $r["v1"]); g5 = (N $r["g1"]); v12 = (N $r["v2"]); g12 = (N $r["g2"]); v18 = (N $r["v3"]); g18 = (N $r["g3"]); v28 = (N $r["v4"]); g28 = (N $r["g4"])
      sum_gst = (N $r["sg"]); net = (N $r["net"]); inter = (IsInter $r["gin"]) })
  }
  $hs = @{}
  $sqlH = "SELECT m.FeedDate AS d, m.TranType AS tt, p.HsnCode AS hsn, i.GstPer AS gp, a.GstIn AS gin, i.Qty AS q, i.ProValue AS pv, i.DisPer AS dp, i.TaxValue AS tv FROM (((TranItem i INNER JOIN TranMain m ON i.TranId=m.RndId) INNER JOIN Accounts a ON m.AccId=a.RndId) INNER JOIN Product p ON i.ProdId=p.RndId) WHERE m.TranType IN ('S','P')"
  foreach ($r in (Rows $sqlH).Rows) {
    if ($r["d"] -is [DBNull]) { continue }
    $dt = [datetime]$r["d"]; $ym = $dt.Year * 100 + $dt.Month
    if ($ym -lt $lo -or $ym -gt $hi) { continue }
    $tt = S $r["tt"]; $gp = [double](N $r["gp"]); $inter = IsInter $r["gin"]
    # Sales are valued after discount (TaxValue); purchases after the item discount (ProValue less DisPer)
    $tx = if ($tt -eq "S") { [double]$(if ($r["tv"] -is [DBNull]) { 0 } else { $r["tv"] }) } else { [double]$(if ($r["pv"] -is [DBNull]) { 0 } else { $r["pv"] }) * (1 - [double]$(if ($r["dp"] -is [DBNull]) { 0 } else { $r["dp"] }) / 100) }
    $k = "$tt|$ym|$(S $r['hsn'])|$gp|$inter"
    if (-not $hs.ContainsKey($k)) { $hs[$k] = [ordered]@{ fy = $Fy; kind = $tt; ym = $ym; hsn = (S $r["hsn"]); gst = $gp; inter = $inter; qty = 0.0; taxable = 0.0; tax = 0.0 } }
    $hs[$k].qty += [double]$(if ($r["q"] -is [DBNull]) { 0 } else { $r["q"] }); $hs[$k].taxable += $tx; $hs[$k].tax += $tx * $gp / 100
  }
  $hsn = New-Object System.Collections.Generic.List[object]
  foreach ($v in $hs.Values) { $v.qty = [Math]::Round($v.qty, 2); $v.taxable = [Math]::Round($v.taxable, 2); $v.tax = [Math]::Round($v.tax, 2); $hsn.Add($v) }
  # Party ledger for statements: credit bills, receipts, payments, returns and discounts allowed, plus each party's opening balance
  $fyStart = New-Object DateTime $y1, 4, 1
  $led = New-Object System.Collections.Generic.List[object]
  function AddLed($acc, $dt, $kind, $vno, $ref, $amt) { $led.Add([ordered]@{ fy = $Fy; acc_id = [int]$acc; d = ([datetime]$dt).ToString("yyyy-MM-dd"); kind = $kind; vno = (S $vno); ref = (S $ref); amount = [Math]::Round([double]$amt, 2) }) }
  foreach ($r in (Rows "SELECT AccId, TranType, FeedNo, InvNo, FeedDate, NetAmt FROM TranMain WHERE TranType IN ('S','P') AND Terms = 1").Rows) {
    if ($r["FeedDate"] -is [DBNull] -or [datetime]$r["FeedDate"] -lt $fyStart -or [datetime]$r["FeedDate"] -ge $fyStart.AddYears(1)) { continue }
    AddLed $r["AccId"] $r["FeedDate"] (S $r["TranType"]) $r["FeedNo"] $(if ((S $r["TranType"]) -eq "P") { $r["InvNo"] } else { "" }) (N $r["NetAmt"])
  }
  foreach ($r in (Rows "SELECT AccId, TranType, FeedNo, ChqNo, FeedDate, NetAmt FROM AccHead WHERE TranType IN ('RS','PA','SR')").Rows) {
    if ($r["FeedDate"] -is [DBNull] -or [datetime]$r["FeedDate"] -lt $fyStart -or [datetime]$r["FeedDate"] -ge $fyStart.AddYears(1)) { continue }
    AddLed $r["AccId"] $r["FeedDate"] (S $r["TranType"]) $r["FeedNo"] $r["ChqNo"] (N $r["NetAmt"])
  }
  foreach ($r in (Rows "SELECT h.AccId AS AccId, h.FeedNo AS FeedNo, h.FeedDate AS FeedDate, SUM(i.DisAmt) AS dis FROM AccInv i INNER JOIN AccHead h ON i.AHeadId = h.RndId WHERE i.DisAmt > 0 GROUP BY h.AccId, h.FeedNo, h.FeedDate").Rows) {
    if ($r["FeedDate"] -is [DBNull] -or [datetime]$r["FeedDate"] -lt $fyStart -or [datetime]$r["FeedDate"] -ge $fyStart.AddYears(1)) { continue }
    AddLed $r["AccId"] $r["FeedDate"] "D" $r["FeedNo"] "" (N $r["dis"])
  }
  $opening = New-Object System.Collections.Generic.List[object]
  foreach ($r in (Rows "SELECT RndId, OpBal FROM Accounts WHERE SubGroupId IN (2,3)").Rows) { $opening.Add([ordered]@{ fy = $Fy; acc_id = [int]$r["RndId"]; op = (N $r["OpBal"]) }) }
  Write-Host ("{0}: {1} monthly rows, {2} product rows, {3} party rows, {4} bill lines" -f $Fy, $monthly.Count, $prod.Count, $party.Count, $lines.Count)
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
  Replace-Table "sales_lines" $lines
  Replace-Table "gst_bills" $bills
  Replace-Table "hsn_monthly" $hsn
  Replace-Table "ledger_entries" $led
  Replace-Table "party_opening" $opening
  Write-Host "History uploaded for $Fy"
}
finally {
  if ($conn) { $conn.Close(); $conn.Dispose() }
  [System.Data.OleDb.OleDbConnection]::ReleaseObjectPool(); [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Start-Sleep -Seconds 1
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}