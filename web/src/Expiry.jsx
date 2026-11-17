import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, fmtExp, mk, num } from './util'

const RANGES = [['exp', 'Expired'], [1, '1 month'], [3, '3 months'], [6, '6 months'], [12, '12 months']]

export default function Expiry() {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState(3)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [b, p] = await Promise.all([
        fetchAll('batches', 'id,product_id,batch_no,exp_month,exp_year,qty,mrp', (x) => x.gt('qty', 0)),
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
    lines.filter((l) => l.key <= lim && words.every((w) => (l.name + ' ' + l.company).toLowerCase().includes(w)))
      .sort((a, b) => a.key - b.key)
      .forEach((l) => { if (!m.has(l.company)) m.set(l.company, []); m.get(l.company).push(l) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [lines, range, q])

  const total = groups.reduce((s, [, l]) => s + l.length, 0)
  const share = (c, list) => {
    const t = c + ' - near expiry\n' + list.map((l) => l.name + ' | ' + l.batch_no + ' | Exp ' + fmtExp(l.key) + ' | Qty ' + num(l.qty)).join('\n')
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank')
  }

  return (
    <div className="app">
      <header className="top"><strong className="title">Expiry report</strong>
        <button className="icon" onClick={load} aria-label="Refresh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg></button>
      </header>
      <div className="filters">
        {RANGES.map(([k, l]) => <button key={k} className={'toggle' + (range === k ? ' on' : '')} onClick={() => setRange(k)}>{l}</button>)}
      </div>
      <div className="searchbox sp"><input type="search" placeholder="Filter by medicine or company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <p className="error pad">{error}</p>}
      {loading ? <p className="muted pad">Loading...</p> : <p className="count muted">{total} batch{total === 1 ? '' : 'es'} {range === 'exp' ? 'already expired' : 'expired or expiring within ' + range + ' month' + (range > 1 ? 's' : '')}</p>}
      {!loading && !total && <div className="empty"><b>Nothing here</b><span>No batches in this range.</span></div>}
      {groups.map(([c, list]) => (
        <section key={c} className="group">
          <div className="ghead static"><span className="gname">{c}</span>
            <span className="muted">{list.length} batches · {num(list.reduce((s, l) => s + Number(l.qty), 0))} units</span>
            <button className="ghost sm" onClick={() => share(c, list)}>Share</button></div>
          <ul className="list">
            {list.map((l) => (
              <li key={l.id} className="card"><div className="row static">
                <div className="info"><div className="name">{l.name}</div>
                  <div className="meta"><span>{l.packing}</span><span>Batch {l.batch_no}</span><span className={'pill ' + (l.key < mk(0) ? 'expired' : 'soon')}>Exp {fmtExp(l.key)}</span></div></div>
                <div className="qty"><b>{num(l.qty)}</b><small>units</small></div></div></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
