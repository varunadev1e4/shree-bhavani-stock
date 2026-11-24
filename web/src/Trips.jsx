import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs } from './util'
import ExportBar from './Export'
import { askConfirm, askPrompt, showMsg } from './dialog'
import { iso, dm, money, billUrl } from './expcommon'

// Owner's view of employees' work trips: where they went, what they spent, cash given against it.
const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }

function Detail({ trip, emp, exps, cash, back, reload }) {
  const mine = exps.filter((x) => x.trip_id === trip.id).sort((a, b) => a.d.localeCompare(b.d))
  const given = cash.filter((c) => c.trip_id === trip.id && c.kind === 'given').reduce((s, c) => s + Number(c.amount), 0)
  const returned = cash.filter((c) => c.trip_id === trip.id && c.kind === 'returned').reduce((s, c) => s + Number(c.amount), 0)
  const spent = mine.reduce((s, x) => s + Number(x.amount), 0)
  const byCat = useMemo(() => { const m = new Map(); mine.forEach((x) => m.set(x.category, (m.get(x.category) || 0) + Number(x.amount))); return [...m].sort((a, b) => b[1] - a[1]) }, [mine])
  const days = Math.max(1, Math.round((new Date((trip.end_d || iso(new Date())) + 'T00:00:00') - new Date(trip.start_d + 'T00:00:00')) / 864e5) + 1)

  const addCash = async (kind) => {
    const v = await askPrompt(kind === 'given' ? 'Cash given for this trip (Rs)' : 'Cash returned by ' + emp.name + ' (Rs)', '')
    const amount = Number(v)
    if (!(amount > 0)) return
    const { error } = await supabase.from('emp_cash').insert({ emp_id: emp.id, d: iso(new Date()), kind, amount, trip_id: trip.id })
    if (error) return showMsg('Could not save: ' + error.message)
    reload()
  }
  const close = async () => {
    const { error } = await supabase.from('trips').update({ status: 'closed', end_d: trip.end_d || iso(new Date()) }).eq('id', trip.id)
    if (error) return showMsg('Could not save: ' + error.message)
    reload()
  }
  const del = async () => {
    if (!await askConfirm('Delete the ' + trip.city + ' trip? Its expenses stay in Expenses, only the trip label is removed.')) return
    await supabase.from('trips').delete().eq('id', trip.id); back(); reload()
  }
  const photo = async (p) => { try { window.open(await billUrl(p), '_blank') } catch (e) { showMsg('Could not open the photo: ' + e.message) } }
  const build = () => {
    const out = mine.map((x) => [dm(x.d), x.category, x.note || '', money(x.amount)])
    const bold = [out.length]
    out.push(['', 'TOTAL SPENT', '', money(spent)])
    out.push(['', 'Cash given', '', money(given)]); out.push(['', 'Cash returned', '', money(returned)])
    out.push(['', given - returned - spent >= 0 ? 'Employee to return' : 'Shop to pay employee', '', money(Math.abs(given - returned - spent))])
    return { title: 'Trip: ' + trip.city + ' | ' + emp.name, subtitle: dm(trip.start_d) + (trip.end_d ? ' to ' + dm(trip.end_d) : ' (open)') + (trip.purpose ? ' | ' + trip.purpose : ''), filename: 'trip-' + trip.city.replace(/\W+/g, '-').toLowerCase() + '-' + trip.start_d, columns: ['Date', 'Category', 'Note', 'Amount'], rows: out, bold, numCols: [3] }
  }
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>{trip.city}</h1>
        <span className="muted small">{emp.name} | {dm(trip.start_d)}{trip.end_d ? ' to ' + dm(trip.end_d) : ' | still on trip'}{trip.purpose ? ' | ' + trip.purpose : ''}</span></div></header>
      <div className="minis" style={{ marginBottom: 10 }}>
        <div className="mini"><span>Spent</span><b>{rs(spent)}</b><small className="muted">{rs(spent / days)} / day</small></div>
        <div className="mini"><span>Cash given</span><b>{rs(given)}</b></div>
        <div className="mini"><span>{given - returned - spent >= 0 ? 'To return' : 'Shop owes'}</span><b>{rs(Math.abs(given - returned - spent))}</b></div>
      </div>
      <div className="btnrow" style={{ paddingTop: 0 }}>
        <button className="ghost sm" onClick={() => addCash('given')}>+ Cash given</button>
        <button className="ghost sm" onClick={() => addCash('returned')}>+ Cash returned</button>
        {trip.status === 'open' && <button className="ghost sm" onClick={close}>Close trip</button>}
      </div>
      {byCat.length > 0 && <div className="chartcard" style={{ display: 'grid', gap: 4 }}>{byCat.map(([c, v]) => <div key={c} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{c}</span><b>{rs(v)}</b></div>)}</div>}
      <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
      {!mine.length && <p className="muted small">No expenses tagged to this trip yet.</p>}
      {mine.map((x) => (
        <div key={x.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span><b>{dm(x.d)}</b> {x.category}{x.note ? <span className="muted small"> | {x.note}</span> : ''}</span>
          <span><b>{rs(x.amount)}</b> {x.photo && <button className="ghost sm" onClick={() => photo(x.photo)}>Bill</button>}</span>
        </div>))}
      <button className="ghost" style={{ marginTop: 14, color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={del}>Delete trip</button>
    </div>
  )
}

export default function Trips({ back }) {
  const [trips, setTrips] = useState(null)
  const [emps, setEmps] = useState([])
  const [exps, setExps] = useState([])
  const [cash, setCash] = useState([])
  const [who, setWho] = useState('')
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(false)
  const [f, setF] = useState({ emp: '', city: '', purpose: '', from: iso(new Date()) })
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('trips').select('*').order('start_d', { ascending: false }),
      supabase.from('employees').select('id,name,active').order('name'),
      supabase.from('expenses').select('id,d,category,amount,note,photo,trip_id,emp_id').not('trip_id', 'is', null),
      supabase.from('emp_cash').select('*').not('trip_id', 'is', null),
    ])
    const bad = [a, b, c, d].find((x) => x.error)
    if (bad) { setErr(bad.error.message + ' (run migration-23.sql in Supabase)'); setTrips([]); return }
    setErr(''); setTrips(a.data); setEmps(b.data); setExps(c.data); setCash(d.data)
  }, [])
  useEffect(() => { load() }, [load])

  const name = (id) => (emps.find((e) => e.id === id) || {}).name || '?'
  const list = (trips || []).filter((t) => !who || String(t.emp_id) === who)
  const tot = (id) => exps.filter((x) => x.trip_id === id).reduce((s, x) => s + Number(x.amount), 0)

  const add = async () => {
    if (!f.emp || !f.city.trim()) return setErr('Choose the employee and enter the city.')
    const { error } = await supabase.from('trips').insert({ emp_id: Number(f.emp), city: f.city.trim(), purpose: f.purpose || null, start_d: f.from })
    if (error) return setErr('Could not save: ' + error.message)
    setForm(false); setF({ emp: '', city: '', purpose: '', from: iso(new Date()) }); setErr(''); load()
  }
  const cur = sel && (trips || []).find((t) => t.id === sel)
  if (cur) return <Detail trip={cur} emp={{ id: cur.emp_id, name: name(cur.emp_id) }} exps={exps} cash={cash} back={() => setSel(null)} reload={load} />

  const build = () => ({ title: 'Work trips' + (who ? ' | ' + name(Number(who)) : ''), subtitle: list.length + ' trips', filename: 'trips', columns: ['Employee', 'City', 'From', 'To', 'Spent'],
    rows: [...list.map((t) => [name(t.emp_id), t.city, dm(t.start_d), t.end_d ? dm(t.end_d) : 'open', money(tot(t.id))]), ['', 'TOTAL', '', '', money(list.reduce((s, t) => s + tot(t.id), 0))]], bold: [list.length], numCols: [4] })

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Trips</h1></div>
        <button className="ghost sm" onClick={() => setForm(!form)}>+ Add</button></header>
      {form && (
        <div className="chartcard" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <select {...inp} value={f.emp} onChange={(e) => setF({ ...f, emp: e.target.value })}><option value="">Employee</option>{emps.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <input {...inp} placeholder="City / place" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          <input {...inp} placeholder="Purpose (optional)" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
          <input {...inp} type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <div className="btnrow" style={{ paddingTop: 0 }}><button className="primary" style={{ flex: 1 }} onClick={add}>Save</button><button className="ghost" style={{ margin: 0 }} onClick={() => setForm(false)}>Cancel</button></div>
        </div>)}
      {err && <p className="error pad">{err}</p>}
      {emps.length > 1 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button className={'qc' + (!who ? ' on' : '')} onClick={() => setWho('')}>Everyone</button>
        {emps.filter((e) => (trips || []).some((t) => t.emp_id === e.id)).map((e) => <button key={e.id} className={'qc' + (who === String(e.id) ? ' on' : '')} onClick={() => setWho(String(e.id))}>{e.name}</button>)}
      </div>}
      {!trips && <p className="muted pad">Loading...</p>}
      {trips && !list.length && !err && <div className="empty"><b>No trips yet</b><span>Employees can start a trip from their own login, or tap + Add.</span></div>}
      {list.length > 0 && <div style={{ marginBottom: 8 }}><ExportBar build={build} /></div>}
      {list.map((t) => (
        <button key={t.id} className="chartcard" style={{ width: '100%', textAlign: 'left', border: 0, marginBottom: 8, display: 'grid', gap: 3 }} onClick={() => setSel(t.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{t.city}</b><b>{rs(tot(t.id))}</b></div>
          <span className="muted small">{name(t.emp_id)} | {dm(t.start_d)}{t.end_d && t.end_d !== t.start_d ? ' to ' + dm(t.end_d) : ''} | {t.status === 'open' ? 'on trip now' : 'closed'}{t.purpose ? ' | ' + t.purpose : ''}</span>
        </button>))}
    </div>
  )
}
