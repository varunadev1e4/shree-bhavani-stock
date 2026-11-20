import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, num, SHOP, GSTIN } from './util'
import { exportPdf, xlsxBlob, deliverMany } from './exporter'
import MonthPick, { curYm } from './MonthPick'
import { staffCost } from './staffcalc'
import { salesRegister, purchaseRegister, hsnReport, gstSummary, dmy } from './gst'
import { showMsg } from './dialog'

const pad = (v) => String(v).padStart(2, '0')
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
  // Margin before GST = the profit Profit Maker stored on each bill, less the NET GST in it (GST collected on sales minus GST paid when buying those goods).
  const st = fp.stored || [], stNet = st.reduce((s, r) => s + Number(r.net || 0), 0), stMg = st.reduce((s, r) => s + Number(r.margin || 0), 0)
  const stEx = st.reduce((s, r) => s + Number(r.sales_ex || 0), 0), stIn = st.reduce((s, r) => s + Number(r.gst_in || 0), 0)
  const exact = st.length > 0 && stEx > 0
  const gp = exact ? stMg - (stNet - stEx - stIn) : sx - cost
  return { sales, purch, bills: S.length, credit, cash: sales - credit, parties: byParty.size, top, top5: top.slice(0, 5).reduce((s, x) => s + x[1], 0),
    gp, gpPct: sx ? (gp / sx) * 100 : 0, cost, days, avg: S.length ? sales / S.length : 0 }
}

export default function CA() {
  const [ym, setYm] = useState(() => prevYm(curYm())) // last full month
  const [bills, setBills] = useState(null)
  const [prev, setPrev] = useState([])
  const [hsn, setHsn] = useState([])
  const [fp, setFp] = useState([])
  const [fpPrev, setFpPrev] = useState([])
  const [stock, setStock] = useState([])
  const [parties, setParties] = useState([])
  const [exp, setExp] = useState([])
  const [expPrev, setExpPrev] = useState([])
  const [emps, setEmps] = useState([])
  const [ents, setEnts] = useState([])
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
      g('expenses', 'amount', (q) => q.gte('d', sp.from).lte('d', sp.to), 'ex:' + ym),
      g('expenses', 'amount', (q) => q.gte('d', sq.from).lte('d', sq.to), 'exp:' + ym),
      g('fy_margin_monthly', 'net,margin', (q) => q.eq('ym', ym), 'mg:' + ym),
      g('fy_margin_monthly', 'net,margin', (q) => q.eq('ym', prevYm(ym)), 'mgp:' + ym),
      g('employees', '*', null, 'emps'),
      g('emp_entries', '*', null, 'ents'),
    ]).then(([b, p, h, f, fpv, s, pa, e1, e0, m1, m0, em, en]) => { if (stale) return; f.stored = m1; fpv.stored = m0; setBills(b); setPrev(p); setHsn(h); setFp(f); setFpPrev(fpv); setStock(s); setParties(pa); setExp(e1); setExpPrev(e0); setEmps(em); setEnts(en) })
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
  // The phone only opens WhatsApp / the share sheet if the share is called right when you tap, so the files are built beforehand.
  const [ready, setReady] = useState(null)
  useEffect(() => { import('xlsx'); import('jspdf'); import('jspdf-autotable') }, [])
  useEffect(() => {
    setReady(null)
    if (!bills || !bills.length) return
    let stale = false
    Promise.all(FILES.map(make)).then((r) => { if (!stale) setReady(r) }).catch(() => {})
    return () => { stale = true }
  }, [bills, hsn])
  const run = async (key, fn) => { setBusy(key); try { await fn() } catch (e) { showMsg('Could not make the file: ' + e.message) } setBusy('') }
  const shareAll = () => ready && deliverMany(ready, 'GST files ' + ymLabel(ym))
  const shareOne = (i) => ready && deliverMany([ready[i]], FILES[i][0] + ' ' + ymLabel(ym))

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

  const xNow = exp.reduce((s, r) => s + Number(r.amount), 0), xOld = expPrev.reduce((s, r) => s + Number(r.amount), 0)
  const sNow = staffCost(emps, ents, ym), sOld = staffCost(emps, ents, prevYm(ym))
  const rows = cur ? [
    ['Sales (with GST)', cur.sales, old.sales, 'rs'], ['Purchases (with GST)', cur.purch, old.purch, 'rs'], ['Bills made', cur.bills, old.bills, 'n'],
    ['Average bill', cur.avg, old.avg, 'rs'], ['Customers billed', cur.parties, old.parties, 'n'],
    ['Gross profit (sales less cost)', cur.gp, old.gp, 'rs'], ['Gross margin %', cur.gpPct, old.gpPct, 'p'],
    ['Shop expenses', xNow, xOld, 'rs'], ['Staff salary cost', sNow, sOld, 'rs'], ['Profit after expenses', cur.gp - xNow - sNow, old.gp - xOld - sOld, 'rs'],
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
      <MonthPick ym={ym} onChange={setYm} />
      {!bills && <p className="muted pad">Loading...</p>}
      {none && <div className="empty"><b>No bills for {ymLabel(ym)}</b><span>Run migration-9 in Supabase, then load the year once (delete history.last and run run-sync.bat, or run history.ps1 for older years).</span></div>}
      {bills && !none && (
        <>
          <button className="primary" style={{ width: '100%' }} disabled={!ready} onClick={shareAll}>{ready ? 'Share all 4 files for ' + ymLabel(ym) : 'Preparing files...'}</button>
          <div className="btnrow">{FILES.map((f, i) => <button key={f[1]} className="ghost sm" disabled={!ready} onClick={() => shareOne(i)}>{f[0]}</button>)}</div>

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
          <p className="muted small">Profit after expenses is gross profit less the Expenses and Staff you recorded in this app. {xNow + sNow === 0 ? 'Nothing is recorded for this month yet, so it equals gross profit. ' : ''}Gross profit uses the cost price of what was sold. Stock days and collection days use today's stock and dues.</p>
        </>
      )}
    </>
  )
}