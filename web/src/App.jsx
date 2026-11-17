import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const num = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }))
const fmtExp = (k) => (k ? String(k % 100).padStart(2, '0') + '/' + Math.floor(k / 100) : '-')
const mk = (off = 0) => { const d = new Date(); d.setMonth(d.getMonth() + off); return d.getFullYear() * 100 + d.getMonth() + 1 }
const expState = (k) => (!k ? '' : k < mk(0) ? 'expired' : k <= mk(3) ? 'soon' : '')
const SORTS = { name: 'A to Z', qtyDesc: 'Stock: high to low', qtyAsc: 'Stock: low to high', expiry: 'Expiry: soonest' }
const PAGE = 40

function ago(ts) {
  if (!ts) return { text: 'Not synced yet', cls: 'bad' }
  const m = Math.round((Date.now() - new Date(ts)) / 60000)
  const text = m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'
  return { text: 'Synced ' + text, cls: m < 120 ? 'good' : m < 1440 ? 'warn' : 'bad' }
}

async function loadAll() {
  let all = [], from = 0
  for (;;) {
    const { data, error } = await supabase.from('stock_summary').select('*').order('name').range(from, from + 999)
    if (error) throw error
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all.map((p) => ({ ...p, _s: [p.name, p.code, p.company].filter(Boolean).join(' ').toLowerCase() }))
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
    <div className="login">
      <div className="logo">SB</div>
      <h1>Shree Bhavani</h1>
      <p className="muted">Medical Distribution Agency</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        {err && <p className="error">{err}</p>}
      </form>
    </div>
  )
}

function Batches({ p }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('batches').select('id,batch_no,exp_month,exp_year,qty,mrp,bill_price')
      .eq('product_id', p.id).gt('qty', 0).order('exp_year').order('exp_month')
      .then(({ data }) => setRows(data || []))
  }, [p.id])
  if (!rows) return <p className="muted pad">Loading batches...</p>
  if (!rows.length) return <p className="muted pad">No stock.</p>
  const share = () => {
    const lines = rows.map((b) => 'Batch ' + b.batch_no + ' | Exp ' + fmtExp(b.exp_year * 100 + b.exp_month) + ' | Qty ' + num(b.qty) + ' | MRP ' + num(b.mrp))
    const text = p.name + (p.packing ? ' (' + p.packing + ')' : '') + '\n' + lines.join('\n')
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
  }
  return (
    <div className="batches">
      <table>
        <thead><tr><th>Batch</th><th>Expiry</th><th>Qty</th><th>MRP</th><th>Rate</th></tr></thead>
        <tbody>
          {rows.map((b) => {
            const k = b.exp_year * 100 + b.exp_month
            return (
              <tr key={b.id}>
                <td>{b.batch_no}</td>
                <td><span className={'pill ' + expState(k)}>{fmtExp(k)}</span></td>
                <td><b>{num(b.qty)}</b></td><td>{num(b.mrp)}</td><td>{num(b.bill_price)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button className="ghost" onClick={share}>Share on WhatsApp</button>
    </div>
  )
}

function Card({ p, open, onToggle, showCompany }) {
  const q = Number(p.total_qty)
  const st = q > 0 ? expState(p.nearest_expiry) : ''
  return (
    <li className={'card' + (open ? ' open' : '')}>
      <button className="row" onClick={onToggle}>
        <div className="info">
          <div className="name">{p.name}</div>
          <div className="meta">
            {p.packing && <span>{p.packing}</span>}
            {showCompany && p.company && <span>{p.company}</span>}
            {q > 0 && p.nearest_expiry && <span className={'pill ' + st}>Exp {fmtExp(p.nearest_expiry)}</span>}
          </div>
        </div>
        <div className={'qty' + (q <= 0 ? ' zero' : '')}><b>{num(q)}</b><small>units</small></div>
        <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <Batches p={p} />}
    </li>
  )
}

function Stock() {
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [synced, setSynced] = useState(null)
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState('instock')
  const [company, setCompany] = useState('')
  const [sort, setSort] = useState('name')
  const [group, setGroup] = useState(false)
  const [open, setOpen] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  const [expanded, setExpanded] = useState(new Set())

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setAll(await loadAll())
      const { data } = await supabase.from('sync_log').select('ran_at').order('ran_at', { ascending: false }).limit(1)
      setSynced(data && data[0] ? data[0].ran_at : null)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { setLimit(PAGE) }, [q, quick, company, sort, group])

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

  const companies = useMemo(() => {
    const m = new Map()
    base.forEach((p) => { const c = p.company || 'Other'; m.set(c, (m.get(c) || 0) + 1) })
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

  const groups = useMemo(() => {
    if (!group) return []
    const m = new Map()
    sorted.forEach((p) => { const c = p.company || 'Other'; if (!m.has(c)) m.set(c, []); m.get(c).push(p) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [sorted, group])

  const toggleGroup = (c) => setExpanded((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n })
  const forceOpen = !!q.trim() || !!company
  const sync = ago(synced)
  const cards = (list, showCompany) => list.map((p) => (
    <Card key={p.id} p={p} showCompany={showCompany} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />
  ))

  const STATS = [['instock', 'In stock', stats.instock, ''], ['soon', 'Expiring soon', stats.soon, 'warn'], ['expired', 'Expired', stats.expired, 'bad'], ['out', 'Out of stock', stats.out, '']]

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><div className="logo sm">SB</div>
          <div><strong>Shree Bhavani</strong><div className={'sync ' + sync.cls}>{sync.text}</div></div></div>
        <div className="actions">
          <button className="icon" onClick={refresh} aria-label="Refresh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg></button>
          <button className="icon" onClick={() => supabase.auth.signOut()} aria-label="Sign out"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg></button>
        </div>
      </header>

      <section className="stats">
        {STATS.map(([k, label, n, tone]) => (
          <button key={k} className={'stat ' + tone + (quick === k ? ' on' : '')} onClick={() => setQuick(k)}>
            <b>{n}</b><span>{label}</span>
          </button>
        ))}
      </section>

      <div className="tools">
        <div className="searchbox">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input type="search" placeholder="Search medicine, code or company" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="clear" onClick={() => setQ('')} aria-label="Clear">x</button>}
        </div>
        <div className="filters">
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">All companies ({companies.length})</option>
            {companies.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className={'toggle' + (group ? ' on' : '')} onClick={() => setGroup(!group)}>Group by company</button>
        </div>
      </div>

      {error && <p className="error pad">{error}</p>}
      {loading && <p className="muted pad">Loading stock...</p>}
      {!loading && !error && <p className="count muted">{sorted.length} item{sorted.length === 1 ? '' : 's'}</p>}
      {!loading && !error && sorted.length === 0 && <div className="empty"><b>No items found</b><span>Try a different search or filter.</span></div>}

      {group ? groups.map(([c, list]) => {
        const isOpen = forceOpen || expanded.has(c)
        const units = list.reduce((s, p) => s + Number(p.total_qty), 0)
        return (
          <section key={c} className="group">
            <button className="ghead" onClick={() => toggleGroup(c)}>
              <span className="gname">{c}</span><span className="muted">{list.length} items · {num(units)} units</span>
              <svg className={'chev' + (isOpen ? ' up' : '')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {isOpen && <ul className="list">{cards(list, false)}</ul>}
          </section>
        )
      }) : (
        <>
          <ul className="list">{cards(sorted.slice(0, limit), true)}</ul>
          {sorted.length > limit && <button className="more" onClick={() => setLimit(limit + PAGE)}>Show more ({sorted.length - limit} left)</button>}
        </>
      )}
    </div>
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
  return session ? <Stock /> : <Login />
}