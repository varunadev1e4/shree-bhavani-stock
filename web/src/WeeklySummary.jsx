import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { rs } from './util'
import ExportBar from './Export'
import { iso, dm, money } from './expcommon'

// One-page summary of a Monday to Sunday week for the owner. Read-only: nothing here is written anywhere.
const addDays = (s, n) => { const x = new Date(s + 'T00:00:00'); x.setDate(x.getDate() + n); return iso(x) }
const mondayOf = (s) => { const x = new Date(s + 'T00:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x) }
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)
const arrow = (p) => (p == null ? '' : (p >= 0 ? '+' : '') + p + '% vs last week')

async function weekData(from) {
  const to = addDays(from, 6), pf = addDays(from, -7), pt = addDays(from, -1)
  const q = (a, b) => Promise.all([
    supabase.from('fy_margin_daily').select('d,bills,net,margin').gte('d', a).lte('d', b),
    supabase.from('daily_summary').select('day,kind,bills,amount').gte('day', a).lte('day', b),
  ])
  const [[s, ds], [ps]] = await Promise.all([q(from, to), q(pf, pt)])
  const [ex, tg, en, em, fb, rq, rp, rt, tk] = await Promise.all([
    supabase.from('expenses').select('amount,category,emp_id').gte('d', from).lte('d', to),
    supabase.from('bill_tags').select('emp_id').gte('d', from).lte('d', to),
    supabase.from('emp_entries').select('emp_id,kind,d').in('kind', ['absent', 'half', 'paidleave']).gte('d', from).lte('d', to),
    supabase.from('employees').select('id,name,active'),
    supabase.rpc('fund_balance'),
    supabase.from('fund_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('staff_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('field_returns').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('emp_tasks').select('id,due_d').eq('done', false),
  ])
  const sum = (l, k) => (l || []).reduce((t, r) => t + Number(r[k] || 0), 0)
  const dsum = (kind) => (ds.data || []).filter((r) => r.kind === kind).reduce((t, r) => t + Number(r.amount || 0), 0)
  const names = Object.fromEntries((em.data || []).map((e) => [e.id, e.name]))
  const byCat = {}; (ex.data || []).forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount) })
  const del = {}; (tg.data || []).forEach((r) => { del[r.emp_id] = (del[r.emp_id] || 0) + 1 })
  const off = {}; (en.data || []).forEach((r) => { off[r.emp_id] = off[r.emp_id] || { a: 0, h: 0, p: 0 }; off[r.emp_id][r.kind === 'absent' ? 'a' : r.kind === 'half' ? 'h' : 'p']++ })
  const best = (s.data || []).reduce((b, r) => (Number(r.net) > (b ? Number(b.net) : -1) ? r : b), null)
  return {
    from, to, sales: sum(s.data, 'net'), bills: sum(s.data, 'bills'), margin: sum(s.data, 'margin'), prevSales: sum(ps.data, 'net'),
    collected: dsum('RS'), purchases: dsum('P'), expenses: sum(ex.data, 'amount'), byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
    delivered: Object.entries(del).sort((a, b) => b[1] - a[1]).map(([id, n]) => [names[id] || '?', n]),
    off: Object.entries(off).map(([id, o]) => [names[id] || '?', o]), fund: fb.error ? null : Number(fb.data),
    open: { req: rq.count || 0, rep: rp.count || 0, ret: rt.count || 0, tasks: (tk.data || []).length, late: (tk.data || []).filter((t) => t.due_d && t.due_d < iso(new Date())).length },
    best,
  }
}

export default function WeeklySummary({ back }) {
  const lastWeek = addDays(mondayOf(iso(new Date())), -7)
  const [from, setFrom] = useState(lastWeek)
  const [w, setW] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { setW(null); setErr(''); weekData(from).then(setW).catch((e) => setErr(e.message)) }, [from])
  const thisMon = mondayOf(iso(new Date()))
  const build = () => ({
    title: 'Weekly summary', subtitle: dm(w.from) + ' to ' + dm(w.to), filename: 'weekly-' + w.from, columns: ['Item', 'Value'],
    rows: [['Sales', money(w.sales)], ['Bills', String(w.bills)], ['Margin', money(w.margin)], ['Collected', money(w.collected)], ['Purchases', money(w.purchases)], ['Expenses', money(w.expenses)],
      ...w.byCat.map(([c, a]) => ['  ' + c, money(a)]), ['Bills delivered', String(w.delivered.reduce((t, x) => t + x[1], 0))], ['Shop fund balance', w.fund == null ? '' : money(w.fund)]], numCols: [1],
  })
  const Row = ({ l, v, s }) => <div className="mini"><span>{l}</span><b>{v}</b>{s && <small className="muted">{s}</small>}</div>
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Weekly summary</h1></div></header>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button className="ghost sm" onClick={() => setFrom(addDays(from, -7))}>Prev</button>
        <b style={{ flex: 1, textAlign: 'center' }}>{dm(from)} to {dm(addDays(from, 6))}</b>
        <button className="ghost sm" disabled={from >= thisMon} onClick={() => setFrom(addDays(from, 7))}>Next</button>
      </div>
      {err && <p className="error">{err}</p>}
      {!w && !err && <p className="muted pad">Loading...</p>}
      {w && (
        <>
          <section className="minis">
            <Row l="Sales" v={rs(w.sales)} s={arrow(pct(w.sales, w.prevSales)) || w.bills + ' bills'} />
            <Row l="Margin" v={rs(w.margin)} s={w.sales > 0 ? Math.round((w.margin / w.sales) * 100) + '% of sales' : ''} />
            <Row l="Collected" v={rs(w.collected)} />
            <Row l="Purchases" v={rs(w.purchases)} />
            <Row l="Expenses" v={rs(w.expenses)} />
            <Row l="Fund now" v={w.fund == null ? '-' : rs(w.fund)} />
          </section>
          {w.best && <p className="muted small">Best day: {dm(w.best.d)} with {rs(w.best.net)}.</p>}
          {w.byCat.length > 0 && <div className="chartcard"><b>Expenses by type</b>{w.byCat.map(([c, a]) => <div key={c} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{c}</span><span>{rs(a)}</span></div>)}</div>}
          <div className="chartcard" style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}><b>Bills tagged as delivered</b><span>{w.delivered.reduce((t, x) => t + x[1], 0)}</span></div>
          <div className="chartcard" style={{ marginTop: 8 }}><b>Days off</b>{w.off.length ? w.off.map(([n, o]) => <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n}</span><span>{o.a} absent, {o.h} half, {o.p} paid leave</span></div>) : <p className="muted small">No leave or absence marked.</p>}</div>
          <div className="chartcard" style={{ marginTop: 8 }}><b>Waiting for you (right now)</b>
            <div>Fund requests: {w.open.req}</div><div>Reports and suggestions: {w.open.rep}</div><div>Return notes to act on: {w.open.ret}</div><div>Open tasks: {w.open.tasks}{w.open.late ? ' (' + w.open.late + ' overdue)' : ''}</div></div>
          <div style={{ marginTop: 10 }}><ExportBar build={build} /></div>
        </>)}
    </div>)
}
