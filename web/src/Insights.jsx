import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, num, fmtExp, expState, waLink, L, addYm } from './util'
import Trends from './Trends'

const TABS = [['trends', 'Trends'], ['reorder', 'Reorder'], ['slow', 'Slow stock'], ['quiet', 'Quiet buyers'], ['overdue', 'Overdue'], ['margin', 'Margins']]
const AGE = [['0-30', '#16a34a'], ['31-60', '#d97706'], ['61-90', '#ea580c'], ['90+', '#dc2626']]
const lc = (s) => String(s || '').toLowerCase()
const phoneOf = (p) => p && (p.phone || p.phone2)

function Contact({ ph, msg }) {
  if (!ph) return null
  return (
    <div className="btnrow">
      <a className="ghost sm" href={'tel:' + ph.replace(/\D/g, '')}>Call</a>
      <a className="ghost sm" target="_blank" rel="noreferrer" href={waLink(ph, msg)}>WhatsApp</a>
    </div>
  )
}
const Empty = ({ t }) => <div className="empty"><b>{t}</b></div>

function Reorder({ stock, latest }) {
  const [cover, setCover] = useState(1.5)
  const [sales, setSales] = useState(null)
  useEffect(() => {
    if (!latest) return
    fetchAll('fy_product_monthly', 'ym,product,qty', (q) => q.gte('ym', addYm(latest, -3)).lt('ym', latest)).then(setSales).catch(() => setSales([]))
  }, [latest])
  const groups = useMemo(() => {
    if (!sales) return []
    const tot = new Map()
    sales.forEach((r) => tot.set(lc(r.product), (tot.get(lc(r.product)) || 0) + Number(r.qty)))
    const g = new Map()
    stock.forEach((p) => {
      const a = (tot.get(lc(p.name)) || 0) / 3, lvl = Number(p.ord_level) || 0
      const sug = Math.ceil(Math.max(a * cover, lvl) - Number(p.total_qty))
      if (sug > 0 && (a > 0 || lvl > 0)) { const c = p.company || 'Other'; if (!g.has(c)) g.set(c, []); g.get(c).push({ p, a, sug }) }
    })
    return [...g.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([c, l]) => [c, l.sort((x, y) => y.sug - x.sug)])
  }, [sales, stock, cover])
  const share = (c, l) => window.open('https://wa.me/?text=' + encodeURIComponent('Order for ' + c + '\n' + l.map((x) => x.p.name + ' - ' + x.sug).join('\n')), '_blank')
  return (
    <>
      <div className="qchips">{[1, 1.5, 2, 3].map((c) => <button key={c} className={'qc' + (cover === c ? ' on' : '')} onClick={() => setCover(c)}>{c} month cover</button>)}</div>
      <p className="count muted">Suggested from the last 3 full months of sales. Set the order level in Profit Maker to override.</p>
      {!sales && <p className="muted pad">Loading...</p>}
      {sales && !groups.length && <Empty t="Nothing needs ordering" />}
      {groups.map(([c, l]) => (
        <section key={c} className="group">
          <div className="ghead static"><span className="gname">{c}</span><span className="muted">{l.length} items</span><button className="ghost sm" onClick={() => share(c, l)}>Share</button></div>
          <ul className="list">{l.map((x) => (
            <li key={x.p.id} className="card"><div className="row static">
              <div className="info"><div className="name">{x.p.name}</div><div className="meta"><span>In stock {num(x.p.total_qty)}</span><span>Sells ~{num(x.a)}/month</span></div></div>
              <div className="qty"><b>{x.sug}</b><small>to order</small></div></div></li>
          ))}</ul>
        </section>
      ))}
    </>
  )
}

function Slow({ stock }) {
  const [days, setDays] = useState(90)
  const rows = useMemo(() => stock.filter((p) => Number(p.total_qty) > 0)
    .map((p) => ({ p, d: p.last_sale ? Math.floor((Date.now() - new Date(p.last_sale)) / 864e5) : 9999 }))
    .filter((x) => x.d >= days).sort((a, b) => b.p.total_qty - a.p.total_qty), [stock, days])
  const units = rows.reduce((s, x) => s + Number(x.p.total_qty), 0)
  return (
    <>
      <div className="qchips">{[60, 90, 180].map((d) => <button key={d} className={'qc' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>No sale in {d} days</button>)}</div>
      <p className="count muted">{rows.length} items · {num(units)} units sitting in stock</p>
      {!rows.length && <Empty t="No slow stock" />}
      <ul className="list">{rows.slice(0, 80).map(({ p, d }) => (
        <li key={p.id} className={'card s-' + (d >= 180 ? 'expired' : 'soon')}><div className="row static">
          <div className="info"><div className="name">{p.name}</div>
            <div className="meta">{p.company && <span>{p.company}</span>}<span>{d === 9999 ? 'No sale on record' : 'Last sold ' + d + ' days ago'}</span>
              {p.nearest_expiry && <span className={'pill ' + expState(p.nearest_expiry)}>Exp {fmtExp(p.nearest_expiry)}</span>}</div></div>
          <div className="qty"><b>{num(p.total_qty)}</b><small>units</small></div></div></li>
      ))}</ul>
    </>
  )
}

function Quiet({ latest, parties }) {
  const [mode, setMode] = useState('prev')
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!latest) return
    fetchAll('fy_party_monthly', 'ym,party,amount', (q) => q.gte('ym', addYm(latest, -15)).lt('ym', latest)).then(setRows).catch(() => setRows([]))
  }, [latest])
  const pm = useMemo(() => new Map(parties.map((p) => [lc(p.name), p])), [parties])
  const list = useMemo(() => {
    if (!rows) return []
    const a0 = addYm(latest, -3), p0 = mode === 'prev' ? addYm(latest, -6) : addYm(latest, -15), p1 = addYm(p0, 3)
    const m = new Map()
    rows.forEach((r) => { const e = m.get(r.party) || { now: 0, prev: 0 }; if (r.ym >= a0) e.now += Number(r.amount); else if (r.ym >= p0 && r.ym < p1) e.prev += Number(r.amount); m.set(r.party, e) })
    return [...m.entries()].filter(([, e]) => e.prev >= 20000 && e.now < e.prev * 0.6).map(([k, e]) => ({ k, ...e })).sort((a, b) => (b.prev - b.now) - (a.prev - a.now))
  }, [rows, mode, latest])
  return (
    <>
      <div className="qchips">
        <button className={'qc' + (mode === 'prev' ? ' on' : '')} onClick={() => setMode('prev')}>vs previous 3 months</button>
        <button className={'qc' + (mode === 'year' ? ' on' : '')} onClick={() => setMode('year')}>vs same months last year</button>
      </div>
      <p className="count muted">Customers whose last 3 months of buying fell by 40% or more (only those who bought over ₹20,000 before).</p>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !list.length && <Empty t="No big drops found" />}
      <ul className="list">{list.map((e) => {
        const p = pm.get(lc(e.k)), drop = e.prev ? Math.round((1 - e.now / e.prev) * 100) : 0
        return (
          <li key={e.k} className="card s-soon"><div className="row static">
            <div className="info"><div className="name">{e.k}</div><div className="meta"><span>Before {L(e.prev)}</span><span>Now {L(e.now)}</span></div>
              <Contact ph={phoneOf(p)} msg={'Hello ' + e.k + ', we have not seen an order from you lately. Is there anything we can help with? - Shree Bhavani Medical Distribution Agency'} /></div>
            <div className="qty"><b style={{ color: 'var(--bad)' }}>-{drop}%</b><small>buying</small></div></div></li>
        )
      })}</ul>
    </>
  )
}

function Overdue({ parties }) {
  const list = useMemo(() => parties.filter((p) => Number(p.receivable) > 0.5)
    .map((p) => ({ p, a: [p.age_30, p.age_60, p.age_90, p.age_90p].map((v) => Number(v) || 0) }))
    .sort((x, y) => (y.a[3] + y.a[2]) - (x.a[3] + x.a[2])), [parties])
  const tot = [0, 1, 2, 3].map((i) => list.reduce((s, x) => s + x.a[i], 0))
  if (!tot.some((v) => v > 0)) return <Empty t="Ageing appears after the next sync" />
  return (
    <>
      <p className="count muted">Credit bills only. What each customer owes is matched against their newest bills first; anything older, including opening balance, counts as 90+.</p>
      <div className="minis">{AGE.map(([l, c], i) => <div key={l} className="mini"><span>{l} days</span><b style={{ color: c }}>{L(tot[i])}</b></div>)}</div>
      <ul className="list" style={{ marginTop: 12 }}>{list.map(({ p, a }) => {
        const t = a.reduce((s, v) => s + v, 0) || 1
        return (
          <li key={p.id} className="card"><div className="row static"><div className="info">
            <div className="name">{p.name}</div>
            <div className="stack">{a.map((v, i) => v > 0 && <i key={i} style={{ width: (v / t) * 100 + '%', background: AGE[i][1] }} />)}</div>
            <div className="meta"><span>90+: {rs(a[3])}</span><span>61-90: {rs(a[2])}</span></div>
            <Contact ph={phoneOf(p)} msg={'Dear ' + p.name + ', this is a gentle reminder from Shree Bhavani Medical Distribution Agency. Your outstanding balance is ' + rs(p.receivable) + '. Kindly arrange the payment. Thank you.'} />
          </div><div className="amt due">{rs(p.receivable)}</div></div></li>
        )
      })}</ul>
    </>
  )
}

function Margins({ fys }) {
  const [fy, setFy] = useState('')
  const [by, setBy] = useState('company')
  const [rows, setRows] = useState(null)
  useEffect(() => { if (!fy && fys.length) setFy(fys[fys.length - 1]) }, [fys, fy])
  useEffect(() => {
    if (!fy) return
    setRows(null)
    fetchAll('fy_product_monthly', 'product,company,amount,cost', (q) => q.eq('fy', fy)).then(setRows).catch(() => setRows([]))
  }, [fy])
  const { items, sales, cost } = useMemo(() => {
    const m = new Map(); let s = 0, c = 0
    ;(rows || []).forEach((r) => {
      const k = (by === 'company' ? r.company : r.product) || 'Other', e = m.get(k) || { a: 0, c: 0 }
      e.a += Number(r.amount); e.c += Number(r.cost) || 0; m.set(k, e); s += Number(r.amount); c += Number(r.cost) || 0
    })
    return { items: [...m.entries()].map(([k, e]) => ({ k, m: e.a - e.c, pct: e.a ? ((e.a - e.c) / e.a) * 100 : 0, a: e.a })).sort((x, y) => y.m - x.m).slice(0, 15), sales: s, cost: c }
  }, [rows, by])
  const mx = Math.max(1, ...items.map((i) => i.m))
  return (
    <>
      <div className="filters">
        <div className="seg">{[['company', 'Companies'], ['product', 'Products']].map(([k, l]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}</div>
        <select value={fy} onChange={(e) => setFy(e.target.value)}>{fys.map((f) => <option key={f} value={f}>{f}</option>)}</select>
      </div>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && cost <= 0 && <Empty t="No cost data yet. Re-run the history upload for this year." />}
      {rows && cost > 0 && (
        <>
          <div className="total"><span>Estimated margin, {fy}</span><b>{L(sales - cost)}</b><span>{(((sales - cost) / sales) * 100).toFixed(1)}%</span></div>
          <p className="count muted">Estimate: bill value minus batch cost price. Check one product against your own figures.</p>
          <div className="chartcard"><ul className="bars">{items.map((i) => (
            <li key={i.k}><div className="bl"><span>{i.k}</span><b>{L(i.m)} · {i.pct.toFixed(0)}%</b></div><div className="bt"><div className="bf" style={{ width: Math.max(0, (i.m / mx) * 100) + '%' }} /></div></li>
          ))}</ul></div>
        </>
      )}
    </>
  )
}

export default function Insights() {
  const [tab, setTab] = useState('trends')
  const [stock, setStock] = useState([])
  const [parties, setParties] = useState([])
  const [fm, setFm] = useState([])
  useEffect(() => {
    Promise.all([
      fetchAll('stock_summary', '*'),
      fetchAll('parties', 'id,name,city,phone,phone2,receivable,payable,age_30,age_60,age_90,age_90p'),
      fetchAll('fy_monthly', 'fy,ym,kind'),
    ]).then(([s, p, f]) => { setStock(s); setParties(p); setFm(f) }).catch(() => {})
  }, [])
  const latest = Math.max(0, ...fm.filter((r) => r.kind === 'S').map((r) => r.ym))
  const fys = [...new Set(fm.map((r) => r.fy))].sort()
  return (
    <div className="app">
      <header className="top"><h1 className="h1">Insights</h1></header>
      <div className="qchips">{TABS.map(([k, l]) => <button key={k} className={'qc' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div style={{ marginTop: 12 }}>
        {tab === 'trends' && <Trends />}
        {tab === 'reorder' && <Reorder stock={stock} latest={latest} />}
        {tab === 'slow' && <Slow stock={stock} />}
        {tab === 'quiet' && <Quiet latest={latest} parties={parties} />}
        {tab === 'overdue' && <Overdue parties={parties} />}
        {tab === 'margin' && <Margins fys={fys} />}
      </div>
    </div>
  )
}