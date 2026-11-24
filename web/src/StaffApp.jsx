import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs, APP, SHOP } from './util'
import { Mark } from './Logo'
import MonthPick, { curYm, ymName } from './MonthPick'
import { askConfirm, showMsg } from './dialog'
import { daysIn, inMonth, ymOf, leaveBalance, cashBalance } from './staffcalc'
import { STAFF_CATS, iso, dm, span, uploadBill } from './expcommon'

// The only screen an employee login can open: add own expenses, own trips, see own attendance and cash in hand.
// The database enforces this: an employee login cannot read stock, customers, sales or anyone else's records.

const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }

function AddExpense({ emp, uid, trips, cash, spentMonth, onSaved }) {
  const open = trips.find((t) => t.status === 'open')
  const [cat, setCat] = useState('')
  const [amt, setAmt] = useState('')
  const [d, setD] = useState(iso(new Date()))
  const [note, setNote] = useState('')
  const [trip, setTrip] = useState(open ? String(open.id) : '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open && !trip) setTrip(String(open.id)) }, [open]) // eslint-disable-line

  const save = async () => {
    const category = cat.trim(), amount = Number(amt)
    if (!category) return setErr('Choose a category.')
    if (!(amount > 0)) return setErr('Enter the amount.')
    setBusy(true); setErr('')
    try {
      let photo = null
      if (file) photo = await uploadBill(file, String(emp.id))
      const { error } = await supabase.from('expenses').insert({ d, category, amount, note: note || null, emp_id: emp.id, trip_id: trip ? Number(trip) : null, created_by: uid, photo })
      if (error) throw error
      setCat(''); setAmt(''); setNote(''); setFile(null); onSaved(category + ' ' + rs(amount) + ' saved')
    } catch (e) { setErr('Could not save: ' + (e.message || e)) }
    setBusy(false)
  }
  return (
    <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
      {cash.given > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cash in hand with you</span><b style={{ color: cash.balance < 0 ? 'var(--bad)' : undefined }}>{rs(cash.balance)}</b></div>}
      {cash.given > 0 && cash.balance < 0 && <span className="muted small">Negative means the shop owes you this much.</span>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{STAFF_CATS.map((c) => <button key={c} className={'qc' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
      <input {...inp} placeholder="Or type another category" value={cat} onChange={(e) => setCat(e.target.value)} />
      <input {...inp} type="number" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <input {...inp} type="date" value={d} max={iso(new Date())} onChange={(e) => setD(e.target.value)} />
      {trips.length > 0 && (
        <select {...inp} value={trip} onChange={(e) => setTrip(e.target.value)}>
          <option value="">Not for a trip</option>
          {trips.filter((t) => t.status === 'open' || String(t.id) === trip).map((t) => <option key={t.id} value={t.id}>{t.city} trip ({dm(t.start_d)})</option>)}
        </select>)}
      <input {...inp} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="muted small">Bill photo (optional)
        <input {...inp} type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files && e.target.files[0])} />
      </label>
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save expense'}</button>
      <span className="muted small">Spent this month: {rs(spentMonth)}</span>
    </div>
  )
}

function Recent({ rows, trips, reload }) {
  const del = async (r) => {
    if (!await askConfirm('Delete ' + r.category + ' ' + rs(r.amount) + '?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', r.id)
    if (error) return showMsg('Could not delete: ' + error.message)
    reload()
  }
  const city = (id) => { const t = trips.find((x) => x.id === id); return t ? t.city : '' }
  const editable = (r) => Date.now() - new Date(r.created_at).getTime() < 864e5
  if (!rows.length) return <p className="muted small">No expenses entered this month.</p>
  return rows.map((r) => (
    <div key={r.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span><b>{dm(r.d)}</b> {r.category}{r.trip_id ? <span className="muted small"> | {city(r.trip_id)} trip</span> : ''}{r.note ? <span className="muted small"> | {r.note}</span> : ''}{r.photo ? <span className="muted small"> | photo</span> : ''}</span>
      <span><b>{rs(r.amount)}</b> {editable(r) && <button className="ghost sm" onClick={() => del(r)}>x</button>}</span>
    </div>))
}

function Trips({ emp, uid, trips, exps, reload }) {
  const [city, setCity] = useState('')
  const [why, setWhy] = useState('')
  const [from, setFrom] = useState(iso(new Date()))
  const [err, setErr] = useState('')
  const open = trips.find((t) => t.status === 'open')
  const start = async () => {
    if (!city.trim()) return setErr('Enter the city.')
    const { error } = await supabase.from('trips').insert({ emp_id: emp.id, city: city.trim(), purpose: why || null, start_d: from, created_by: uid })
    if (error) return setErr('Could not save: ' + error.message)
    setCity(''); setWhy(''); setErr(''); reload()
  }
  const end = async (t) => {
    if (!await askConfirm('End the ' + t.city + ' trip today?')) return
    const { error } = await supabase.from('trips').update({ status: 'closed', end_d: iso(new Date()) }).eq('id', t.id)
    if (error) return showMsg('Could not save: ' + error.message)
    reload()
  }
  const tot = (id) => exps.filter((x) => x.trip_id === id).reduce((s, x) => s + Number(x.amount), 0)
  return (
    <>
      {open ? (
        <div className="chartcard" style={{ display: 'grid', gap: 6 }}>
          <b>On trip: {open.city}</b>
          <span className="muted small">Since {dm(open.start_d)}{open.purpose ? ' | ' + open.purpose : ''}</span>
          <span>Spent so far: <b>{rs(tot(open.id))}</b></span>
          <button className="ghost" style={{ margin: 0 }} onClick={() => end(open)}>End this trip</button>
        </div>) : (
        <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
          <b>Start a trip</b>
          <input {...inp} placeholder="City / place" value={city} onChange={(e) => setCity(e.target.value)} />
          <input {...inp} placeholder="Purpose (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <input {...inp} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          {err && <p className="error">{err}</p>}
          <button className="primary" onClick={start}>Start trip</button>
        </div>)}
      {trips.filter((t) => t.status !== 'open').length > 0 && <h2 className="h2" style={{ marginTop: 14 }}>Earlier trips</h2>}
      {trips.filter((t) => t.status !== 'open').sort((a, b) => b.start_d.localeCompare(a.start_d)).map((t) => (
        <div key={t.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span><b>{t.city}</b> <span className="muted small">{dm(t.start_d)}{t.end_d && t.end_d !== t.start_d ? ' to ' + dm(t.end_d) : ''}</span></span><b>{rs(tot(t.id))}</b>
        </div>))}
    </>)
}

function Attendance({ emp, entries }) {
  const [ym, setYm] = useState(curYm())
  const days = daysIn(ym), y = Math.floor(ym / 100), m = ym % 100
  const mine = entries.filter((e) => inMonth(e.d, ym))
  const kindOn = (day) => { const d = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'); return mine.filter((e) => e.d === d).map((e) => e.kind)[0] || '' }
  const lead = new Date(y, m - 1, 1).getDay()
  const today = iso(new Date())
  const color = { absent: 'var(--bad)', half: 'var(--warn)', paidleave: 'var(--accent)' }
  const nA = mine.filter((e) => e.kind === 'absent').length, nH = mine.filter((e) => e.kind === 'half').length, nP = mine.filter((e) => e.kind === 'paidleave').length
  const lb = leaveBalance(emp, entries.map((e) => ({ ...e, emp_id: emp.id })), ym)
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(<i key={'b' + i} />)
  for (let day = 1; day <= days; day++) {
    const k = kindOn(day), d = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'), fut = d > today
    cells.push(<div key={day} style={{ textAlign: 'center', padding: '8px 0', borderRadius: 8, background: k ? color[k] : 'transparent', color: k ? '#fff' : fut ? 'var(--muted)' : undefined, border: k ? 0 : '1px solid var(--line)', fontWeight: 600 }}>{day}</div>)
  }
  return (
    <>
      <MonthPick ym={ym} onChange={setYm} />
      <div className="chartcard">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8, textAlign: 'center' }} className="muted small">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i}>{x}</span>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>{cells}</div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>Plain days = present. <b style={{ color: 'var(--bad)' }}>Red</b> absent, <b style={{ color: 'var(--warn)' }}>amber</b> half day, <b style={{ color: 'var(--accent)' }}>blue</b> paid leave.</p>
      </div>
      <div className="minis" style={{ marginTop: 10 }}>
        <div className="mini"><span>Absent</span><b>{nA}</b></div>
        <div className="mini"><span>Half days</span><b>{nH}</b></div>
        <div className="mini"><span>Paid leave</span><b>{nP}</b></div>
      </div>
      {lb.quota > 0 && <p className="muted small" style={{ marginTop: 10 }}>Paid leaves this financial year: used {lb.used} of {lb.quota}, {Math.max(0, lb.left)} left.</p>}
      <p className="muted small">Attendance is marked by the owner. If something is wrong, tell the owner.</p>
    </>)
}

export default function StaffApp({ session, empId }) {
  const [tab, setTab] = useState('exp')
  const [emp, setEmp] = useState(null)
  const [exps, setExps] = useState([])
  const [trips, setTrips] = useState([])
  const [cashRows, setCashRows] = useState([])
  const [ents, setEnts] = useState([])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const uid = session.user.id

  const load = useCallback(async () => {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from('employees').select('*').eq('id', empId).limit(1),
      supabase.from('expenses').select('*').order('d', { ascending: false }).order('id', { ascending: false }),
      supabase.from('trips').select('*').order('start_d', { ascending: false }),
      supabase.from('emp_cash').select('*'),
      supabase.from('emp_entries').select('*').order('d'),
    ])
    const bad = [a, b, c, d, e].find((x) => x.error)
    if (bad) return setErr(bad.error.message)
    setErr(''); setEmp(a.data[0] || null); setExps(b.data); setTrips(c.data); setCashRows(d.data); setEnts(e.data)
  }, [empId])
  useEffect(() => { load() }, [load])

  const cash = useMemo(() => cashBalance(cashRows, exps), [cashRows, exps])
  const ym = curYm(), sp = span(ym)
  const monthRows = exps.filter((x) => x.d >= sp.from && x.d <= sp.to)
  const spentMonth = monthRows.reduce((s, x) => s + Number(x.amount), 0)
  const saved = (msg) => { setOk(msg); setTimeout(() => setOk(''), 3000); load() }

  if (!emp && !err) return <p className="muted pad">Loading...</p>
  return (
    <div className="app">
      <header className="top">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Mark size={38} id="staff" /><div><div className="muted small">{SHOP}</div><h1 className="h1" style={{ fontSize: 20 }}>{emp ? emp.name : APP}</h1></div></div>
        <button className="ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {err && <p className="error pad">{err}</p>}
      {ok && <p className="pad" style={{ color: 'var(--good)', fontWeight: 600 }}>{ok}</p>}
      <div style={{ display: 'flex', gap: 6, margin: '8px 0 12px' }}>
        {[['exp', 'Expenses'], ['trips', 'Trips'], ['att', 'My attendance']].map(([k, l]) => <button key={k} className={'qc' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {emp && tab === 'exp' && (
        <>
          <AddExpense emp={emp} uid={uid} trips={trips} cash={cash} spentMonth={spentMonth} onSaved={saved} />
          <h2 className="h2" style={{ marginTop: 14 }}>{ymName(ym)}</h2>
          <Recent rows={monthRows} trips={trips} reload={load} />
        </>)}
      {emp && tab === 'trips' && <Trips emp={emp} uid={uid} trips={trips} exps={exps} reload={load} />}
      {emp && tab === 'att' && <Attendance emp={emp} entries={ents} />}
    </div>
  )
}
