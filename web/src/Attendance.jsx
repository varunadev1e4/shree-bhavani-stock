import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { showMsg } from './dialog'
import { iso, dm } from './expcommon'
import { inMonth, ymOf, daysIn } from './staffcalc'

// Daily attendance for everyone on one screen. Everybody counts as present unless you mark absent / half day / paid leave.
// Employees can see their own attendance in their own login (read only).
const OPTIONS = [['', 'Present'], ['absent', 'Absent'], ['half', 'Half day'], ['paidleave', 'Paid leave']]
const ATT = ['absent', 'half', 'paidleave']
const shift = (d, n) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return iso(t) }

export default function Attendance({ back }) {
  const [d, setD] = useState(iso(new Date()))
  const [emps, setEmps] = useState(null)
  const [ents, setEnts] = useState([])
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const from = d.slice(0, 7) + '-01', to = d.slice(0, 7) + '-' + String(daysIn(ymOf(d))).padStart(2, '0')
    const [a, b] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('emp_entries').select('id,emp_id,d,kind').in('kind', ATT).gte('d', from).lte('d', to),
    ])
    if (a.error || b.error) { setErr((a.error || b.error).message); setEmps([]); return }
    setErr(''); setEmps(a.data); setEnts(b.data)
  }, [d])
  useEffect(() => { load() }, [load])

  const people = (emps || []).filter((e) => e.active && !e.no_attendance && (!e.join_date || e.join_date <= d) && (!e.leave_date || e.leave_date >= d))
  const kindOf = (id) => { const x = ents.find((e) => e.emp_id === id && e.d === d); return x ? x.kind : '' }

  const mark = async (emp, kind) => {
    setBusy(emp.id)
    const del = await supabase.from('emp_entries').delete().eq('emp_id', emp.id).eq('d', d).in('kind', ATT)
    if (del.error) { setBusy(0); return showMsg('Could not save: ' + del.error.message) }
    if (kind) {
      const { error } = await supabase.from('emp_entries').insert({ emp_id: emp.id, d, kind, amount: kind === 'half' ? 0.5 : 1 })
      if (error) { setBusy(0); return showMsg('Could not save: ' + error.message) }
    }
    await load(); setBusy(0)
  }
  const offDates = (id) => ents.filter((x) => x.emp_id === id && x.kind !== 'present').sort((a, b) => a.d.localeCompare(b.d)).map((x) => Number(x.d.slice(8, 10)) + (x.kind === 'half' ? ' (half)' : x.kind === 'paidleave' ? ' (PL)' : '')).join(', ')
  const monthAbs = (id) => ents.filter((e) => e.emp_id === id && inMonth(e.d, ymOf(d)) && e.kind !== 'paidleave').reduce((s, e) => s + (e.kind === 'half' ? 0.5 : 1), 0)

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Attendance</h1></div></header>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button className="ghost sm" onClick={() => setD(shift(d, -1))}>&lsaquo;</button>
        <input className="fsel" type="date" value={d} onChange={(e) => e.target.value && setD(e.target.value)} style={{ flex: 1 }} />
        <button className="ghost sm" onClick={() => setD(shift(d, 1))} disabled={d >= iso(new Date())}>&rsaquo;</button>
      </div>
      <p className="muted small" style={{ margin: '0 0 8px' }}>{dm(d)}: everyone is present unless you tap another option.</p>
      {err && <p className="error pad">{err}</p>}
      {!emps && <p className="muted pad">Loading...</p>}
      {emps && !people.length && !err && <div className="empty"><b>No working employees on this date</b></div>}
      {people.map((e) => (
        <div key={e.id} className="chartcard" style={{ marginBottom: 8, opacity: busy === e.id ? 0.6 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{e.name}</b><span className="muted small">{e.role || ''}{monthAbs(e.id) ? ' | off this month: ' + offDates(e.id) : ''}</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {OPTIONS.map(([k, l]) => <button key={l} disabled={busy === e.id} className={'qc' + (kindOf(e.id) === k ? ' on' : '')} onClick={() => kindOf(e.id) !== k && mark(e, k)}>{l}</button>)}
          </div>
        </div>))}
    </div>
  )
}
