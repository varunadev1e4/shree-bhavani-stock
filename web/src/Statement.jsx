import { useEffect, useMemo, useState } from 'react'
import { fetchAll, num, rs } from './util'
import ExportBar from './Export'

// Same layout and rules as Profit Maker's "Stock & Sales Statement".
//   Qoh   = stock on the "To" date  = stock now + sold after To - bought after To
//   O.Stk = Qoh - Purc + Sale
//   Sale / Purc include free quantity. Value = quantity x the product's cost price (Value columns are at cost).
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const PRESETS = [['month', 'This month'], ['lmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom']]
function range(p) {
  const t = new Date(), m1 = new Date(t.getFullYear(), t.getMonth(), 1)
  const l1 = new Date(t.getFullYear(), t.getMonth() - 1, 1), l2 = new Date(t.getFullYear(), t.getMonth(), 0)
  const fy = new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1)
  return ({ month: [m1, t], lmonth: [l1, l2], year: [fy, t] })[p].map(iso)
}
const money = (v) => (v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
const key = (c, p) => (c || 'Other') + '|' + String(p).trim().toLowerCase()

export default function Statement({ stock }) {
  const [preset, setPreset] = useState('month')
  const [[from, to], setDates] = useState(range('month'))
  const [company, setCompany] = useState('')
  const [hideZero, setHideZero] = useState(false)
  const [lines, setLines] = useState(null)

  useEffect(() => {
    let stale = false
    setLines(null)
    fetchAll('sales_lines', 'kind,d,company,product,qty,free', (q) => q.in('kind', ['S', 'P']).gte('d', from), 'stmt:' + from)
      .then((d) => { if (!stale) setLines(d) }).catch(() => { if (!stale) setLines([]) })
    return () => { stale = true }
  }, [from])

  const pick = (p) => { setPreset(p); if (p !== 'custom') setDates(range(p)) }
  const companies = useMemo(() => [...new Set((stock || []).map((s) => s.company || 'Other'))].sort(), [stock])

  const data = useMemo(() => {
    if (!lines || !stock) return null
    const mv = new Map()
    const get = (k) => { let m = mv.get(k); if (!m) { m = { sIn: 0, pIn: 0, sAfter: 0, pAfter: 0 }; mv.set(k, m) } return m }
    lines.forEach((r) => {
      const q = Number(r.qty) + (Number(r.free) || 0), m = get(key(r.company, r.product))
      if (r.d > to) { if (r.kind === 'S') m.sAfter += q; else m.pAfter += q } else if (r.kind === 'S') m.sIn += q; else m.pIn += q
    })
    const ref = new Date(Math.min(new Date(to + 'T00:00:00'), new Date()))
    const groups = new Map()
    stock.filter((s) => !company || (s.company || 'Other') === company).forEach((s) => {
      const m = mv.get(key(s.company, s.name)) || { sIn: 0, pIn: 0, sAfter: 0, pAfter: 0 }
      const qoh = Number(s.total_qty) + m.sAfter - m.pAfter
      const cost = Number(s.cost_price) || 0
      const r = { name: s.name, pack: s.packing || '', open: qoh - m.pIn + m.sIn, pur: m.pIn, sale: m.sIn, qoh, cost,
        age: s.last_purchase ? Math.max(0, Math.round((ref - new Date(s.last_purchase + 'T00:00:00')) / 864e5)) : null }
      if (hideZero && !r.open && !r.pur && !r.sale && !r.qoh) return
      const c = s.company || 'Other'
      if (!groups.has(c)) groups.set(c, [])
      groups.get(c).push(r)
    })
    const list = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, rows]) => {
      rows.sort((a, b) => a.name.localeCompare(b.name))
      const t = rows.reduce((x, r) => ({ ov: x.ov + r.open * r.cost, pv: x.pv + r.pur * r.cost, sv: x.sv + r.sale * r.cost, cv: x.cv + r.qoh * r.cost }), { ov: 0, pv: 0, sv: 0, cv: 0 })
      return { company: c, rows, t }
    })
    const g = list.reduce((x, c) => ({ ov: x.ov + c.t.ov, pv: x.pv + c.t.pv, sv: x.sv + c.t.sv, cv: x.cv + c.t.cv }), { ov: 0, pv: 0, sv: 0, cv: 0 })
    return { list, g, noCost: stock.length > 0 && !stock.some((s) => Number(s.cost_price) > 0) }
  }, [lines, stock, to, company, hideZero])

  const build = () => {
    const rows = [], bold = []
    data.list.forEach((c) => {
      rows.push(['', 'Company : ' + c.company, '', '', '', '', '', '', '']); bold.push(rows.length - 1)
      c.rows.forEach((r) => rows.push([r.age == null ? '' : r.age, r.name, r.pack, r.open, r.pur, r.open + r.pur, r.sale, r.qoh, money(r.qoh * r.cost)]))
      rows.push(['', 'Total ' + c.company, '', '', '', '', '', '', money(c.t.cv)]); bold.push(rows.length - 1)
    })
    ;[['Opening Value', data.g.ov], ['Purchase Value', data.g.pv], ['Sale Value (at cost)', data.g.sv], ['Closing Value', data.g.cv]].forEach(([l, v]) => { rows.push(['', l, '', '', '', '', '', '', money(v)]); bold.push(rows.length - 1) })
    return { title: 'Stock & Sales Statement', subtitle: 'From ' + dmy(from) + ' To ' + dmy(to) + (company ? ' | ' + company : ''), filename: 'stock-sales-statement',
      columns: ['Age', 'Product Name', 'Pack', 'O.Stk', 'Purc', 'Tot', 'Sale', 'Qoh', 'Value'], rows, bold, numCols: [0, 3, 4, 5, 6, 7, 8] }
  }

  return (
    <>
      <p className="muted small" style={{ margin: '0 0 8px' }}>Same figures as Profit Maker's Stock &amp; Sales Statement. Values are at cost price.</p>
      <div className="qchips">{PRESETS.map(([k, l]) => <button key={k} className={'qc' + (preset === k ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}</div>
      {preset === 'custom' && <div className="dates"><input type="date" value={from} max={to} onChange={(e) => setDates([e.target.value, to])} /><input type="date" value={to} min={from} onChange={(e) => setDates([from, e.target.value])} /></div>}
      <div className="fgrid" style={{ gridTemplateColumns: '1fr auto', marginTop: 10 }}>
        <select value={company} onChange={(e) => setCompany(e.target.value)}><option value="">All companies</option>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <button className={'toggle' + (hideZero ? ' on' : '')} onClick={() => setHideZero(!hideZero)}>Hide empty</button>
      </div>
      {!data && <p className="muted pad">Loading...</p>}
      {data && data.noCost && <p className="error pad">Cost prices are not loaded yet. Run migration-8 in Supabase, then run the sync once.</p>}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            {[['Opening', data.g.ov], ['Purchase', data.g.pv], ['Sale (at cost)', data.g.sv], ['Closing', data.g.cv]].map(([l, v]) => (
              <div key={l} className="mini" style={{ minWidth: 0, flex: 'none' }}><span>{l}</span><b style={{ fontSize: 'clamp(15px, 4.4vw, 20px)', overflowWrap: 'anywhere' }}>{rs(v)}</b></div>))}
          </div>
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th>Age</th><th style={{ textAlign: 'left' }}>Product</th><th>Pack</th><th>O.Stk</th><th>Purc</th><th>Tot</th><th>Sale</th><th>Qoh</th><th>Value</th></tr></thead>
              <tbody>
                {data.list.map((c) => [
                  <tr key={c.company} className="g"><td colSpan={9} style={{ textAlign: 'left' }}>Company : {c.company}</td></tr>,
                  ...c.rows.map((r, i) => (
                    <tr key={c.company + i}>
                      <td>{r.age == null ? '' : r.age}</td><td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{r.name}</td><td>{r.pack}</td>
                      <td>{num(r.open)}</td><td>{num(r.pur)}</td><td>{num(r.open + r.pur)}</td><td>{num(r.sale)}</td><td>{num(r.qoh)}</td><td>{money(r.qoh * r.cost)}</td>
                    </tr>)),
                  <tr key={c.company + 't'} className="t"><td colSpan={8} style={{ textAlign: 'left' }}>Total {c.company}</td><td>{money(c.t.cv)}</td></tr>,
                ])}
              </tbody>
            </table>
          </div>
          <div className="chartcard" style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 14 }}>
            {[['Opening Value', data.g.ov], ['Purchase Value', data.g.pv], ['Sale Value (at cost)', data.g.sv], ['Closing Value', data.g.cv]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l}</span><b>{money(v)}</b></div>))}
          </div>
          {!data.list.length && <div className="empty"><b>Nothing to show</b></div>}
        </>
      )}
    </>
  )
}