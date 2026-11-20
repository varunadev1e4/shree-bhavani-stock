import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, L } from './util'
import { staffCost } from './staffcalc'
import ExportBar from './Export'

// Money actually moving each month: what came in and what went out, not just profit.
// In  = payments received from customers + cash sales.   Out = payments to companies + cash purchases + shop expenses + staff salaries.
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (ym) => MN[(ym % 100) - 1] + ' ' + String(Math.floor(ym / 100)).slice(2)
const ymOf = (d) => Number(d.slice(0, 4)) * 100 + Number(d.slice(5, 7))
const mm = (v) => Math.round(Number(v) || 0)

export default function CashFlow({ fys }) {
  const [fy, setFy] = useState('')
  const [d, setD] = useState(null)
  useEffect(() => { if (!fy && fys.length) setFy(fys[fys.length - 1]) }, [fys, fy])
  useEffect(() => {
    if (!fy) return
    let stale = false; setD(null)
    const y1 = Number(fy.slice(0, 4)), a = y1 + '-04-01', b = (y1 + 1) + '-03-31', g = (t, c, f, k) => fetchAll(t, c, f, k).catch(() => [])
    Promise.all([
      g('fy_monthly', 'ym,kind,amount', (q) => q.eq('fy', fy).in('kind', ['RS', 'PA']), 'cf1:' + fy),
      g('gst_bills', 'kind,typ,net,feed_date', (q) => q.eq('fy', fy).in('kind', ['S', 'P']), 'cf2:' + fy),
      g('expenses', 'd,amount', (q) => q.gte('d', a).lte('d', b), 'cf3:' + fy),
      g('employees', '*', null, 'emps'), g('emp_entries', '*', null, 'ents'),
    ]).then(([fm, gb, ex, em, en]) => { if (!stale) setD({ fm, gb, ex, em, en, y1 }) })
    return () => { stale = true }
  }, [fy])

  const rows = useMemo(() => {
    if (!d) return null
    const now = new Date(), cur = now.getFullYear() * 100 + now.getMonth() + 1, out = []
    for (let i = 0; i < 12; i++) {
      const m = (i < 9 ? d.y1 : d.y1 + 1) * 100 + ((i + 3) % 12) + 1
      if (m > cur) break
      const fmv = (k) => d.fm.filter((r) => Number(r.ym) === m && r.kind === k).reduce((s, r) => s + Number(r.amount), 0)
      const gbv = (k, t) => d.gb.filter((r) => r.kind === k && r.typ === t && ymOf(r.feed_date) === m).reduce((s, r) => s + Number(r.net), 0)
      const r = { m, collected: fmv('RS'), cashSales: gbv('S', 'Cash'), paid: fmv('PA'), cashPur: gbv('P', 'Cash'),
        exp: d.ex.filter((e) => ymOf(e.d) === m).reduce((s, e) => s + Number(e.amount), 0), sal: staffCost(d.em, d.en, m),
        credSales: gbv('S', 'Credit'), credPur: gbv('P', 'Credit') }
      r.in = r.collected + r.cashSales; r.out = r.paid + r.cashPur + r.exp + r.sal; r.net = r.in - r.out
      out.push(r)
    }
    return out
  }, [d])
  const T = useMemo(() => (rows || []).reduce((s, r) => { Object.keys(r).forEach((k) => { if (k !== 'm') s[k] = (s[k] || 0) + r[k] }); return s }, {}), [rows])

  const build = () => ({
    title: 'Monthly cash flow ' + fy, subtitle: 'Money in: customer payments + cash sales. Money out: payments to companies + cash purchases + expenses + salaries',
    filename: 'cash-flow-' + fy, columns: ['Month', 'From customers', 'Cash sales', 'Money in', 'Paid to companies', 'Cash purchases', 'Expenses', 'Salaries', 'Money out', 'Net cash'],
    rows: [...rows.map((r) => [label(r.m), mm(r.collected), mm(r.cashSales), mm(r.in), mm(r.paid), mm(r.cashPur), mm(r.exp), mm(r.sal), mm(r.out), mm(r.net)]),
      ['TOTAL', mm(T.collected), mm(T.cashSales), mm(T.in), mm(T.paid), mm(T.cashPur), mm(T.exp), mm(T.sal), mm(T.out), mm(T.net)]], bold: [rows.length], numCols: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  })
  const mx = rows ? Math.max(1, ...rows.map((r) => Math.max(r.in, r.out))) : 1
  const best = rows && rows.length ? rows.reduce((a, r) => (r.net > a.net ? r : a)) : null
  const worst = rows && rows.length ? rows.reduce((a, r) => (r.net < a.net ? r : a)) : null

  return (
    <>
      <div className="filters"><select value={fy} onChange={(e) => setFy(e.target.value)}>{fys.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && <div className="empty"><b>No data for {fy}</b><span>Load this year once with history.ps1.</span></div>}
      {rows && rows.length > 0 && (
        <>
          <div className="total"><span>Net cash, {fy}</span><b>{L(T.net)}</b><span>{L(T.in)} in, {L(T.out)} out</span></div>
          <div className="minis" style={{ marginTop: 10 }}>
            <div className="mini"><span>Credit sales minus collected</span><b className={T.credSales - T.collected > 0 ? 'dn' : 'up'}>{L(T.credSales - T.collected)}</b><small>{T.credSales - T.collected > 0 ? 'dues went up' : 'dues came down'}</small></div>
            <div className="mini"><span>Credit bought minus paid</span><b>{L(T.credPur - T.paid)}</b><small>{T.credPur - T.paid > 0 ? 'you owe more' : 'you owe less'}</small></div>
          </div>
          <div className="chartcard">
            <svg viewBox={'0 0 ' + (rows.length * 40 + 10) + ' 110'} className="chart" role="img" aria-label="Money in and out by month">
              {rows.map((r, i) => <g key={r.m}>
                <rect x={i * 40 + 6} y={90 - (r.in / mx) * 80} width="14" height={(r.in / mx) * 80} rx="3" fill="var(--accent)" />
                <rect x={i * 40 + 21} y={90 - (r.out / mx) * 80} width="14" height={(r.out / mx) * 80} rx="3" fill="#f59e0b" />
                <text x={i * 40 + 21} y="104" textAnchor="middle" className="gt">{label(r.m).slice(0, 3)}</text></g>)}
            </svg>
            <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Money in</span><span><i style={{ background: '#f59e0b' }} />Money out</span></div>
          </div>
          {best && worst && rows.length > 1 && <p className="muted small" style={{ margin: '8px 2px' }}>Best month {label(best.m)} ({L(best.net)}). Tightest month {label(worst.m)} ({L(worst.net)}).</p>}
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th style={{ textAlign: 'left' }}>Month</th><th>From customers</th><th>Cash sales</th><th>Paid to companies</th><th>Cash purchases</th><th>Expenses</th><th>Salaries</th><th>Net cash</th></tr></thead>
              <tbody>
                {rows.map((r) => <tr key={r.m}><td style={{ textAlign: 'left' }}>{label(r.m)}</td><td>{rs(r.collected)}</td><td>{rs(r.cashSales)}</td><td>{rs(r.paid)}</td><td>{rs(r.cashPur)}</td><td>{rs(r.exp)}</td><td>{rs(r.sal)}</td><td><b className={r.net < 0 ? 'dn' : ''}>{rs(r.net)}</b></td></tr>)}
                <tr className="t"><td style={{ textAlign: 'left' }}>Total</td><td>{rs(T.collected)}</td><td>{rs(T.cashSales)}</td><td>{rs(T.paid)}</td><td>{rs(T.cashPur)}</td><td>{rs(T.exp)}</td><td>{rs(T.sal)}</td><td>{rs(T.net)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>This is money moving through your books (payments received and made, cash bills, expenses and salaries entered in this app). Bank balance, loans and personal withdrawals are not included. Expenses and salaries show only what you entered in the Expenses and Staff screens.</p>
        </>)}
    </>
  )
}
