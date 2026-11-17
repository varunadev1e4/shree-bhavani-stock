import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import Expiry from './Expiry'
import Parties from './Parties'
import { num, fmtExp, expState, fetchAll, hue, ini } from './util'

const SORTS = { name: 'A to Z', qtyDesc: 'Stock: high to low', qtyAsc: 'Stock: low to high', expiry: 'Expiry: soonest' }
const PAGE = 40
const I = (d) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const ICONS = {
  stock: I(<path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />),
  expiry: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  parties: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.3 2.3 3.7 5.2" /></>),
}

function ago(ts) {
  if (!ts) return { text: 'Not synced yet', cls: 'bad' }
  const m = Math.round((Date.now() - new Date(ts)) / 60000)
  const t = m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'
  return { text: 'Synced ' + t, cls: m < 120 ? 'good' : m < 1440 ? 'warn' : 'bad' }
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }
  return (
    <div className="loginwrap"><div className="login">
      <div className="logo">SB</div>
      <h1>Shree Bhavani</h1>
      <p className="muted">Medical Distribution Agency</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        {err && <p className="error">{err}</p>}
      </form>
    </div></div>
  )
}

function Batches({ p }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('batches').select('id,batch_no,exp_month,exp_year,qty,mrp,bill_price')
      .eq('product_id', p.id).gt('qty', 0).order('exp_year').order('exp_month')
      .then(({ data }) => setRows(data || []))
  }, [p.id])
  if (!rows) return <div className="batches"><div className="sk line" /></div>
  if (!rows.length) return <p className="muted pad">No stock.</p>
  const share = () => {
    const lines = rows.map((b) => 'Batch ' + b.batch_no + ' | Exp ' + fmtExp(b.exp_year * 100 + b.exp_month) + ' | Qty ' + num(b.qty) + ' | MRP ' + num(b.mrp))
    window.open('https://wa.me/?text=' + encodeURIComponent(p.name + (p.packing ? ' (' + p.packing + ')' : '') + '\n' + lines.join('\n')), '_blank')
  }
  return (
    <div className="batches">
      <table>
        <thead><tr><th>Batch</th><th>Expiry</th><th>Qty</th><th>MRP</th><th>Rate</th></tr></thead>
        <tbody>
          {rows.map((b) => {
            const k = b.exp_year * 100 + b.exp_month
            return <tr key={b.id}><td>{b.batch_no}</td><td><span className={'pill ' + expState(k)}>{fmtExp(k)}</span></td><td><b>{num(b.qty)}</b></td><td>{num(b.mrp)}</td><td>{num(b.bill_price)}</td></tr>
          })}
        </tbody>
      </table>
      <button className="ghost" onClick={share}>Share on WhatsApp</button>
    </div>
  )
}

function Card({ p, open, onToggle }) {
  const q = Number(p.total_qty)
  const st = q > 0 ? expState(p.nearest_expiry) : ''
  return (
    <li className={'card' + (open ? ' open' : '')}>
      <button className="row" onClick={onToggle}>
        <div className="av" style={{ '--h': hue(p.company || p.name) }}>{ini(p.name)}</div>
        <div className="info">
          <div className="name">{p.name}</div>
          <div className="meta">
            {p.packing && <span>{p.packing}</span>}
            {p.rack_no && <span>Rack {p.rack_no}</span>}
            {q > 0 && p.nearest_expiry && <span className={'pill ' + st}>Exp {fmtExp(p.nearest_expiry)}</span>}
          </div>
          {p.company && <div className="comp">{p.company}</div>}
        </div>
        <div className={'qty' + (q <= 0 ? ' zero' : '')}><b>{num(q)}</b><small>units</small></div>
      </button>
      {open && <Batches p={p} />}
    </li>
  )
}

function Skeleton() {
  return <ul className="list">{[0, 1, 2, 3, 4, 5].map((i) => <li key={i} className="card"><div className="row"><div className="sk av" /><div className="info"><div className="sk line" /><div className="sk line s" /></div><div className="sk qtybox" /></div></li>)}</ul>
}

function Stock() {
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [synced, setSynced] = useState(null)
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState('instock')
  const [view, setView] = useState('items')
  const [company, setCompany] = useState('')
  const [sort, setSort] = useState('name')
  const [open, setOpen] = useState(null)
  const [limit, setLimit] = useState(PAGE)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const d = await fetchAll('stock_summary', '*')
      setAll(d.map((p) => ({ ...p, _s: [p.name, p.code, p.company].filter(Boolean).join(' ').toLowerCase() })))
      const { data } = await supabase.from('sync_log').select('ran_at').order('ran_at', { ascending: false }).limit(1)
      setSynced(data && data[0] ? data[0].ran_at : null)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { setLimit(PAGE) }, [q, quick, company, sort, view])

  const stats = useMemo(() => {
    const s = { instock: 0, soon: 0, expired: 0, out: 0 }
    for (const p of all) {
      if (Number(p.total_qty) <= 0) { s.out++; continue }
      s.instock++
      const st = expState(p.nearest_expiry)
      if (st === 'soon') s.soon++
      if (st === 'expired') s.expired++
    }
    return s
  }, [all])

  const base = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((p) => {
      const qty = Number(p.total_qty), st = expState(p.nearest_expiry)
      if (quick === 'instock' && qty <= 0) return false
      if (quick === 'out' && qty > 0) return false
      if (quick === 'soon' && !(qty > 0 && st === 'soon')) return false
      if (quick === 'expired' && !(qty > 0 && st === 'expired')) return false
      return words.every((w) => p._s.includes(w))
    })
  }, [all, q, quick])

  const cstats = useMemo(() => {
    const m = new Map()
    base.forEach((p) => {
      const c = p.company || 'Other'
      const s = m.get(c) || { items: 0, units: 0, soon: 0 }
      s.items++; s.units += Number(p.total_qty)
      if (Number(p.total_qty) > 0 && expState(p.nearest_expiry)) s.soon++
      m.set(c, s)
    })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [base])

  const sorted = useMemo(() => {
    const list = company ? base.filter((p) => (p.company || 'Other') === company) : base.slice()
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      qtyDesc: (a, b) => b.total_qty - a.total_qty,
      qtyAsc: (a, b) => a.total_qty - b.total_qty,
      expiry: (a, b) => (a.nearest_expiry || 999999) - (b.nearest_expiry || 999999),
    }
    return list.sort(by[sort])
  }, [base, company, sort])

  const sync = ago(synced)
  const STATS = [['instock', 'In stock', stats.instock, ''], ['soon', 'Expiring', stats.soon, 'warn'], ['expired', 'Expired', stats.expired, 'bad'], ['out', 'Out', stats.out, 'mute']]

  return (
    <div className="app">
      <header className="hero">
        <div className="herotop">
          <div className="brand"><div className="logo sm">SB</div><div><strong>Shree Bhavani</strong><span>Medical Distribution</span></div></div>
          <div className="actions">
            <button className="icon" onClick={refresh} aria-label="Refresh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg></button>
            <button className="icon" onClick={() => supabase.auth.signOut()} aria-label="Sign out"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg></button>
          </div>
        </div>
        <div className={'syncpill ' + sync.cls}><i />{sync.text}</div>
      </header>

      <section className="stats up">
        {STATS.map(([k, label, n, tone]) => (
          <button key={k} className={'stat ' + tone + (quick === k ? ' on' : '')} onClick={() => setQuick(k)}><b>{n}</b><span>{label}</span></button>
        ))}
      </section>

      <div className="tools">
        <div className="searchbox">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input type="search" placeholder="Search medicine, code or company" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="clear" onClick={() => setQ('')} aria-label="Clear">x</button>}
        </div>
        <div className="filters">
          <div className="seg">
            <button className={view === 'items' ? 'on' : ''} onClick={() => setView('items')}>Items</button>
            <button className={view === 'companies' ? 'on' : ''} onClick={() => { setView('companies'); setCompany('') }}>Companies</button>
          </div>
          {view === 'items' && <select value={sort} onChange={(e) => setSort(e.target.value)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          {view === 'items' && company && <button className="chip" onClick={() => setCompany('')}>{company} &nbsp;x</button>}
        </div>
      </div>

      {error && <p className="error pad">{error}</p>}
      {loading && <Skeleton />}
      {!loading && !error && view === 'companies' && (
        <>
          <p className="count muted">{cstats.length} companies</p>
          <div className="tiles">
            {cstats.map(([c, s]) => (
              <button key={c} className="tile" style={{ '--h': hue(c) }} onClick={() => { setCompany(c); setView('items') }}>
                <div className="av lg">{ini(c)}</div>
                <div className="tname">{c}</div>
                <div className="tmeta">{s.items} items · {num(s.units)} units</div>
                {s.soon > 0 && <span className="pill soon">{s.soon} expiring</span>}
              </button>
            ))}
          </div>
          {!cstats.length && <div className="empty"><b>No companies found</b><span>Try a different search or filter.</span></div>}
        </>
      )}
      {!loading && !error && view === 'items' && (
        <>
          <p className="count muted">{sorted.length} item{sorted.length === 1 ? '' : 's'}</p>
          {!sorted.length && <div className="empty"><b>No items found</b><span>Try a different search or filter.</span></div>}
          <ul className="list">
            {sorted.slice(0, limit).map((p) => <Card key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />)}
          </ul>
          {sorted.length > limit && <button className="more" onClick={() => setLimit(limit + PAGE)}>Show more ({sorted.length - limit} left)</button>}
        </>
      )}
    </div>
  )
}

function Shell() {
  const [tab, setTab] = useState('stock')
  const [seen, setSeen] = useState({ stock: true })
  const go = (t) => { setTab(t); setSeen((s) => ({ ...s, [t]: true })); window.scrollTo(0, 0) }
  return (
    <>
      <div hidden={tab !== 'stock'}><Stock /></div>
      {seen.expiry && <div hidden={tab !== 'expiry'}><Expiry /></div>}
      {seen.parties && <div hidden={tab !== 'parties'}><Parties /></div>}
      <nav className="tabs">
        {[['stock', 'Stock'], ['expiry', 'Expiry'], ['parties', 'Parties']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{ICONS[k]}<span>{l}</span></button>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <p className="muted pad">Loading...</p>
  return session ? <Shell /> : <Login />
}
