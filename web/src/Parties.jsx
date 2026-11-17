import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, waLink } from './util'

// If balances look reversed against Profit Maker, change this to false.
const DR_POSITIVE = true

export default function Parties() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState(3)
  const [onlyDue, setOnlyDue] = useState(true)
  const [sort, setSort] = useState('bal')
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const d = await fetchAll('parties', 'id,code,name,city,phone,phone2,cur_bal,group_id,deleted')
      setRows(d.filter((p) => !p.deleted).map((p) => ({ ...p, _s: [p.name, p.code, p.city].filter(Boolean).join(' ').toLowerCase() })))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const owed = (p) => { const dr = DR_POSITIVE ? Number(p.cur_bal) : -Number(p.cur_bal); return type === 3 ? dr : -dr }
  const list = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const l = rows.filter((p) => p.group_id === type && w.every((x) => p._s.includes(x)) && (!onlyDue || owed(p) > 0.5))
    return l.sort(sort === 'bal' ? (a, b) => owed(b) - owed(a) : (a, b) => a.name.localeCompare(b.name))
  }, [rows, q, type, onlyDue, sort])
  const total = list.reduce((s, p) => s + Math.max(owed(p), 0), 0)

  return (
    <div className="app">
      <header className="top"><strong className="title">Parties</strong>
        <button className="icon" onClick={load} aria-label="Refresh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg></button>
      </header>
      <div className="stats two">
        <button className={'stat' + (type === 3 ? ' on' : '')} onClick={() => setType(3)}><b>Customers</b><span>to receive</span></button>
        <button className={'stat' + (type === 2 ? ' on' : '')} onClick={() => setType(2)}><b>Suppliers</b><span>to pay</span></button>
      </div>
      <div className="total"><span>{type === 3 ? 'Total to receive' : 'Total to pay'}</span><b>{rs(total)}</b><span>{list.length} parties</span></div>
      <div className="searchbox sp"><input type="search" placeholder="Search name, code or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="filters">
        <button className={'toggle' + (onlyDue ? ' on' : '')} onClick={() => setOnlyDue(!onlyDue)}>Only with balance</button>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="bal">Highest balance first</option><option value="name">A to Z</option></select>
      </div>
      {error && <p className="error pad">{error}</p>}
      {loading && <p className="muted pad">Loading...</p>}
      {!loading && !list.length && <div className="empty"><b>No parties found</b></div>}
      <ul className="list">
        {list.map((p) => {
          const amt = owed(p), ph = p.phone || p.phone2
          return (
            <li key={p.id} className="card">
              <button className="row" onClick={() => setOpen(open === p.id ? null : p.id)}>
                <div className="info"><div className="name">{p.name}</div><div className="meta"><span>{[p.city, p.code].filter(Boolean).join(' · ')}</span></div></div>
                <div className={'amt' + (amt > 0.5 ? ' due' : '')}>{amt < -0.5 ? rs(-amt) + ' adv' : rs(amt)}</div>
              </button>
              {open === p.id && (
                <div className="batches btnrow">
                  {ph ? <a className="ghost" href={'tel:' + ph.replace(/\D/g, '')}>Call {ph}</a> : <span className="muted">No phone saved</span>}
                  {ph && type === 3 && amt > 0.5 && (
                    <a className="ghost" target="_blank" rel="noreferrer"
                      href={waLink(ph, 'Dear ' + p.name + ', this is a gentle reminder from Shree Bhavani Medical Distribution Agency. Your outstanding balance is ' + rs(amt) + '. Kindly arrange the payment. Thank you.')}>WhatsApp reminder</a>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
