import { useEffect, useMemo, useState } from 'react'
import { fetchAll, num, L, SHOP } from './util'
import ExportBar from './Export'
import { dmy, m2 } from './dates'

// Daily, weekly and monthly profit. Net.Amt, ProValue and Profit are the same figures as Profit Maker's "Date Wise Cummulative".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pd = (s) => new Date(s + 'T00:00:00')
const isoD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const weekStart = (s) => { const d = pd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoD(d) }
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return isoD(d) }

export default function Profit({ fys }) {
  const [fy, setFy] = useState('')
  const [view, setView] = useState('day')
  const [basis, setBasis] = useState('pm')
  const [mon, setMon] = useState('')
  const [rows, setRows] = useState(null)
  useEffect(() => { if (!fy && fys.length) setFy(fys[fys.length - 1]) }, [fys, fy])
  useEffect(() => {
    if (!fy) return
    let stale = false
    setRows(null)
    fetchAll('fy_margin_daily', 'd,bills,net,margin,sales_ex,gst_in', (q) => q.eq('fy', fy), 'pd:' + fy).then((d) => { if (!stale) setRows(d) }).catch(() => { if (!stale) setRows([]) })
    return () => { stale = true }
  }, [fy])

  // profit per day: as Profit Maker shows (includes GST), or before GST (net GST taken out)
  const day = useMemo(() => (rows || []).map((r) => {
    const net = Number(r.net), mg = Number(r.margin), gst = net - Number(r.sales_ex) - Number(r.gst_in)
    return { d: r.d, bills: Number(r.bills), net, cost: net - mg, pm: mg, bg: Number(r.sales_ex) > 0 ? mg - gst : mg, ex: Number(r.sales_ex) }
  }).sort((a, b) => a.d.localeCompare(b.d)), [rows])
  const months = useMemo(() => [...new Set(day.map((x) => x.d.slice(0, 7)))], [day])
  useEffect(() => { if (months.length && !months.includes(mon)) setMon(months[months.length - 1]) }, [months, mon])

  const agg = (key) => { const m = new Map(); day.forEach((x) => { const k = key(x.d); const e = m.get(k) || { k, bills: 0, net: 0, cost: 0, pm: 0, bg: 0, ex: 0, days: 0 }; e.bills += x.bills; e.net += x.net; e.cost += x.cost; e.pm += x.pm; e.bg += x.bg; e.ex += x.ex; e.days++; m.set(k, e) }); return [...m.values()] }
  const list = useMemo(() => {
    if (view === 'day') return day.filter((x) => x.d.startsWith(mon)).map((x) => ({ ...x, k: x.d, label: dmy(x.d) }))
    if (view === 'week') return agg(weekStart).map((x) => ({ ...x, label: dmy(x.k).slice(0, 5) + ' to ' + dmy(addDays(x.k, 6)).slice(0, 5) }))
    return agg((d) => d.slice(0, 7)).map((x) => ({ ...x, label: MON[Number(x.k.slice(5, 7)) - 1] + ' ' + x.k.slice(0, 4) }))
  }, [day, view, mon])
  const val = (x) => (basis === 'pm' ? x.pm : x.bg)
  const tot = list.reduce((s, x) => ({ bills: s.bills + x.bills, net: s.net + x.net, cost: s.cost + x.cost, p: s.p + val(x) }), { bills: 0, net: 0, cost: 0, p: 0 })
  const best = list.length ? list.reduce((a, b) => (val(b) > val(a) ? b : a)) : null
  const worst = list.length ? list.reduce((a, b) => (val(b) < val(a) ? b : a)) : null
  const mx = Math.max(1, ...list.map((x) => Math.abs(val(x))))
  const pct = (x) => (x.net ? (val(x) / x.net) * 100 : 0)

  const build = () => ({ title: 'Profit - ' + (view === 'day' ? 'day wise' : view === 'week' ? 'week wise' : 'month wise'), subtitle: SHOP + ' | ' + fy + (view === 'day' ? ' | ' + mon : '') + ' | ' + (basis === 'pm' ? 'as Profit Maker shows' : 'before GST'),
    filename: 'profit-' + view + '-' + fy, columns: [view === 'day' ? 'Date' : view === 'week' ? 'Week (Mon-Sun)' : 'Month', 'Bills', 'Net.Amt', 'ProValue', 'Profit', '% of sales'], numCols: [1, 2, 3, 4, 5],
    rows: [...list.map((x) => [x.label, x.bills, Math.round(x.net * 100) / 100, Math.round(x.cost * 100) / 100, Math.round(val(x) * 100) / 100, Math.round(pct(x) * 10) / 10]), ['Grand Total', tot.bills, Math.round(tot.net * 100) / 100, Math.round(tot.cost * 100) / 100, Math.round(tot.p * 100) / 100, tot.net ? Math.round(tot.p / tot.net * 1000) / 10 : 0]], bold: [list.length] })

  return (
    <div>
      <div className="filters">
        <div className="seg">{[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        <select value={fy} onChange={(e) => setFy(e.target.value)}>{fys.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        {view === 'day' && months.length > 0 && <select value={mon} onChange={(e) => setMon(e.target.value)}>{months.map((m) => <option key={m} value={m}>{MON[Number(m.slice(5)) - 1] + ' ' + m.slice(0, 4)}</option>)}</select>}
      </div>
      <div className="seg" style={{ marginTop: 8, width: 'fit-content' }}>{[['pm', 'As Profit Maker shows'], ['bg', 'Before GST']].map(([k, l]) => <button key={k} className={basis === k ? 'on' : ''} onClick={() => setBasis(k)}>{l}</button>)}</div>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && <div className="empty"><b>No daily profit loaded for {fy}</b><span>Run migration-22.sql in Supabase, then run history.ps1 for this year.</span></div>}
      {rows && rows.length > 0 && (
        <>
          <div className="minis" style={{ marginTop: 12 }}>
            <div className="mini"><span>Sales (Net.Amt)</span><b>{L(tot.net)}</b></div>
            <div className="mini"><span>Profit</span><b>{L(tot.p)}</b></div>
            <div className="mini"><span>% of sales</span><b>{tot.net ? ((tot.p / tot.net) * 100).toFixed(1) : '0.0'}%</b></div>
          </div>
          {best && list.length > 1 && <p className="muted small" style={{ margin: '8px 0 0' }}>Best: {best.label} ({L(val(best))}). Lowest: {worst.label} ({L(val(worst))}).</p>}
          <div className="chartcard" style={{ marginTop: 10 }}>
            <svg viewBox={'0 0 ' + Math.max(300, list.length * 14) + ' 90'} style={{ width: '100%', height: 90 }} preserveAspectRatio="none" role="img" aria-label="Profit chart">
              {list.map((x, i) => { const h = Math.max(1, (Math.abs(val(x)) / mx) * 80); const W = Math.max(300, list.length * 14) / list.length; return <rect key={x.k} x={i * W + W * 0.15} y={85 - h} width={W * 0.7} height={h} rx="2" fill={val(x) >= 0 ? 'var(--accent)' : '#dc2626'} /> })}
            </svg>
          </div>
          <div style={{ margin: '10px 0 4px' }}><ExportBar build={build} /></div>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th style={{ textAlign: 'left' }}>{view === 'day' ? 'Date' : view === 'week' ? 'Week' : 'Month'}</th><th>Net.Amt</th><th>ProValue</th><th>Profit</th><th>%</th></tr></thead>
              <tbody>
                {list.map((x) => <tr key={x.k}><td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{x.label}{view !== 'day' && <div className="muted small">{x.bills} bills</div>}</td><td>{m2(x.net)}</td><td>{m2(x.cost)}</td><td><b style={val(x) < 0 ? { color: '#dc2626' } : null}>{m2(val(x))}</b></td><td>{pct(x).toFixed(1)}</td></tr>)}
                <tr className="t"><td style={{ textAlign: 'left' }}>Grand Total</td><td>{m2(tot.net)}</td><td>{m2(tot.cost)}</td><td>{m2(tot.p)}</td><td>{tot.net ? ((tot.p / tot.net) * 100).toFixed(1) : '0.0'}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">ProValue is the cost of goods sold, with GST, as Profit Maker prints it. Sales returns are not deducted, the same as Profit Maker.{basis === 'bg' ? ' Before GST takes out the net GST (collected minus paid on purchase).' : ''}</p>
        </>
      )}
    </div>
  )
}
