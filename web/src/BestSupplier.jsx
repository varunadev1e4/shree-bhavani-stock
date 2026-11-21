import { useEffect, useMemo, useState } from 'react'
import { fetchAll, num } from './util'
import ExportBar from './Export'
import { dmy, m2, iso } from './dates'

// Which supplier gave each product cheapest. Cost per unit = money paid / (paid + free units), before GST.
const WIN = [[6, 'Last 6 months'], [12, 'Last 12 months'], [24, 'Last 2 years']]

export default function BestSupplier() {
  const [win, setWin] = useState(12)
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [openK, setOpenK] = useState('')
  useEffect(() => {
    let stale = false
    setRows(null)
    const t = new Date(); t.setMonth(t.getMonth() - win); const from = iso(t)
    fetchAll('sales_lines', 'd,bill_no,party,product,pack,qty,free,rate,dis,amount', (x) => x.eq('kind', 'P').gte('d', from), 'bs:' + from)
      .then((d) => { if (!stale) setRows(d) }).catch(() => { if (!stale) setRows([]) })
    return () => { stale = true }
  }, [win])

  const prods = useMemo(() => {
    const m = new Map()
    ;(rows || []).forEach((r) => {
      const units = Number(r.qty) + (Number(r.free) || 0)
      if (!(units > 0) || !(Number(r.amount) > 0)) return
      const k = r.product + '|' + (r.pack || '')
      if (!m.has(k)) m.set(k, { k, product: r.product, pack: r.pack, sup: new Map() })
      const p = m.get(k)
      if (!p.sup.has(r.party)) p.sup.set(r.party, { name: r.party, last: null, units: 0, paid: 0, n: 0 })
      const s = p.sup.get(r.party)
      s.n++; s.units += units; s.paid += Number(r.amount)
      if (!s.last || r.d > s.last.d) s.last = r
    })
    return [...m.values()].map((p) => {
      const sup = [...p.sup.values()].map((s) => ({ ...s, unit: Number(s.last.amount) / (Number(s.last.qty) + (Number(s.last.free) || 0)), avg: s.paid / s.units })).sort((a, b) => a.unit - b.unit)
      const best = sup[0], worst = sup[sup.length - 1]
      return { ...p, sup, gap: sup.length > 1 ? (worst.unit - best.unit) / worst.unit * 100 : 0 }
    })
  }, [rows])

  const shown = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (w.length) return prods.filter((p) => w.every((x) => p.product.toLowerCase().includes(x))).sort((a, b) => a.product.localeCompare(b.product)).slice(0, 60)
    return prods.filter((p) => p.sup.length > 1).sort((a, b) => b.gap - a.gap).slice(0, 40)
  }, [prods, q])

  const build = () => ({ title: 'Best supplier per product', subtitle: 'Cost per unit before GST, free units included. Last purchase from each supplier.', filename: 'best-supplier',
    columns: ['Product', 'Pack', 'Supplier', 'Last bought', 'Rate', 'Dis%', 'Free', 'Cost/unit', 'Rank'], numCols: [4, 5, 6, 7],
    rows: shown.flatMap((p) => p.sup.map((s, i) => [p.product, p.pack || '', s.name, dmy(s.last.d), Number(s.last.rate), Number(s.last.dis) || 0, Number(s.last.free) || 0, Math.round(s.unit * 100) / 100, i === 0 ? 'BEST' : ''])) })

  return (
    <div>
      <div className="qchips">{WIN.map(([k, l]) => <button key={k} className={'qc' + (win === k ? ' on' : '')} onClick={() => setWin(k)}>{l}</button>)}</div>
      <div className="searchbox sp"><input type="search" placeholder="Search a product (or leave empty to see biggest price gaps)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !shown.length && <div className="empty"><b>Nothing to compare</b><span>{q ? 'No purchases found for this product.' : 'No product was bought from two or more suppliers in this period.'}</span></div>}
      {rows && shown.length > 0 && (
        <>
          <ExportBar build={build} />
          <p className="muted small" style={{ margin: '0 0 6px' }}>{q.trim() ? 'Matching products' : 'Products bought from 2+ suppliers, biggest price gap first'}. Tap one to compare.</p>
          {shown.map((p) => {
            const on = openK === p.k || shown.length === 1
            return (
              <div key={p.k} className="chartcard" style={{ padding: 0, overflowX: 'auto', marginBottom: 8 }}>
                <button className="row" style={{ width: '100%', padding: '10px 12px' }} onClick={() => setOpenK(on ? '' : p.k)}>
                  <div className="info"><div className="name">{p.product} <span className="muted small">{p.pack}</span></div>
                    <div className="meta"><span>{p.sup.length} supplier{p.sup.length > 1 ? 's' : ''}</span><span>Best: {p.sup[0].name}</span></div></div>
                  <div className="amt">{p.gap > 0.5 ? 'Save ' + p.gap.toFixed(0) + '%' : m2(p.sup[0].unit)}</div>
                </button>
                {on && (
                  <table className="rtable">
                    <thead><tr><th style={{ textAlign: 'left' }}>Supplier</th><th>Last</th><th>Rate</th><th>Dis%</th><th>Free</th><th>Cost/unit</th></tr></thead>
                    <tbody>{p.sup.map((s, i) => (
                      <tr key={s.name} style={i === 0 ? { background: 'var(--accent-soft)' } : null}><td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{i === 0 && <b>Best: </b>}{s.name}<div className="muted small">{s.n} purchase{s.n > 1 ? 's' : ''}, avg {m2(s.avg)}</div></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{dmy(s.last.d).slice(0, 5)}</td><td>{m2(s.last.rate)}</td><td>{num(s.last.dis)}</td><td>{Number(s.last.free) ? num(s.last.free) : ''}</td><td><b>{m2(s.unit)}</b></td></tr>))}</tbody>
                  </table>
                )}
              </div>)
          })}
        </>
      )}
    </div>
  )
}
