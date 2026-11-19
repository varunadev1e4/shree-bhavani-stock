import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, num, SHOP, GSTIN } from './util'
import { exportPdf, xlsxBlob, deliverMany } from './exporter'
import { salesRegister, purchaseRegister, hsnReport, gstSummary, dmy } from './gst'

const pad = (v) => String(v).padStart(2, '0')
const monthList = () => {
  const t = new Date(), out = []
  for (let i = 0; i < 24; i++) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); out.push(d.getFullYear() * 100 + d.getMonth() + 1) }
  return out
}
const ymLabel = (ym) => new Date(Math.floor(ym / 100), (ym % 100) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const span = (ym) => { const y = Math.floor(ym / 100), m = ym % 100, last = new Date(y, m, 0).getDate(); return { from: y + '-' + pad(m) + '-01', to: y + '-' + pad(m) + '-' + pad(last), days: last } }
const prevYm = (ym) => (ym % 100 === 1 ? (Math.floor(ym / 100) - 1) * 100 + 12 : ym - 1)
const pct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null)
const money = (v) => (v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function metrics(bills, fp, days) {
  const S = bills.filter((b) => b.kind === 'S'), P = bills.filter((b) => b.kind === 'P')
  const net = (l) => l.reduce((s, b) => s + Number(b.net), 0)
  const sales = net(S), purch = net(P)
  const credit = net(S.filter((b) => b.typ === 'Credit'))
  const byParty = new Map(); S.forEach((b) => byParty.set(b.name, (byParty.get(b.name) || 0) + Number(b.net)))
  const top = [...byParty.entries()].sort((a, b) => b[1] - a[1])
  const sx = fp.reduce((s, r) => s + Number(r.amount_ex || 0), 0), cost = fp.reduce((s, r) => s + Number(r.cost || 0), 0)
  return { sales, purch, bills: S.length, credit, cash: sales - credit, parties: byParty.size, top, top5: top.slice(0, 5).reduce((s, x) => s + x[1], 0),
    gp: sx - cost, gpPct: sx ? ((sx - cost) / sx) * 100 : 0, cost, days, avg: S.length ? sales / S.length : 0 }
}

export default function CA() {
  const months = useMemo(monthList, [])
  const [ym, setYm] = useState(() => months[1])
  const [bills, setBills] = useState(null)
  const [prev, setPrev] = useState([])
  const [hsn, setHsn] = useState([])
  const [fp, setFp] = useState([])
  const [fpPrev, setFpPrev] = useState([])
  const [stock, setStock] = useState([])
  const [parties, setParties] = useState([])
  const [busy, setBusy] = useState('')
  const sp = span(ym), sq = span(prevYm(ym))

  useEffect(() => {
    let stale = false
    setBills(null)
    const g = (t, c, f, k) => fetchAll(t, c, f, k).catch(() => [])
    Promise.all([
      g('gst_bills', '*', (q) => q.gte('feed_date', sp.from).lte('feed_date', sp.to), 'gb:' + ym),
      g('gst_bills', 'kind,typ,name,net,feed_date', (q) => q.gte('feed_date', sq.from).lte('feed_date', sq.to), 'gbp:' + ym),
      g('hsn_monthly', '*', (q) => q.eq('ym', ym), 'hs:' + ym),
      g('fy_product_monthly', 'amount_ex,cost', (q) => q.eq('ym', ym), 'fp:' + ym),
      g('fy_product_monthly', 'amount_ex,cost', (q) => q.eq('ym', prevYm(ym)), 'fpp:' + ym),
      g('stock_summary', 'total_qty,cost_price'),
      g('parties', 'receivable,payable,deleted'),
    ]).then(([b, p, h, f, fpv, s, pa]) => { if (stale) return; setBills(b); setPrev(p); setHsn(h); setFp(f); setFpPrev(fpv); setStock(s); setParties(pa) })
    return () => { stale = true }
  }, [ym])

  const sum = useMemo(() => (bills ? gstSummary(bills) : null), [bills])
  const cur = useMemo(() => (bills ? metrics(bills, fp, sp.days) : null), [bills, fp])
  const old = useMemo(() => metrics(prev, fpPrev, sq.days), [prev, fpPrev])
  const stockVal = stock.reduce((s, r) => s + Number(r.total_qty) * (Number(r.cost_price) || 0), 0)
  const recv = parties.filter((p) => !p.deleted).reduce((s, p) => s + Math.max(Number(p.receivable) || 0, 0), 0)
  const pay = parties.filter((p) => !p.deleted).reduce((s, p) => s + Math.max(Number(p.payable) || 0, 0), 0)

  const o = { shop: SHOP, gstin: GSTIN, from: sp.from, to: sp.to }
  const tag = ym.toString().slice(0, 4) + '-' + pad(ym % 100)
  const FILES = [
    ['Sales register', 'sales_register', () => salesRegister(bills, o)],
    ['Purchase register', 'purchase_register', () => purchaseRegister(bills, o)],
    ['HSN-wise sales', 'HSN_wise_sales', () => hsnReport('S', hsn, o)],
    ['HSN-wise purchases', 'HSN_wise_purchases', () => hsnReport('P', hsn, o)],
  ]
  const make = async (f) => ({ blob: await xlsxBlob(f[2]()), filename: f[1] + '_' + tag + '.xlsx' })
  const run = async (key, fn) => { setBusy(key); try { await fn() } catch (e) { alert('Could not make the file: ' + e.message) } setBusy('') }
  const shareAll = () => run('all', async () => deliverMany(await Promise.all(FILES.map(make)), 'GST files ' + ymLabel(ym)))
  const shareOne = (f) => run(f[1], async () => deliverMany([await make(f)], f[0] + ' ' + ymLabel(ym)))

  const S = sum && sum.S, P = sum && sum.P
  const pay3b = S && P ? { cgst: S.cgst - P.cgst, sgst: S.sgst - P.sgst, igst: S.igst - P.igst } : null
  const gstRows = S && P ? [
    ['Sales (output tax)', S.taxable, S.cgst, S.sgst, S.igst, S.tax],
    ['Purchases (input tax credit)', P.taxable, P.cgst, P.sgst, P.igst, P.tax],
    ['Net GST for the month', S.taxable - P.taxable, pay3b.cgst, pay3b.sgst, pay3b.igst, S.tax - P.tax],
  ] : []
  const gstPdf = () => run('pdf', () => exportPdf({ title: 'GST summary ' + ymLabel(ym), subtitle: SHOP + ' | ' + dmy(sp.from) + ' to ' + dmy(sp.to) + ' | estimate for CA, input credit taken as all purchase GST',
    filename: 'gst-summary-' + tag, columns: ['', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total GST'], numCols: [1, 2, 3, 4, 5], bold: [2],
    rows: gstRows.map((r) => [r[0], ...r.slice(1).map(money)]) }))

  const rows = cur ? [
    ['Sales (with GST)', cur.sales, old.sales, 'rs'], ['Purchases (with GST)', cur.purch, old.purch, 'rs'], ['Bills made', cur.bills, old.bills, 'n'],
    ['Average bill', cur.avg, old.avg, 'rs'], ['Customers billed', cur.parties, old.parties, 'n'],
    ['Gross profit (sales less cost)', cur.gp, old.gp, 'rs'], ['Gross margin %', cur.gpPct, old.gpPct, 'p'],
  ] : []
  const fmt = (v, t) => (t === 'rs' ? rs(v) : t === 'p' ? (Number.isFinite(v) ? v.toFixed(1) + '%' : '-') : num(v))
  const healthPdf = () => run('hp', () => exportPdf({ title: 'Business summary ' + ymLabel(ym), subtitle: SHOP, filename: 'business-summary-' + tag,
    columns: ['Measure', ymLabel(ym), ymLabel(prevYm(ym)), 'Change'], numCols: [1, 2, 3],
    rows: rows.map(([l, a, b, t]) => [l, fmt(a, t), fmt(b, t), t === 'p' ? (a - b).toFixed(1) + ' pts' : pct(a, b) == null ? '' : pct(a, b) + '%']) }))

  const days = (val, per) => (per > 0 ? Math.round(val / per) : null)
  const insights = cur ? [
    cur.sales && ['Cash vs credit', Math.round((cur.cash / cur.sales) * 100) + '% of sales were cash, ' + Math.round((cur.credit / cur.sales) * 100) + '% on credit.'],
    cur.top.length && ['Customer dependence', 'Top 5 customers gave ' + Math.round((cur.top5 / cur.sales) * 100) + '% of sales. Biggest: ' + cur.top[0][0] + ' (' + rs(cur.top[0][1]) + ').'],
    cur.purch && cur.sales && ['Buying vs selling', 'You bought ' + rs(cur.purch) + ' and sold ' + rs(cur.sales) + ' (with GST). ' + (cur.purch > cur.sales ? 'Stock is building up.' : 'Stock is coming down.')],
    stockVal && cur.cost && ['Stock days', 'Stock worth ' + rs(stockVal) + ' at cost is about ' + days(stockVal, cur.cost / cur.days) + ' days of selling at this month\'s pace.'],
    recv && cur.credit && ['Collection days', 'To receive ' + rs(recv) + ' is about ' + days(recv, cur.credit / cur.days) + ' days of credit sales. To pay ' + rs(pay) + '.'],
  ].filter(Boolean) : []

  const none = bills && !bills.length
  return (
    <>
      <p className="muted small" style={{ margin: '0 0 8px' }}>The four files you send your CA, made from your data, plus a GST summary and how the firm is doing.</p>
      <select className="fsel" style={{ width: '100%', marginBottom: 10 }} value={ym} onChange={(e) => setYm(Number(e.target.value))}>{months.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}</select>
      {!bills && <p className="muted pad">Loading...</p>}
      {none && <div className="empty"><b>No bills for {ymLabel(ym)}</b><span>Run migration-9 in Supabase, then load the year once (delete history.last and run run-sync.bat, or run history.ps1 for older years).</span></div>}
      {bills && !none && (
        <>
          <button className="primary" style={{ width: '100%' }} disabled={!!busy} onClick={shareAll}>{busy === 'all' ? 'Making 4 files...' : 'Share all 4 files for ' + ymLabel(ym)}</button>
          <div className="btnrow">{FILES.map((f) => <button key={f[1]} className="ghost sm" disabled={!!busy} onClick={() => shareOne(f)}>{busy === f[1] ? 'Making...' : f[0]}</button>)}</div>

          <h2 className="h2" style={{ marginTop: 18 }}>GST for the month</h2>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th></th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total GST</th></tr></thead>
              <tbody>{gstRows.map((r, i) => <tr key={r[0]} className={i === 2 ? 't' : ''}><td>{r[0]}</td>{r.slice(1).map((v, j) => <td key={j}>{Math.round(v).toLocaleString('en-IN')}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="muted small">Sales {S.bills} bills, purchases {P.bills} bills. Net GST assumes all purchase GST is claimed as credit. Your CA will adjust for ineligible credit and last month's balance.</p>
          <div className="btnrow" style={{ paddingTop: 0 }}><button className="ghost sm" disabled={!!busy} onClick={gstPdf}>Share GST summary PDF</button></div>

          <h2 className="h2" style={{ marginTop: 18 }}>How the firm is doing</h2>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th></th><th>{ymLabel(ym).split(' ')[0]}</th><th>{ymLabel(prevYm(ym)).split(' ')[0]}</th><th>Change</th></tr></thead>
              <tbody>{rows.map(([l, a, b, t]) => { const c = t === 'p' ? (a - b).toFixed(1) + ' pts' : pct(a, b) == null ? '-' : (pct(a, b) > 0 ? '+' : '') + pct(a, b) + '%'; return <tr key={l}><td>{l}</td><td>{fmt(a, t)}</td><td>{fmt(b, t)}</td><td>{c}</td></tr> })}</tbody>
            </table>
          </div>
          {insights.map(([h, t]) => <div key={h} className="chartcard" style={{ marginTop: 10 }}><b>{h}</b><p className="muted small" style={{ margin: '4px 0 0' }}>{t}</p></div>)}
          <div className="btnrow"><button className="ghost sm" disabled={!!busy} onClick={healthPdf}>Share business summary PDF</button></div>
          <p className="muted small">Gross profit uses the cost price of what was sold. Stock days and collection days use today's stock and dues.</p>
        </>
      )}
    </>
  )
}