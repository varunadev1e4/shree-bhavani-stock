import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, fmtExp, mk, num } from './util'
import ExportBar from './Export'
import { exportPdf } from './exporter'

const RANGES = [['exp', 'Expired'], [1, '1 month'], [3, '3 months'], [6, '6 months'], [12, '12 months']]

export default function Expiry() {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState(3)
  const [q, setQ] = useState('')
  const [by, setBy] = useState('company')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [b, p] = await Promise.all([
        fetchAll('batches', 'id,product_id,batch_no,exp_month,exp_year,qty,mrp,cost_price,supplier,pur_inv,pur_date', (x) => x.gt('qty', 0), 'exp-batches3').catch(() => fetchAll('batches', 'id,product_id,batch_no,exp_month,exp_year,qty,mrp,cost_price', (x) => x.gt('qty', 0), 'exp-batches2')),
        fetchAll('stock_summary', 'id,name,packing,company'),
      ])
      const pm = new Map(p.map((x) => [x.id, x]))
      setLines(b.map((x) => {
        const pr = pm.get(x.product_id) || {}
        return { ...x, key: x.exp_year * 100 + x.exp_month, name: pr.name || '?', packing: pr.packing, company: pr.company || 'Other' }
      }))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const lim = range === 'exp' ? mk(-1) : mk(range)
    const m = new Map()
    lines.filter((l) => l.key <= lim && words.every((w) => (l.name + ' ' + l.company + ' ' + (l.supplier || '')).toLowerCase().includes(w)))
      .sort((a, b) => a.key - b.key)
      .forEach((l) => { const g = by === 'supplier' ? (l.supplier || 'Supplier not known yet') : l.company; if (!m.has(g)) m.set(g, []); m.get(g).push(l) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [lines, range, q, by])

  const total = groups.reduce((s, [, l]) => s + l.length, 0)
  const val = (list) => list.reduce((s, l) => s + Number(l.qty) * (Number(l.cost_price) || 0), 0)
  // A clean return / credit-note list for one company, to send to its representative
  const pdf = (c, list) => exportPdf({ title: c + ' - expiry and near-expiry stock', subtitle: (range === 'exp' ? 'Already expired' : 'Expired or expiring within ' + range + ' month' + (range > 1 ? 's' : '')) + ' | value at cost Rs ' + Math.round(val(list)).toLocaleString('en-IN'),
    filename: 'expiry-' + c.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), columns: ['Product', 'Pack', 'Batch', 'Expiry', 'Qty', 'MRP', 'Cost', 'Value', 'Bought from / Inv'], numCols: [4, 5, 6, 7], bold: [list.length],
    rows: [...list.map((x) => [x.name, x.packing || '', x.batch_no, fmtExp(x.key), Number(x.qty), Number(x.mrp), Number(x.cost_price) || 0, Math.round(Number(x.qty) * (Number(x.cost_price) || 0) * 100) / 100, [by === 'supplier' ? null : x.supplier, x.pur_inv].filter(Boolean).join(' / ')]), ['TOTAL', '', '', '', list.reduce((s, x) => s + Number(x.qty), 0), '', '', Math.round(val(list) * 100) / 100, '']] })
  const share = (c, list) => {
    const t = c + ' - near expiry\n' + list.map((l) => l.name + ' | ' + l.batch_no + ' | Exp ' + fmtExp(l.key) + ' | Qty ' + num(l.qty)).join('\n')
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank')
  }

  return (
    <div className="app">
      <header className="top"><strong className="title">Expiry report</strong>
      </header>
      <div className="filters">
        {RANGES.map(([k, l]) => <button key={k} className={'toggle' + (range === k ? ' on' : '')} onClick={() => setRange(k)}>{l}</button>)}
      </div>
      <div className="filters"><span className="muted small">Group by</span>{[['company', 'Company'], ['supplier', 'Supplier bought from']].map(([k, l]) => <button key={k} className={'toggle' + (by === k ? ' on' : '')} onClick={() => setBy(k)}>{l}</button>)}</div>
      <div className="searchbox sp"><input type="search" placeholder="Filter by medicine or company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!loading && total > 0 && <ExportBar build={() => ({ title: 'Expiry report', subtitle: total + ' batches', filename: 'expiry', columns: ['Company', 'Item', 'Packing', 'Batch', 'Expiry', 'Qty', 'MRP', 'Cost value'], rows: groups.flatMap(([c, l]) => l.map((x) => [c, x.name, x.packing || '', x.batch_no, fmtExp(x.key), Number(x.qty), Number(x.mrp), Math.round(Number(x.qty) * (Number(x.cost_price) || 0))])), numCols: [5, 6, 7] })} />}
      {error && <p className="error pad">{error}</p>}
      {loading ? <p className="muted pad">Loading...</p> : <p className="count muted">{total} batch{total === 1 ? '' : 'es'} {range === 'exp' ? 'already expired' : 'expired or expiring within ' + range + ' month' + (range > 1 ? 's' : '')} | value at cost Rs {Math.round(groups.reduce((s, [, l]) => s + val(l), 0)).toLocaleString('en-IN')}</p>}
      {!loading && !total && <div className="empty"><b>Nothing here</b><span>No batches in this range.</span></div>}
      {groups.map(([c, list]) => (
        <section key={c} className="group">
          <div className="ghead static"><span className="gname">{c}</span>
            <span className="muted">{list.length} batches · {num(list.reduce((s, l) => s + Number(l.qty), 0))} units · Rs {Math.round(val(list)).toLocaleString('en-IN')}</span>
            <button className="ghost sm" onClick={() => pdf(c, list)}>PDF</button> <button className="ghost sm" onClick={() => share(c, list)}>Text</button></div>
          <ul className="list">
            {list.map((l) => (
              <li key={l.id} className="card"><div className="row static">
                <div className="info"><div className="name">{l.name}</div>
                  <div className="meta"><span>{l.packing}</span><span>Batch {l.batch_no}</span>{by === 'company' && l.supplier && <span>{l.supplier}</span>}<span className={'pill ' + (l.key < mk(0) ? 'expired' : 'soon')}>Exp {fmtExp(l.key)}</span></div></div>
                <div className="qty"><b>{num(l.qty)}</b><small>units</small></div></div></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
