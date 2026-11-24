import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { rs, APP, SHOP } from './util'
import { Mark } from './Logo'
import MonthPick, { curYm, ymName } from './MonthPick'
import { askConfirm, showMsg } from './dialog'
import { daysIn, inMonth, leaveBalance } from './staffcalc'
import { STAFF_CATS, iso, dm, span } from './expcommon'

// The only screen an employee login can open: add own expenses (deducted from the shared shop fund) and see own attendance.
// The database enforces this: an employee login cannot read stock, customers, sales or anyone else's records.

const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }

function AddExpense({ emp, uid, balance, onSaved }) {
  const [cat, setCat] = useState('')
  const [amt, setAmt] = useState('')
  const [d, setD] = useState(iso(new Date()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const category = cat.trim(), amount = Number(amt)
    if (!(amount > 0)) return setErr('Enter the amount.')
    if (!category) return setErr('Tap what it was for.')
    setBusy(true); setErr('')
    const { error } = await supabase.from('expenses').insert({ d, category, amount, note: note || null, emp_id: emp.id, created_by: uid })
    setBusy(false)
    if (error) return setErr('Could not save: ' + error.message)
    setCat(''); setAmt(''); setNote(''); onSaved(category + ' ' + rs(amount) + ' saved')
  }
  return (
    <>
      <div className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span>Shop fund balance</span>
        <b style={{ fontSize: 22, color: balance != null && balance < 0 ? 'var(--bad)' : undefined }}>{balance == null ? '...' : rs(balance)}</b>
      </div>
      <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
        <input {...inp} type="number" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{STAFF_CATS.map((c) => <button key={c} className={'qc' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
        <input {...inp} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="muted small">Date<input {...inp} type="date" value={d} max={iso(new Date())} onChange={(e) => setD(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save expense'}</button>
      </div>
    </>
  )
}

function Recent({ rows, reload }) {
  const del = async (r) => {
    if (!await askConfirm('Delete ' + r.category + ' ' + rs(r.amount) + '? It will go back into the fund.')) return
    const { error } = await supabase.from('expenses').delete().eq('id', r.id)
    if (error) return showMsg('Could not delete: ' + error.message)
    reload()
  }
  const editable = (r) => Date.now() - new Date(r.created_at).getTime() < 864e5
  if (!rows.length) return <p className="muted small">You have not entered any expenses this month.</p>
  return rows.map((r) => (
    <div key={r.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span><b>{dm(r.d)}</b> {r.category}{r.note ? <span className="muted small"> | {r.note}</span> : ''}</span>
      <span><b>{rs(r.amount)}</b> {editable(r) && <button className="ghost sm" onClick={() => del(r)}>x</button>}</span>
    </div>))
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
  const [ents, setEnts] = useState([])
  const [balance, setBalance] = useState(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const uid = session.user.id

  const load = useCallback(async () => {
    const [a, b, e, f] = await Promise.all([
      supabase.from('employees').select('*').eq('id', empId).limit(1),
      supabase.from('expenses').select('*').order('d', { ascending: false }).order('id', { ascending: false }),
      supabase.from('emp_entries').select('*').order('d'),
      supabase.rpc('fund_balance'),
    ])
    const bad = [a, b, e].find((x) => x.error)
    if (bad) return setErr(bad.error.message)
    setErr(''); setEmp(a.data[0] || null); setExps(b.data); setEnts(e.data)
    if (!f.error) setBalance(f.data == null ? null : Number(f.data))
  }, [empId])
  useEffect(() => { load() }, [load])
  // Keep the shared balance fresh: every 30 seconds and whenever the app comes back to the front
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load() }, 30000)
    const v = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [load])

  const ym = curYm(), sp = span(ym)
  const monthRows = exps.filter((x) => x.d >= sp.from && x.d <= sp.to)
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
        {[['exp', 'Expenses'], ['att', 'My attendance']].map(([k, l]) => <button key={k} className={'qc' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {emp && tab === 'exp' && (
        <>
          <AddExpense emp={emp} uid={uid} balance={balance} onSaved={saved} />
          <h2 className="h2" style={{ marginTop: 14 }}>My entries, {ymName(ym)}</h2>
          <Recent rows={monthRows} reload={load} />
        </>)}
      {emp && tab === 'att' && <Attendance emp={emp} entries={ents} />}
    </div>
  )
}
