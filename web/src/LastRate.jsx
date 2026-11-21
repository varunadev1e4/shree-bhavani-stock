import { useEffect, useMemo, useState } from 'react'
import { fetchAll, num } from './util'
import ExportBar from './Export'
import { dmy, m2 } from './dates'

// What rate, discount and free quantity each product was last sold to one customer (before GST).
export default function LastRate({ parties }) {
  const [pq, setPq] = useState('')
  const [cust, setCust] = useState(null)
  const [rows, setRows] = useState(null)
  const [text, setText] = useState('')
  const [openK, setOpenK] = useState('')

  const hits = useMemo(() => { const w = pq.trim().toLowerCase().split(/\s+/).filter(Boolean); return w.length && !cust ? parties.filter((p) => w.every((x) => (p.name + ' ' + (p.city || '')).toLowerCase().includes(x))).slice(0, 8) : [] }, [pq, parties, cust])
  useEffect(() => {
    if (!cust) return
    let stale = false
    setRows(null)
    fetchAll('sales_lines', 'd,bill_no,product,pack,batch,qty,free,rate,dis,gst', (q) => q.eq('kind', 'S').eq('party', cust.name), 'lr:' + cust.name)
      .then((d) => { if (!stale) setRows(d) }).catch(() => { if (!stale) setRows([]) })
    return () => { stale = true }
  }, [cust])

  const list = useMemo(() => {
    const w = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const m = new Map()
    ;(rows || []).forEach((r) => { const k = r.product + '|' + (r.pack || ''); if (!m.has(k)) m.set(k, { k, product: r.product, pack: r.pack, h: [] }); m.get(k).h.push(r) })
    return [...m.values()].filter((x) => w.every((t) => x.product.toLowerCase().includes(t))).map((x) => { x.h.sort((a, b) => b.d.localeCompare(a.d) || b.bill_no.localeCompare(a.bill_no, 'en', { numeric: true })); return x })
      .sort((a, b) => b.h[0].d.localeCompare(a.h[0].d))
  }, [rows, text])
  const net = (r) => Number(r.rate) * (1 - (Number(r.dis) || 0) / 100)

  const build = () => ({ title: 'Last rates: ' + cust.name, subtitle: 'Rates before GST. Latest sale of each product.', filename: 'last-rates-' + cust.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    columns: ['Product', 'Pack', 'Last date', 'Bill', 'Qty', 'Free', 'Rate', 'Dis%', 'Net rate'], numCols: [4, 5, 6, 7, 8],
    rows: list.map((x) => { const r = x.h[0]; return [x.product, x.pack || '', dmy(r.d), r.bill_no, Number(r.qty), Number(r.free), Number(r.rate), Number(r.dis) || 0, Math.round(net(r) * 100) / 100] }) })

  return (
    <div>
      <div className="searchbox sp"><input type="search" placeholder="Search customer name or city" value={cust ? cust.name : pq} onChange={(e) => { setCust(null); setRows(null); setPq(e.target.value) }} /></div>
      {hits.length > 0 && <ul className="list">{hits.map((p) => <li key={p.id} className="card"><button className="row" onClick={() => { setCust(p); setPq(''); setText('') }}><div className="info"><div className="name">{p.name}</div><div className="meta"><span>{p.city}</span></div></div></button></li>)}</ul>}
      {!cust && !hits.length && <div className="empty"><b>Pick a customer</b><span>You will see the last rate, discount and free quantity of every product sold to them.</span></div>}
      {cust && !rows && <p className="muted pad">Loading...</p>}
      {cust && rows && !rows.length && <div className="empty"><b>No sales found for {cust.name}</b><span>For an earlier year, load it once with history.ps1.</span></div>}
      {cust && rows && rows.length > 0 && (
        <>
          <div className="searchbox sp"><input type="search" placeholder="Filter products" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <ExportBar build={build} />
          <p className="muted small" style={{ margin: '0 0 6px' }}>{list.length} products. Rates are before GST. Tap a product for its earlier sales.</p>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th style={{ textAlign: 'left' }}>Product</th><th>Last</th><th>Rate</th><th>Dis%</th><th>Net</th><th>Free</th></tr></thead>
              <tbody>
                {list.map((x) => {
                  const r = x.h[0], on = openK === x.k
                  return [
                    <tr key={x.k} onClick={() => setOpenK(on ? '' : x.k)} style={{ cursor: 'pointer' }}><td style={{ textAlign: 'left', whiteSpace: 'normal' }}><b>{x.product}</b> <span className="muted small">{x.pack}</span><div className="muted small">{x.h.length} sale{x.h.length > 1 ? 's' : ''}</div></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{dmy(r.d).slice(0, 5)}<div className="muted small">qty {num(r.qty)}</div></td><td>{m2(r.rate)}</td><td>{num(r.dis)}</td><td><b>{m2(net(r))}</b></td><td>{Number(r.free) ? num(r.free) : ''}</td></tr>,
                    ...(on ? x.h.slice(1, 6).map((h, i) => <tr key={x.k + i} style={{ background: 'var(--accent-soft)' }}><td style={{ textAlign: 'left' }} className="muted small">Bill {h.bill_no}</td><td style={{ whiteSpace: 'nowrap' }}>{dmy(h.d).slice(0, 5)}<div className="muted small">qty {num(h.qty)}</div></td><td>{m2(h.rate)}</td><td>{num(h.dis)}</td><td>{m2(net(h))}</td><td>{Number(h.free) ? num(h.free) : ''}</td></tr>) : []),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
