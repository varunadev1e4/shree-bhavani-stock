import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, num, L, addYm } from './util'

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function HBars({ items }) {
  const mx = Math.max(1, ...items.map((i) => Math.abs(i.v)))
  return (
    <ul className="bars">{items.map((i) => (
      <li key={i.k}><div className="bl"><span>{i.k}</span><b>{i.t}</b></div>
        <div className="bt"><div className={'bf' + (i.v < 0 ? ' neg' : '')} style={{ width: (Math.abs(i.v) / mx) * 100 + '%' }} /></div></li>
    ))}</ul>
  )
}
const Card = ({ title, note, children }) => (
  <>
    <h2 className="h2">{title}</h2>
    <div className="chartcard">{children}{note && <p className="muted small" style={{ margin: '10px 6px 0' }}>{note}</p>}</div>
  </>
)
const Wait = () => <p className="muted pad">Loading...</p>

export default function Analysis({ stock, parties, fys, latest }) {
  const cur = fys[fys.length - 1], prev = fys[fys.length - 2]
  const [daily, setDaily] = useState(null)
  const [pm, setPm] = useState(null)
  const [pp, setPp] = useState(null)
  useEffect(() => { fetchAll('daily_summary', 'day,kind,bills,amount').then(setDaily).catch(() => setDaily([])) }, [])
  useEffect(() => {
    if (!cur) return
    fetchAll('fy_product_monthly', 'fy,ym,product,company,amount,qty', (q) => q.in('fy', prev ? [prev, cur] : [cur])).then(setPm).catch(() => setPm([]))
    fetchAll('fy_party_monthly', 'ym,party,amount', (q) => q.eq('fy', cur)).then(setPp).catch(() => setPp([]))
  }, [cur, prev])

  // Daily figures: last 30 days, collection ratio, days of sales outstanding, weekday pattern
  const dk = useMemo(() => {
    if (!daily || !daily.length) return null
    const days = [...new Set(daily.map((r) => r.day))].sort()
    const sum = (kind, list) => daily.filter((r) => r.kind === kind && list.includes(r.day)).reduce((s, r) => s + Number(r.amount), 0)
    const first = new Date(days[0]), last = new Date(days[days.length - 1])
    const span = Math.round((last - first) / 864e5) + 1
    const cnt = Array(7).fill(0), tot = Array(7).fill(0)
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) cnt[d.getDay()]++
    daily.filter((r) => r.kind === 'S').forEach((r) => { tot[new Date(r.day).getDay()] += Number(r.amount) })
    const s90 = sum('S', days), r90 = sum('RS', days)
    const l30 = sum('S', days.slice(-30)), p30 = sum('S', days.slice(-60, -30))
    const recv = parties.reduce((s, p) => s + (Number(p.receivable) || 0), 0)
    return { l30, p30, hasPrev: days.length > 35, coll: s90 ? Math.round((r90 / s90) * 100) : null, dso: s90 ? Math.round(recv / (s90 / span)) : null, span,
      wd: DAY.map((k, i) => ({ k, v: tot[i] / (cnt[i] || 1), t: L(tot[i] / (cnt[i] || 1)) })) }
  }, [daily, parties])

  // Customers: how much of sales comes from the biggest few
  const cust = useMemo(() => {
    if (!pp || !pp.length) return null
    const m = new Map(); pp.forEach((r) => m.set(r.party, (m.get(r.party) || 0) + Number(r.amount)))
    const list = [...m.entries()].sort((a, b) => b[1] - a[1]), total = list.reduce((s, [, v]) => s + v, 0)
    const share = (n) => Math.round((list.slice(0, n).reduce((s, [, v]) => s + v, 0) / total) * 100)
    return { n: list.length, s3: share(3), s10: share(10), s20: share(20), top: list.slice(0, 10).map(([k, v]) => ({ k, v, t: L(v) + ' · ' + Math.round((v / total) * 100) + '%' })) }
  }, [pp])

  // ABC: A = items making the first 80% of sales, B = next 15%, C = last 5%
  const abc = useMemo(() => {
    if (!pm) return null
    const m = new Map(); pm.filter((r) => r.fy === cur).forEach((r) => m.set(r.product, (m.get(r.product) || 0) + Number(r.amount)))
    const list = [...m.values()].sort((a, b) => b - a), total = list.reduce((s, v) => s + v, 0)
    if (!total) return null
    const g = { A: 0, B: 0, C: 0 }; let c = 0
    list.forEach((v) => { c += v; g[c - v < total * 0.8 ? 'A' : c - v < total * 0.95 ? 'B' : 'C']++ })
    return { g, n: list.length }
  }, [pm, cur])

  // Companies growing or shrinking against the same months last year
  const growth = useMemo(() => {
    if (!pm || !prev || !latest) return null
    const a = new Map(), b = new Map()
    pm.forEach((r) => {
      const c = r.company || 'Other'
      if (r.fy === cur && r.ym < latest) a.set(c, (a.get(c) || 0) + Number(r.amount))
      if (r.fy === prev && r.ym < addYm(latest, -12)) b.set(c, (b.get(c) || 0) + Number(r.amount))
    })
    const rows = [...new Set([...a.keys(), ...b.keys()])].map((k) => ({ k, d: (a.get(k) || 0) - (b.get(k) || 0), was: b.get(k) || 0 }))
    const f = (r) => ({ k: r.k, v: r.d, t: (r.d >= 0 ? '+' : '-') + L(Math.abs(r.d)) + (r.was ? ' · ' + (r.d >= 0 ? '+' : '-') + Math.abs(Math.round((r.d / r.was) * 100)) + '%' : ' · new') })
    const up = rows.filter((r) => r.d > 0).sort((x, y) => y.d - x.d).slice(0, 6).map(f)
    const dn = rows.filter((r) => r.d < 0).sort((x, y) => x.d - y.d).slice(0, 6).map(f)
    return { up, dn }
  }, [pm, cur, prev, latest])

  // Stock cover: how many months of sales the stock on hand would last
  const cover = useMemo(() => {
    if (!pm || !latest) return null
    const lo = addYm(latest, -3), sold = new Map()
    pm.forEach((r) => { if (r.ym >= lo && r.ym < latest) sold.set(r.product.toLowerCase(), (sold.get(r.product.toLowerCase()) || 0) + Number(r.qty)) })
    const b = { 'No sales in 3 months': 0, 'Under 1 month': 0, '1 to 2 months': 0, '2 to 4 months': 0, 'Over 4 months': 0 }
    stock.filter((p) => Number(p.total_qty) > 0).forEach((p) => {
      const avg = (sold.get(p.name.toLowerCase()) || 0) / 3, m = avg ? Number(p.total_qty) / avg : null
      b[m === null ? 'No sales in 3 months' : m < 1 ? 'Under 1 month' : m < 2 ? '1 to 2 months' : m < 4 ? '2 to 4 months' : 'Over 4 months']++
    })
    return Object.entries(b).map(([k, v]) => ({ k, v, t: v + ' items' }))
  }, [pm, stock, latest])

  return (
    <>
      {!dk ? <Wait /> : (
        <div className="minis">
          <div className="mini"><span>Sales, last 30 days</span><b>{L(dk.l30)}</b>
            {dk.hasPrev && dk.p30 > 0 && <small className={dk.l30 >= dk.p30 ? 'up' : 'dn'}>{dk.l30 >= dk.p30 ? '\u25B2 ' : '\u25BC '}{Math.abs(Math.round(((dk.l30 - dk.p30) / dk.p30) * 100))}% vs before</small>}</div>
          <div className="mini"><span>Collected vs sales</span><b>{dk.coll == null ? '-' : dk.coll + '%'}</b><small className="muted">last {dk.span} days</small></div>
          <div className="mini"><span>Days of sales owed</span><b>{dk.dso == null ? '-' : dk.dso + ' days'}</b><small className="muted">receivables / daily sales</small></div>
        </div>
      )}
      {dk && <Card title="Average sales by weekday" note={'Average per calendar day over the last ' + dk.span + ' days.'}><HBars items={dk.wd} /></Card>}
      {!pp ? <Wait /> : cust && (
        <Card title="Customer dependence" note={'Top 10 of ' + cust.n + ' customers this year. If a few customers make most of your sales, losing one hurts.'}>
          <div className="minis"><div className="mini"><span>Top 3</span><b>{cust.s3}%</b></div><div className="mini"><span>Top 10</span><b>{cust.s10}%</b></div><div className="mini"><span>Top 20</span><b>{cust.s20}%</b></div></div>
          <HBars items={cust.top} />
        </Card>
      )}
      {abc && (
        <Card title="Which items make the money" note={'Out of ' + abc.n + ' items sold this year. Keep A items always in stock; review C items before reordering.'}>
          <div className="minis">
            <div className="mini"><span>A items</span><b>{abc.g.A}</b><small className="muted">make 80% of sales</small></div>
            <div className="mini"><span>B items</span><b>{abc.g.B}</b><small className="muted">next 15%</small></div>
            <div className="mini"><span>C items</span><b>{abc.g.C}</b><small className="muted">last 5%</small></div>
          </div>
        </Card>
      )}
      {growth && (growth.up.length > 0 || growth.dn.length > 0) && (
        <>
          <Card title="Companies growing" note="Sales so far this year against the same months last year."><HBars items={growth.up} /></Card>
          <Card title="Companies falling"><HBars items={growth.dn} /></Card>
        </>
      )}
      {cover && <Card title="How long your stock will last" note="Items in stock, grouped by months of cover at the last 3 months' sales rate."><HBars items={cover} /></Card>}
    </>
  )
}