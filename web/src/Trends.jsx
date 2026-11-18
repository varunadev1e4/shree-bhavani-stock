import { useEffect, useMemo, useState } from 'react'
import { fetchAll } from './util'

const MON = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
const COL = ['#94a3b8', '#6366f1', '#0d9488', '#f59e0b']
const KINDS = [['S', 'Sales'], ['P', 'Purchases'], ['RS', 'Receipts'], ['PA', 'Payments']]
const idx = (ym) => (ym % 100 + 8) % 12
const L = (v) => (v >= 1e7 ? '\u20B9' + (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? '\u20B9' + (v / 1e5).toFixed(1) + ' L' : '\u20B9' + Math.round(v).toLocaleString('en-IN'))
const fyName = (f) => f.replace('20', '').replace('-', '-')

function Chart({ ser, mi, setMi }) {
  const W = 360, H = 200, l = 6, r = 6, t = 14, b = 22, w = W - l - r, h = H - t - b
  const max = Math.max(1, ...ser.flatMap((s) => s.a.filter((v) => v != null)))
  const x = (i) => l + (i * w) / 11, y = (v) => t + (1 - v / max) * h
  const path = (a) => { let d = '', pen = false; a.forEach((v, i) => { if (v == null) { pen = false; return } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true }); return d }
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className="chart">
      {[0, 0.5, 1].map((g) => <g key={g}><line x1={l} x2={W - r} y1={y(max * g)} y2={y(max * g)} className="gl" /><text x={l + 2} y={y(max * g) - 3} className="gt">{L(max * g)}</text></g>)}
      {MON.map((m, i) => <text key={m} x={x(i)} y={H - 7} textAnchor="middle" className="gt">{m}</text>)}
      {mi != null && <line x1={x(mi)} x2={x(mi)} y1={t} y2={t + h} className="sel" />}
      {ser.map((s, k) => (
        <g key={s.f}><path d={path(s.a)} fill="none" stroke={COL[k % COL.length]} strokeWidth={k === ser.length - 1 ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
          {mi != null && s.a[mi] != null && <circle cx={x(mi)} cy={y(s.a[mi])} r="4" fill={COL[k % COL.length]} />}</g>
      ))}
      {MON.map((m, i) => <rect key={m + 'h'} x={x(i) - w / 22} y="0" width={w / 11} height={H} fill="transparent" onClick={() => setMi(i)} />)}
    </svg>
  )
}

function Bars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.v))
  return (
    <ul className="bars">{items.map((i) => (
      <li key={i.k}><div className="bl"><span>{i.k}</span><b>{L(i.v)}</b></div><div className="bt"><div className="bf" style={{ width: (i.v / max) * 100 + '%' }} /></div></li>
    ))}</ul>
  )
}

export default function Trends() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState('S')
  const [fy, setFy] = useState('')
  const [mi, setMi] = useState(null)
  const [rank, setRank] = useState('company')
  const [pm, setPm] = useState([])
  const [pp, setPp] = useState([])

  useEffect(() => {
    fetchAll('fy_monthly', 'fy,ym,kind,bills,amount')
      .then((d) => { setRows(d); const f = [...new Set(d.map((x) => x.fy))].sort(); setFy(f[f.length - 1] || '') })
      .catch((e) => setErr(e.message)).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!fy) return
    setPm([]); setPp([])
    fetchAll('fy_product_monthly', 'ym,product,company,qty,amount', (q) => q.eq('fy', fy)).then(setPm).catch(() => {})
    fetchAll('fy_party_monthly', 'ym,party,amount', (q) => q.eq('fy', fy)).then(setPp).catch(() => {})
  }, [fy])

  const fys = useMemo(() => [...new Set(rows.map((r) => r.fy))].sort(), [rows])
  const ser = useMemo(() => fys.map((f) => {
    const a = Array(12).fill(null)
    rows.filter((r) => r.fy === f && r.kind === kind).forEach((r) => { const i = idx(r.ym); a[i] = (a[i] || 0) + Number(r.amount) })
    return { f, a }
  }), [rows, fys, kind])

  const last = ser.length ? Math.max(0, ...ser[ser.length - 1].a.map((v, i) => (v != null ? i : 0))) : 0
  const cur = mi == null ? last : mi
  const same = (a) => a.slice(0, last + 1).reduce((s, v) => s + (v || 0), 0)
  const top = (list, key) => {
    const m = new Map()
    list.forEach((r) => m.set(r[key] || 'Other', (m.get(r[key] || 'Other') || 0) + Number(r.amount)))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ k, v }))
  }
  const items = rank === 'company' ? top(pm, 'company') : rank === 'product' ? top(pm, 'product') : top(pp, 'party')

  return (
    <div>
      {err && <p className="error pad">{err}</p>}
      {loading && <p className="muted pad">Loading...</p>}
      {!loading && !fys.length && <div className="empty"><b>No history yet</b><span>Run the history upload on the shop PC first.</span></div>}
      {fys.length > 0 && (
        <>
          <div className="qchips">{KINDS.map(([k, l]) => <button key={k} className={'qc' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{l}</button>)}</div>
          <p className="count muted">Same period compared: {MON[0]} to {MON[last]}</p>
          <div className="minis">
            {ser.map((s, k) => {
              const prev = k > 0 ? same(ser[k - 1].a) : 0, now = same(s.a), d = prev ? ((now - prev) / prev) * 100 : null
              return <div key={s.f} className="mini"><span>{s.f}</span><b>{L(now)}</b>{d != null && <small className={d >= 0 ? 'up' : 'dn'}>{d >= 0 ? '\u25B2 ' : '\u25BC '}{Math.abs(d).toFixed(1)}%</small>}</div>
            })}
          </div>
          <div className="chartcard">
            <Chart ser={ser} mi={cur} setMi={setMi} />
            <div className="legend">{ser.map((s, k) => <span key={s.f}><i style={{ background: COL[k % COL.length] }} />{s.f}: <b>{s.a[cur] != null ? L(s.a[cur]) : '-'}</b></span>)}</div>
            <p className="muted small" style={{ margin: '8px 6px 0' }}>Tap a month on the chart to compare it across years ({MON[cur]}).</p>
          </div>
          <h2 className="h2">Top sellers</h2>
          <div className="filters">
            <div className="seg">{[['company', 'Companies'], ['product', 'Products'], ['customer', 'Customers']].map(([k, l]) => <button key={k} className={rank === k ? 'on' : ''} onClick={() => setRank(k)}>{l}</button>)}</div>
            <select value={fy} onChange={(e) => setFy(e.target.value)}>{fys.map((f) => <option key={f} value={f}>{f}</option>)}</select>
          </div>
          {items.length ? <div className="chartcard"><Bars items={items} /></div> : <p className="muted pad">Loading...</p>}
        </>
      )}
    </div>
  )
}