import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import Expiry from './Expiry'
import Parties from './Parties'
import Insights from './Insights'
import TempBill from './TempBill'
import { num, rs, fmtExp, expState, fetchAll, hue, ini, backupAge, cached, latestSync, clearMem, APP, SHOP } from './util'
import { Mark } from './Logo'
import ExportBar from './Export'

const SORTS = { name: 'A to Z', qtyDesc: 'Stock: high to low', qtyAsc: 'Stock: low to high', expiry: 'Expiry: soonest' }
const PAGE = 40
const I = (d) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const ICONS = {
  home: I(<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />),
  insights: I(<path d="M3 17l6-6 4 4 8-9M15 6h6v6" />),
  stock: I(<path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />),
  expiry: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  parties: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.3 2.3 3.7 5.2" /></>),
}
const Refresh = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
const Out = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>

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
      <Mark size={76} id="login" /><h1>{APP}</h1><p className="muted">{SHOP}</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        {err && <p className="error">{err}</p>}
      </form>
    </div></div>
  )
}

function daily(rows) {
  if (!rows.length) return null
  const days = [...new Set(rows.map((r) => r.day))].sort()
  const dy = days[days.length - 1]
  const at = (k, d = dy) => rows.filter((r) => r.day === d && r.kind === k).reduce((s, r) => ({ a: s.a + Number(r.amount), n: s.n + Number(r.bills) }), { a: 0, n: 0 })
  return { dy, S: at('S'), RS: at('RS'), P: at('P'), spark: days.slice(-14).map((d) => at('S', d).a) }
}

function Home({ go }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try {
      const [pr, st, lg, dl] = await Promise.all([
        fetchAll('parties', 'id,name,city,phone,phone2,receivable,payable,deleted'),
        fetchAll('stock_summary', 'id,total_qty,nearest_expiry'),
        latestSync(),
        fetchAll('daily_summary', 'day,kind,bills,amount').catch(() => []),
      ])
      const live = pr.filter((p) => !p.deleted)
      const cust = live.map((p) => ({ ...p, owed: Number(p.receivable) || 0 })).filter((p) => p.owed > 0.5).sort((a, b) => b.owed - a.owed)
      const sup = live.reduce((s, p) => s + Math.max(Number(p.payable) || 0, 0), 0)
      const inStock = st.filter((p) => Number(p.total_qty) > 0)
      setD({ recv: cust.reduce((s, p) => s + p.owed, 0), nCust: cust.length, pay: sup, nPay: live.filter((p) => Number(p.payable) > 0.5).length, items: inStock.length,
        soon: inStock.filter((p) => expState(p.nearest_expiry)).length, top: cust.slice(0, 5), sync: lg, day: daily(dl) })
    } catch (e) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])
  const h = new Date().getHours()
  const sync = backupAge(d && d.sync)
  const K = d && [['k1', 'To receive', rs(d.recv), d.nCust + ' parties', 'parties'], ['k2', 'To pay', rs(d.pay), d.nPay + ' parties', 'parties'],
    ['k3', 'Items in stock', num(d.items), 'tap to browse', 'stock'], ['k4', 'Expiring soon', num(d.soon), 'within 3 months', 'expiry']]
  return (
    <div className="app">
      <header className="top">
        <div><div className="muted small">{h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}</div><h1 className="h1">{APP}</h1>
          {d && <div className={'syncpill ' + sync.cls}><i />{sync.text}</div>}</div>
        <div className="actions"><button className="icon" onClick={load} aria-label="Refresh">{Refresh}</button><button className="icon" onClick={() => supabase.auth.signOut()} aria-label="Sign out">{Out}</button></div>
      </header>
      {err && <p className="error pad">{err}</p>}
      <section className="kpis">
        {K ? K.map(([c, l, v, s, t]) => <button key={l} className={'kpi ' + c} onClick={() => go(t, c === 'k1' ? 'recv' : c === 'k2' ? 'pay' : undefined)}><span>{l}</span><b>{v}</b><small>{s}</small></button>)
          : [0, 1, 2, 3].map((i) => <div key={i} className="kpi sk" />)}
      </section>
      <button className="ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => go('temp')}>Temporary bill (goods sent without billing)</button>
      {d && d.day && (
        <section><h2 className="h2">Latest day · {new Date(d.day.dy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</h2>
          <div className="minis">
            <div className="mini"><span>Sales</span><b>{rs(d.day.S.a)}</b><small className="muted">{d.day.S.n} bills</small></div>
            <div className="mini"><span>Collected</span><b>{rs(d.day.RS.a)}</b><small className="muted">{d.day.RS.n} receipts</small></div>
            <div className="mini"><span>Purchases</span><b>{rs(d.day.P.a)}</b><small className="muted">{d.day.P.n} bills</small></div>
          </div>
          <div className="chartcard"><svg viewBox="0 0 280 60" className="chart">{d.day.spark.map((v, i) => { const mx = Math.max(1, ...d.day.spark), h = (v / mx) * 52; return <rect key={i} x={i * 20 + 2} y={58 - h} width="14" height={h} rx="4" fill={i === d.day.spark.length - 1 ? '#0d9488' : '#94a3b8'} /> })}</svg><p className="muted small" style={{ margin: '4px 6px 0' }}>Sales, last 14 days</p></div>
        </section>
      )}
      {d && d.top.length > 0 && (
        <section><h2 className="h2">Highest dues</h2>
          <ul className="list">{d.top.map((p) => (
            <li key={p.id} className="card"><div className="row static">
              <div className="av" style={{ '--h': hue(p.name) }}>{ini(p.name)}</div>
              <div className="info"><div className="name">{p.name}</div><div className="meta"><span>{p.city}</span></div></div>
              <div className="amt due">{rs(p.owed)}</div>
              {(p.phone || p.phone2) && <a className="call" href={'tel:' + (p.phone || p.phone2).replace(/\D/g, '')} aria-label="Call">{I(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />)}</a>}
            </div></li>))}</ul>
          <button className="more" onClick={() => go('parties')}>See all parties</button>
        </section>
      )}
    </div>
  )
}

function Batches({ p }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    cached('b' + p.id, async () => {
      const { data, error } = await supabase.from('batches').select('id,batch_no,exp_month,exp_year,qty,mrp,bill_price,cost_price')
        .eq('product_id', p.id).gt('qty', 0).order('exp_year').order('exp_month')
      if (error) throw error
      return data
    }).then((d) => setRows(d || [])).catch(() => setRows([]))
  }, [p.id])
  const gst = Number(p.gst) || 0
  const mg = (b) => { const r = Number(b.bill_price) / (1 + gst / 100), c = Number(b.cost_price); return r > 0 && c > 0 ? Math.round(((r - c) / r) * 100) + '%' : '-' }
  const ex = (v) => (v == null ? '-' : num(Number(v) / (1 + gst / 100)))
  if (!rows) return <div className="batches"><div className="sk line" /></div>
  if (!rows.length) return <p className="muted pad">No stock.</p>
  const share = () => {
    const lines = rows.map((b) => 'Batch ' + b.batch_no + ' | Exp ' + fmtExp(b.exp_year * 100 + b.exp_month) + ' | Qty ' + num(b.qty) + ' | MRP ' + num(b.mrp))
    window.open('https://wa.me/?text=' + encodeURIComponent(p.name + (p.packing ? ' (' + p.packing + ')' : '') + '\n' + lines.join('\n')), '_blank')
  }
  return (
    <div className="batches">
      <table>
        <thead><tr><th>Batch</th><th>Expiry</th><th>Qty</th><th>MRP</th><th>Rate</th><th>GST</th><th>Margin</th></tr></thead>
        <tbody>{rows.map((b) => { const k = b.exp_year * 100 + b.exp_month
          return <tr key={b.id}><td>{b.batch_no}</td><td><span className={'pill ' + expState(k)}>{fmtExp(k)}</span></td><td><b>{num(b.qty)}</b></td><td>{num(b.mrp)}</td><td>{ex(b.bill_price)}</td><td>{gst}%</td><td>{mg(b)}</td></tr> })}</tbody>
      </table>
      <p className="muted small">Rate is before GST. Margin is an estimate from cost price.</p>
      <button className="ghost" onClick={share}>Share on WhatsApp</button>
    </div>
  )
}

function Card({ p, open, onToggle }) {
  const q = Number(p.total_qty)
  const e = q > 0 ? expState(p.nearest_expiry) : ''
  const s = q <= 0 ? 'zero' : e === 'expired' ? 'expired' : e === 'soon' ? 'soon' : 'ok'
  return (
    <li className={'card s-' + s + (open ? ' open' : '')}>
      <button className="row" onClick={onToggle}>
        <div className="info">
          <div className="name">{p.name}</div>
          <div className="meta">{[p.packing, p.rack_no && 'Rack ' + p.rack_no].filter(Boolean).map((t) => <span key={t}>{t}</span>)}
            {q > 0 && p.nearest_expiry && <span className={'pill ' + e}>Exp {fmtExp(p.nearest_expiry)}</span>}</div>
          {p.company && <div className="comp">{p.company}</div>}
        </div>
        <div className="qty"><b>{num(q)}</b><small>{q <= 0 ? 'out' : 'units'}</small></div>
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
      setSynced(await latestSync())
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
    const by = { name: (a, b) => a.name.localeCompare(b.name), qtyDesc: (a, b) => b.total_qty - a.total_qty,
      qtyAsc: (a, b) => a.total_qty - b.total_qty, expiry: (a, b) => (a.nearest_expiry || 999999) - (b.nearest_expiry || 999999) }
    return list.sort(by[sort])
  }, [base, company, sort])

  const sync = backupAge(synced)
  const QC = [['instock', 'In stock', stats.instock, ''], ['soon', 'Expiring', stats.soon, 'warn'], ['expired', 'Expired', stats.expired, 'bad'], ['out', 'Out of stock', stats.out, '']]

  return (
    <div className="app">
      <header className="top">
        <div><h1 className="h1">Stock</h1><div className={'syncpill ' + sync.cls}><i />{sync.text}</div></div>
        <div className="actions"><button className="icon" onClick={refresh} aria-label="Refresh">{Refresh}</button></div>
      </header>
      <div className="tools">
        <div className="searchbox">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input type="search" placeholder="Search medicine, code or company" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="clear" onClick={() => setQ('')} aria-label="Clear">x</button>}
        </div>
        <div className="qchips">{QC.map(([k, l, n, t]) => <button key={k} className={'qc ' + t + (quick === k ? ' on' : '')} onClick={() => setQuick(k)}>{l}<b>{n}</b></button>)}</div>
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
      {loading && <ul className="list">{[0, 1, 2, 3, 4].map((i) => <li key={i} className="card"><div className="row"><div className="info"><div className="sk line" /><div className="sk line s" /></div><div className="sk qtybox" /></div></li>)}</ul>}
      {!loading && !error && view === 'companies' && (
        <>
          <p className="count muted">{cstats.length} companies</p>
          <div className="tiles">{cstats.map(([c, s]) => (
            <button key={c} className="tile" style={{ '--h': hue(c) }} onClick={() => { setCompany(c); setView('items') }}>
              <div className="av lg">{ini(c)}</div><div className="tname">{c}</div>
              <div className="tmeta">{s.items} items · {num(s.units)} units</div>
              {s.soon > 0 && <span className="pill soon">{s.soon} expiring</span>}
            </button>))}</div>
          {!cstats.length && <div className="empty"><b>No companies found</b></div>}
        </>
      )}
      {!loading && !error && view === 'items' && (
        <>
          <p className="count muted">{sorted.length} item{sorted.length === 1 ? '' : 's'}</p>
          {sorted.length > 0 && <ExportBar build={() => ({ title: 'Stock list' + (company ? ' - ' + company : ''), subtitle: sorted.length + ' items', filename: 'stock', columns: ['Item', 'Packing', 'Company', 'Rack', 'Stock', 'Nearest expiry'], rows: sorted.map((p) => [p.name, p.packing || '', p.company || '', p.rack_no || '', Number(p.total_qty), fmtExp(p.nearest_expiry)]), numCols: [4] })} />}
          {!sorted.length && <div className="empty"><b>No items found</b><span>Try a different search or filter.</span></div>}
          <ul className="list">{sorted.slice(0, limit).map((p) => <Card key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />)}</ul>
          {sorted.length > limit && <button className="more" onClick={() => setLimit(limit + PAGE)}>Show more ({sorted.length - limit} left)</button>}
        </>
      )}
    </div>
  )
}

function Shell() {
  const [tab, setTab] = useState('home')
  const [ps, setPs] = useState('recv')
  const [off, setOff] = useState(!navigator.onLine)
  const [rev, setRev] = useState(0)
  const [stale, setStale] = useState(false)
  useEffect(() => { const f = () => setOff(!navigator.onLine); window.addEventListener('online', f); window.addEventListener('offline', f); return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f) } }, [])
  // Reload the data when a newer backup has been synced (a tiny check first, to save data)
  useEffect(() => {
    let hiddenAt = 0, known = null
    const bump = () => { clearMem(); setStale(false); setRev((r) => r + 1) }
    const check = async () => {
      try {
        const { data } = await supabase.from('sync_log').select('ran_at,source').order('ran_at', { ascending: false }).limit(1)
        const row = data && data[0], v = row ? (row.source === 'live' ? row.ran_at : row.source) : null
        if (known && v && v !== known) bump()
        if (v) known = v
      } catch (e) { /* offline */ }
    }
    check()
    const vis = () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 120000) check() }
    const iv = setInterval(() => { if (!document.hidden) check() }, 600000)
    const st = () => setStale(true)
    document.addEventListener('visibilitychange', vis); window.addEventListener('sb-stale', st)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); window.removeEventListener('sb-stale', st) }
  }, [])
  const go = (t, side) => { if (side) setPs(side); setTab(t); window.scrollTo(0, 0) }
  // Only the open tab exists on the page; the others are created when you open them.
  const view = { home: <Home go={go} />, stock: <Stock />, expiry: <Expiry />, parties: <Parties side={ps} />, insights: <Insights />, temp: <TempBill back={() => go('home')} /> }[tab]
  return (
    <>
      {(off || stale) && <div className="offbar">{off ? 'Offline: showing last saved data' : 'Could not reach the server: showing last saved data'}</div>}
      <div key={tab + ':' + rev}>{view}</div>
      <div className="ver">Build 12</div>
      <nav className="tabs">
        {[['home', 'Home'], ['stock', 'Stock'], ['expiry', 'Expiry'], ['parties', 'Parties'], ['insights', 'Insights']].map(([k, l]) => (
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