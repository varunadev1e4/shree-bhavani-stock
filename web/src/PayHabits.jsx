import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, L } from './util'
import ExportBar from './Export'

// How many days each customer takes to pay: every payment received, weighted by amount, from the bill date to the payment date.
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)
const fyStart = (t) => iso(new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1))
function from(p) {
  const t = new Date()
  if (p === '90') return iso(new Date(t.getTime() - 90 * 864e5))
  if (p === '180') return iso(new Date(t.getTime() - 180 * 864e5))
  if (p === 'fy') return fyStart(t)
  return iso(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate()))
}
const PERIODS = [['90', 'Last 3 months'], ['180', 'Last 6 months'], ['fy', 'This year'], ['365', 'Last 12 months']]
const CREDIT = [15, 30, 45, 60]

export default function PayHabits() {
  const [period, setPeriod] = useState('180')
  const [credit, setCredit] = useState(30)
  const [sort, setSort] = useState('slow')
  const [q, setQ] = useState('')
  const [pays, setPays] = useState(null)
  const [parties, setParties] = useState([])
  const [err, setErr] = useState('')
  const f = from(period)
  useEffect(() => {
    let stale = false
    setPays(null)
    fetchAll('bill_payments', 'acc_id,bill_no,bill_date,paid_date,amount', (x) => x.gte('paid_date', f), 'pay:' + f)
      .then((d) => { if (!stale) setPays(d) }).catch((e) => { if (!stale) { setErr(e.message + ' (run migration-18.sql and reload the year with history.ps1)'); setPays([]) } })
    return () => { stale = true }
  }, [f])
  useEffect(() => { fetchAll('parties', 'id,name,city,phone,phone2,receivable,age_90,age_90p,deleted').then(setParties).catch(() => {}) }, [])
  const byId = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties])

  const { list, tot } = useMemo(() => {
    const m = new Map()
    ;(pays || []).forEach((r) => {
      const d = dayDiff(r.bill_date, r.paid_date); if (d < 0) return
      const a = Number(r.amount), x = m.get(r.acc_id) || { id: r.acc_id, amt: 0, dw: 0, n: 0, within: 0 }
      x.amt += a; x.dw += a * d; x.n++; if (d <= credit) x.within += a; m.set(r.acc_id, x)
    })
    const w = q.trim().toLowerCase()
    let all = [...m.values()].map((x) => { const p = byId.get(x.id) || {}; return { ...x, name: p.name || 'Account ' + x.id, city: p.city, phone: p.phone || p.phone2, pend: Math.max(Number(p.receivable) || 0, 0), old: (Number(p.age_90) || 0) + (Number(p.age_90p) || 0), days: x.amt ? x.dw / x.amt : 0, pct: x.amt ? (x.within / x.amt) * 100 : 0 } })
    const tt = all.reduce((s, x) => ({ a: s.a + x.amt, d: s.d + x.dw, w: s.w + x.within }), { a: 0, d: 0, w: 0 })
    all = all.filter((x) => !w || (x.name + ' ' + (x.city || '')).toLowerCase().includes(w))
    all.sort(sort === 'slow' ? (a, b) => b.days - a.days : sort === 'money' ? (a, b) => b.amt - a.amt : (a, b) => a.name.localeCompare(b.name))
    return { list: all, tot: { days: tt.a ? tt.d / tt.a : 0, pct: tt.a ? (tt.w / tt.a) * 100 : 0, amt: tt.a, n: all.length } }
  }, [pays, credit, q, sort, byId])

  const tag = (d) => (d <= credit ? ['On time', 'var(--good)'] : d <= credit * 1.5 ? ['Late', 'var(--warn)'] : ['Very late', 'var(--bad)'])
  const build = () => ({
    title: 'How fast customers pay', subtitle: 'Payments received since ' + dmy(f) + ' | credit period ' + credit + ' days', filename: 'pay-habits',
    columns: ['Customer', 'City', 'Received', 'Payments', 'Avg days to pay', 'Paid within ' + credit + ' d (%)', 'Pending now', 'Over 60 days', 'Status'],
    rows: list.map((x) => [x.name, x.city || '', Math.round(x.amt), x.n, Math.round(x.days), Math.round(x.pct), Math.round(x.pend), Math.round(x.old), tag(x.days)[0]]), bold: [], numCols: [2, 3, 4, 5, 6, 7],
  })

  return (
    <>
      <div className="qchips">{PERIODS.map(([k, l]) => <button key={k} className={'qc' + (period === k ? ' on' : '')} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      <div className="filters" style={{ marginTop: 8 }}>
        <span className="muted small">Credit period</span>
        <div className="seg">{CREDIT.map((c) => <button key={c} className={credit === c ? 'on' : ''} onClick={() => setCredit(c)}>{c}d</button>)}</div>
      </div>
      {err && <p className="error pad">{err}</p>}
      {!pays && <p className="muted pad">Loading...</p>}
      {pays && !pays.length && !err && <div className="empty"><b>No payments found</b><span>Run migration-18.sql, then reload this year once with history.ps1.</span></div>}
      {pays && pays.length > 0 && (
        <>
          <div className="minis" style={{ marginTop: 12 }}>
            <div className="mini"><span>Average days to pay</span><b>{Math.round(tot.days)}</b></div>
            <div className="mini"><span>Paid within {credit} days</span><b>{Math.round(tot.pct)}%</b></div>
            <div className="mini"><span>Money received</span><b>{L(tot.amt)}</b></div>
          </div>
          <div className="searchbox sp"><input type="search" placeholder="Search customer or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="filters"><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="slow">Slowest payers first</option><option value="money">Most money first</option><option value="name">A to Z</option></select></div>
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
          <ul className="list">
            {list.map((x) => { const [t, c] = tag(x.days); return (
              <li key={x.id} className="card"><div className="row static">
                <div className="info"><div className="name">{x.name}</div>
                  <div className="meta"><span>{x.city}</span><span>{rs(x.amt)} in {x.n} payment{x.n > 1 ? 's' : ''}</span><span>{Math.round(x.pct)}% within {credit} days</span></div>
                  <div className="meta"><span>Pending now {rs(x.pend)}{x.old > 0.5 ? ' (' + rs(x.old) + ' over 60 days)' : ''}</span>{x.phone && <a href={'tel:' + String(x.phone).replace(/\D/g, '')} style={{ color: 'var(--accent)' }}>Call</a>}</div></div>
                <div className="qty"><b style={{ color: c }}>{Math.round(x.days)}</b><small>days to pay</small><div className="pill" style={{ color: c, marginTop: 4 }}>{t}</div></div>
              </div></li>) })}
          </ul>
          <p className="muted small" style={{ marginTop: 12 }}>Days are counted from the bill date to the day the money was received, weighted by the amount, so a big late payment counts more than a small one. Cash bills are not included.</p>
        </>)}
    </>
  )
}
