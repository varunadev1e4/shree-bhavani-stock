import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, waLink, SHOP } from './util'
import Customer from './Customer'

export default function Parties() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [side, setSide] = useState('recv')
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState('bal')
  const [open, setOpen] = useState(null)
  const [sel, setSel] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const d = await fetchAll('parties', 'id,code,name,city,phone,phone2,receivable,payable,last_sale,age_30,age_60,age_90,age_90p,deleted')
      setRows(d.filter((p) => !p.deleted).map((p) => ({ ...p, _s: [p.name, p.code, p.city].filter(Boolean).join(' ').toLowerCase() })))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Kept separate: what the party owes us (receivable) and what we owe them (payable).
  const rec = (p) => Number(p.receivable) || 0
  const pay = (p) => Number(p.payable) || 0
  const owed = (p) => (side === 'recv' ? rec(p) : pay(p))
  const other = (p) => (side === 'recv' ? pay(p) : rec(p))

  const sums = useMemo(() => {
    const s = { r: 0, a: 0, nr: 0, na: 0 }
    rows.forEach((p) => { if (rec(p) > 0.5) { s.r += rec(p); s.nr++ } if (pay(p) > 0.5) { s.a += pay(p); s.na++ } })
    return s
  }, [rows])

  const list = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const l = rows.filter((p) => w.every((x) => p._s.includes(x)) && (showAll || owed(p) > 0.5))
    return l.sort(sort === 'bal' ? (a, b) => owed(b) - owed(a) : (a, b) => a.name.localeCompare(b.name))
  }, [rows, q, side, showAll, sort])

  return (
    <div className="app">
      <header className="top"><h1 className="h1">Parties</h1>
        <div className="actions"><button className="icon" onClick={load} aria-label="Refresh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg></button></div>
      </header>
      <div className="stats">
        <button className={'stat' + (side === 'recv' ? ' on' : '')} onClick={() => setSide('recv')}><span>To receive</span><b>{rs(sums.r)}</b><span>{sums.nr} parties</span></button>
        <button className={'stat' + (side === 'pay' ? ' on' : '')} onClick={() => setSide('pay')}><span>To pay</span><b>{rs(sums.a)}</b><span>{sums.na} parties</span></button>
      </div>
      <div className="searchbox sp"><input type="search" placeholder="Search name, code or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="filters">
        <button className={'toggle' + (showAll ? ' on' : '')} onClick={() => setShowAll(!showAll)}>Show all parties</button>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="bal">Highest balance first</option><option value="name">A to Z</option></select>
      </div>
      {error && <p className="error pad">{error}</p>}
      {loading && <p className="muted pad">Loading...</p>}
      {!loading && !list.length && <div className="empty"><b>No parties found</b></div>}
      <ul className="list" style={{ marginTop: 12 }}>
        {list.map((p) => {
          const amt = owed(p), ph = p.phone || p.phone2
          return (
            <li key={p.id} className="card">
              <button className="row" onClick={() => setOpen(open === p.id ? null : p.id)}>
                <div className="info"><div className="name">{p.name}</div><div className="meta"><span>{[p.city, p.code].filter(Boolean).join(' · ')}</span>{other(p) > 0.5 && <span className="pill soon">{side === 'recv' ? 'Also to pay ' : 'Also to receive '}{rs(other(p))}</span>}</div></div>
                <div className={'amt' + (amt > 0.5 && side === 'recv' ? ' due' : '')}>{rs(Math.max(amt, 0))}</div>
              </button>
              {open === p.id && (
                <div className="batches btnrow">
                  <button className="ghost" onClick={() => setSel(p)}>Details</button>
                  {ph ? <a className="ghost" href={'tel:' + ph.replace(/\D/g, '')}>Call {ph}</a> : <span className="muted">No phone saved</span>}
                  {ph && side === 'recv' && amt > 0.5 && (
                    <a className="ghost" target="_blank" rel="noreferrer"
                      href={waLink(ph, 'Dear ' + p.name + ', this is a gentle reminder from ' + SHOP + '. Your outstanding balance is ' + rs(amt) + '. Kindly arrange the payment. Thank you.')}>WhatsApp reminder</a>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {sel && <Customer p={sel} onClose={() => setSel(null)} />}
    </div>
  )
}