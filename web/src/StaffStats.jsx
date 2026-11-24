import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs, fetchPaged } from './util'
import ExportBar from './Export'
import MonthPick, { curYm, ymName } from './MonthPick'
import { calc, inMonth } from './staffcalc'
import { span, money } from './expcommon'

// Owner's employee analytics for one month: who delivered most, who spent most, leave, tasks, reports and counting.
const rows = async (q) => { const r = await q; return r.error ? [] : r.data }
const all = (t, c, f) => fetchPaged(t, c, f).catch(() => [])
const sumBy = (list, key, val) => { const m = new Map(); list.forEach((x) => m.set(x[key], (m.get(x[key]) || 0) + (val ? Number(x[val]) : 1))); return m }

export default function StaffStats({ back }) {
  const [ym, setYm] = useState(curYm())
  const [d, setD] = useState(null)
  useEffect(() => {
    setD(null)
    ;(async () => {
      const s = span(ym), t1 = s.from + 'T00:00:00', t2 = s.to + 'T23:59:59'
      const [emps, ents, tags, exps, tasks, reps, rets, cnt] = await Promise.all([
        rows(supabase.from('employees').select('*').order('name')),
        all('emp_entries', '*'),
        all('bill_tags', 'emp_id,bill_no', (q) => q.gte('d', s.from).lte('d', s.to)),
        all('expenses', 'emp_id,amount,category', (q) => q.not('emp_id', 'is', null).gte('d', s.from).lte('d', s.to)),
        all('emp_tasks', 'done_by', (q) => q.eq('done', true).gte('done_at', t1).lte('done_at', t2)),
        all('staff_reports', 'emp_id', (q) => q.gte('created_at', t1).lte('created_at', t2)),
        all('field_returns', 'emp_id', (q) => q.gte('created_at', t1).lte('created_at', t2)),
        all('count_items', 'counted_by', (q) => q.not('counted_by', 'is', null).gte('counted_at', t1).lte('counted_at', t2)),
      ])
      const nos = [...new Set(tags.map((t) => t.bill_no))], heads = {}
      for (let i = 0; i < nos.length; i += 100) {
        const r = await rows(supabase.from('bill_heads').select('feed_no,net').in('feed_no', nos.slice(i, i + 100)).gte('d', s.from.slice(0, 4) + '-01-01'))
        r.forEach((x) => { heads[String(x.feed_no).trim().toUpperCase()] = Number(x.net) })
      }
      const val = new Map(); tags.forEach((t) => val.set(t.emp_id, (val.get(t.emp_id) || 0) + (heads[t.bill_no] || 0)))
      setD({ emps, ents, deliv: sumBy(tags, 'emp_id'), delivVal: val, spent: sumBy(exps, 'emp_id', 'amount'), nExp: sumBy(exps, 'emp_id'), tasks: sumBy(tasks, 'done_by'), reps: sumBy(reps, 'emp_id'), rets: sumBy(rets, 'emp_id'), cnt: sumBy(cnt, 'counted_by'), exps })
    })()
  }, [ym])

  const list = useMemo(() => {
    if (!d) return []
    return d.emps.filter((e) => e.active || d.deliv.get(e.id) || d.spent.get(e.id)).map((e) => {
      const c = calc(e, d.ents, ym), m = d.ents.filter((x) => x.emp_id === e.id && inMonth(x.d, ym))
      const n = d.deliv.get(e.id) || 0, sp = d.spent.get(e.id) || 0
      return { e, n, val: d.delivVal.get(e.id) || 0, sp, nExp: d.nExp.get(e.id) || 0, perBill: n ? sp / n : 0,
        off: m.filter((x) => x.kind === 'absent').length + 0.5 * m.filter((x) => x.kind === 'half').length, pl: m.filter((x) => x.kind === 'paidleave').length,
        tasks: d.tasks.get(e.id) || 0, reps: d.reps.get(e.id) || 0, rets: d.rets.get(e.id) || 0, cnt: d.cnt.get(e.id) || 0, net: c.net, adv: c.advance }
    })
  }, [d, ym])

  const top = (key) => { const b = [...list].sort((a, z) => z[key] - a[key])[0]; return b && b[key] > 0 ? b : null }
  const cards = [['Most deliveries', top('n'), (r) => r.n + ' bills'], ['Highest spender', top('sp'), (r) => rs(r.sp)], ['Most tasks done', top('tasks'), (r) => r.tasks + ' tasks'], ['Most days off', top('off'), (r) => r.off + ' day(s)']]
  const catTotals = useMemo(() => [...sumBy(d ? d.exps : [], 'category', 'amount')].sort((a, b) => b[1] - a[1]).slice(0, 5), [d])
  const maxN = Math.max(1, ...list.map((r) => r.n)), maxS = Math.max(1, ...list.map((r) => r.sp))

  const build = () => ({ title: 'Employee analytics: ' + ymName(ym), subtitle: list.length + ' employees', filename: 'staff-analytics-' + ym,
    columns: ['Employee', 'Bills delivered', 'Delivered value', 'Spent', 'Spent per bill', 'Days off', 'Tasks done', 'Reports', 'Return notes', 'Net salary'],
    rows: list.map((r) => [r.e.name, r.n, money(r.val), money(r.sp), r.n ? money(r.perBill) : '', r.off, r.tasks, r.reps, r.rets, money(r.net)]), numCols: [1, 2, 3, 4, 5, 6, 7, 8, 9] })

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Employee analytics</h1></div></header>
      <MonthPick ym={ym} onChange={setYm} />
      {!d && <p className="muted pad">Loading...</p>}
      {d && !list.length && <div className="empty"><b>No employees yet</b></div>}
      {d && list.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {cards.map(([l, r, f]) => (
              <div key={l} className="chartcard" style={{ display: 'grid', gap: 2 }}>
                <span className="muted small">{l}</span><b>{r ? r.e.name : '-'}</b><span className="muted small">{r ? f(r) : 'no data'}</span>
              </div>))}
          </div>
          <ExportBar build={build} />
          {list.map((r) => (
            <div key={r.e.id} className="chartcard" style={{ marginBottom: 8, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{r.e.name}</b><span className="muted small">{r.e.role || 'Staff'}</span></div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Bills delivered</span><b>{r.n}{r.val ? <span className="muted small"> | {rs(r.val)}</span> : ''}</b></div>
                <i style={{ display: 'block', height: 5, borderRadius: 3, background: 'var(--accent)', width: Math.max(r.n ? 3 : 0, (r.n / maxN) * 100) + '%' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Spent from fund</span><b>{rs(r.sp)}<span className="muted small"> | {r.nExp} entries{r.n ? ' | ' + rs(r.perBill) + ' per bill' : ''}</span></b></div>
                <i style={{ display: 'block', height: 5, borderRadius: 3, background: 'var(--warn)', width: Math.max(r.sp ? 3 : 0, (r.sp / maxS) * 100) + '%' }} />
              </div>
              <div className="muted small">Days off {r.off}{r.pl ? ' (+' + r.pl + ' paid leave)' : ''} | tasks done {r.tasks} | reports {r.reps} | return notes {r.rets} | stock lines counted {r.cnt}</div>
              <div className="muted small">Net salary {rs(r.net)}{r.adv > 0 ? ' | advance pending ' + rs(r.adv) : ''}</div>
            </div>))}
          {catTotals.length > 0 && (
            <div className="chartcard" style={{ display: 'grid', gap: 4 }}>
              <b>What staff spent on, {ymName(ym)}</b>
              {catTotals.map(([c, v]) => <div key={c} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{c}</span><span>{rs(v)}</span></div>)}
            </div>)}
          <p className="muted small" style={{ marginTop: 10 }}>Delivered value comes from bills already synced from Profit Maker. A bill tagged today may show no value until the next sync.</p>
        </>)}
    </div>
  )
}
