import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const num = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }))
const fmtExp = (k) => (k ? String(k % 100).padStart(2, '0') + '/' + Math.floor(k / 100) : '-')

function monthKey(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return d.getFullYear() * 100 + d.getMonth() + 1
}
function expiryClass(k) {
  if (!k) return ''
  if (k < monthKey(0)) return 'expired'
  if (k <= monthKey(3)) return 'soon'
  return ''
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="login">
      <h1>Shree Bhavani</h1>
      <p className="muted">Medical Distribution Agency</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        {err && <p className="error">{err}</p>}
      </form>
    </div>
  )
}

function Batches({ productId }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase
      .from('batches')
      .select('id,batch_no,exp_month,exp_year,qty,mrp,bill_price')
      .eq('product_id', productId)
      .gt('qty', 0)
      .order('exp_year')
      .order('exp_month')
      .then(({ data }) => setRows(data || []))
  }, [productId])

  if (!rows) return <p className="muted pad">Loading batches...</p>
  if (rows.length === 0) return <p className="muted pad">No stock.</p>
  return (
    <table className="batches">
      <thead>
        <tr><th>Batch</th><th>Expiry</th><th>Qty</th><th>MRP</th><th>Rate</th></tr>
      </thead>
      <tbody>
        {rows.map((b) => {
          const k = b.exp_year * 100 + b.exp_month
          return (
            <tr key={b.id}>
              <td>{b.batch_no}</td>
              <td className={expiryClass(k)}>{fmtExp(k)}</td>
              <td>{num(b.qty)}</td>
              <td>{num(b.mrp)}</td>
              <td>{num(b.bill_price)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Stock() {
  const [q, setQ] = useState('')
  const [inStock, setInStock] = useState(true)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [synced, setSynced] = useState(null)

  useEffect(() => {
    supabase
      .from('sync_log')
      .select('ran_at')
      .order('ran_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setSynced(data && data[0] ? data[0].ran_at : null))
  }, [])

  useEffect(() => {
    let stale = false
    setLoading(true)
    const t = setTimeout(async () => {
      let query = supabase.from('stock_summary').select('*').order('name').limit(60)
      q.trim().split(/\s+/).filter(Boolean).forEach((w) => {
        query = query.ilike('name', '%' + w + '%')
      })
      if (inStock) query = query.gt('total_qty', 0)
      const { data, error } = await query
      if (stale) return
      setError(error ? error.message : '')
      setRows(data || [])
      setLoading(false)
    }, 250)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, inStock])

  return (
    <div className="app">
      <header>
        <div>
          <strong>Stock</strong>
          <div className="muted small">
            {synced ? 'Updated ' + new Date(synced).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
          </div>
        </div>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <input
        className="search"
        type="search"
        placeholder="Search medicine..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <label className="toggle">
        <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only
      </label>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted pad">Searching...</p>}
      {!loading && rows.length === 0 && !error && <p className="muted pad">No items found.</p>}

      <ul className="list">
        {rows.map((p) => (
          <li key={p.id}>
            <button className="row" onClick={() => setOpen(open === p.id ? null : p.id)}>
              <div>
                <div className="name">{p.name}</div>
                <div className="muted small">
                  {[p.packing, p.company].filter(Boolean).join(' · ')}
                  {p.nearest_expiry ? ' · Exp ' + fmtExp(p.nearest_expiry) : ''}
                </div>
              </div>
              <div className={'qty' + (Number(p.total_qty) <= 0 ? ' zero' : '')}>{num(p.total_qty)}</div>
            </button>
            {open === p.id && <Batches productId={p.id} />}
          </li>
        ))}
      </ul>
      {rows.length === 60 && <p className="muted pad">Showing first 60. Type more to narrow down.</p>}
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
