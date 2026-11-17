import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, waLink } from './util'

// If balances look reversed against Profit Maker, change this to false.
const DR_POSITIVE = true

export default function Parties() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [side, setSide] = useState('recv')
  const [showAll, setShowAll] = useState(false)
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

  // Positive = the party owes us. Negative = we owe the party. Works for any party, whatever its group.
  const bal = (p) => (DR_POSITIVE ? Number(p.cur_bal) : -Number(p.cur_bal))
  const owed = (p) => (side === 'recv' ? bal(p) : -bal(p))

  const sums = useMemo(() => {
    const s = { r: 0, a: 0, nr: 0, na: 0 }
    rows.forEach((p) => { const b = bal(p); if (b > 0.5) { s.r += b; s.nr++ } else if (b < -0.5) { s.a -= b; s.na++ } })
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
                <div className="info"><div className="name">{p.name}</div><div className="meta"><span>{[p.city, p.code].filter(Boolean).join(' · ')}</span></div></div>
                <div className={'amt' + (amt > 0.5 ? (side === 'recv' ? ' due' : '') : '')}>{amt < -0.5 ? rs(-amt) + (side === 'recv' ? ' payable' : ' receivable') : rs(amt)}</div>
              </button>
              {open === p.id && (
                <div className="batches btnrow">
                  {ph ? <a className="ghost" href={'tel:' + ph.replace(/\D/g, '')}>Call {ph}</a> : <span className="muted">No phone saved</span>}
                  {ph && side === 'recv' && amt > 0.5 && (
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