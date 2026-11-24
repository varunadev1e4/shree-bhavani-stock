import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { rs, APP, SHOP } from './util'
import { Mark } from './Logo'
import MonthPick, { curYm, ymName } from './MonthPick'
import { askConfirm, showMsg } from './dialog'
import { inMonth, leaveBalance } from './staffcalc'
import AttCalendar from './AttCalendar'
import { STAFF_CATS, iso, dm, span } from './expcommon'
import { Tasks, TagBill, Report, ReturnNote, RequestMoney, CountSheets } from './StaffTools'
import { pushSupported, pushOn, enablePush } from './push'

// The only screen an employee login can open. The database enforces this: an employee login cannot read
// stock, customers, sales, profit or anyone else's records.

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
  const mine = entries.filter((e) => inMonth(e.d, ym))
  const nA = mine.filter((e) => e.kind === 'absent').length, nH = mine.filter((e) => e.kind === 'half').length, nP = mine.filter((e) => e.kind === 'paidleave').length
  const lb = leaveBalance(emp, entries.map((e) => ({ ...e, emp_id: emp.id })), ym)
  return (
    <>
      <MonthPick ym={ym} onChange={setYm} />
      <AttCalendar ym={ym} entries={entries} />
      <div className="minis" style={{ marginTop: 10 }}>
        <div className="mini"><span>Absent</span><b>{nA}</b></div>
        <div className="mini"><span>Half days</span><b>{nH}</b></div>
        <div className="mini"><span>Paid leave</span><b>{nP}</b></div>
      </div>
      {lb.quota > 0 && <p className="muted small" style={{ marginTop: 10 }}>Paid leaves this financial year: used {lb.used} of {lb.quota}, {Math.max(0, lb.left)} left.</p>}
      <p className="muted small">Attendance is marked by the owner. If something is wrong, tell the owner.</p>
    </>)
}

const TILES = [
  ['exp', 'Add expense', 'Spend from the shop fund'],
  ['tasks', 'Today\'s tasks', ''],
  ['tag', 'Delivered bills', 'Tag the bills you delivered'],
  ['report', 'Suggest / report', 'Low stock, new product, problem'],
  ['ret', 'Sales return note', 'Expired or damaged goods'],
  ['count', 'Stock count', ''],
  ['req', 'Request money', 'Ask for fund top-up'],
  ['att', 'My attendance', ''],
]
const TITLE = Object.fromEntries(TILES.map((t) => [t[0], t[1]]))

export default function StaffApp({ session, empId }) {
  const [tab, setTab] = useState('home')
  const [emp, setEmp] = useState(null)
  const [exps, setExps] = useState([])
  const [ents, setEnts] = useState([])
  const [balance, setBalance] = useState(null)
  const [nTasks, setNTasks] = useState(0)
  const [nCount, setNCount] = useState(0)
  const [push, setPush] = useState(pushSupported() ? 'ask' : 'none')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const uid = session.user.id

  const load = useCallback(async () => {
    const [a, b, e, f, t, c] = await Promise.all([
      supabase.from('employees').select('*').eq('id', empId).limit(1),
      supabase.from('expenses').select('*').order('d', { ascending: false }).order('id', { ascending: false }),
      supabase.from('emp_entries').select('*').order('d'),
      supabase.rpc('fund_balance'),
      supabase.from('emp_tasks').select('id').eq('done', false),
      supabase.from('counts').select('id').eq('status', 'open'),
    ])
    const bad = [a, b, e].find((x) => x.error)
    if (bad) return setErr(bad.error.message)
    setErr(''); setEmp(a.data[0] || null); setExps(b.data); setEnts(e.data)
    if (!f.error) setBalance(f.data == null ? null : Number(f.data))
    if (!t.error) setNTasks(t.data.length)
    if (!c.error) setNCount(c.data.length)
  }, [empId])
  useEffect(() => { load() }, [load])
  useEffect(() => { pushOn().then((on) => on && setPush('on')) }, [])
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
  const turnOn = async () => { const r = await enablePush('staff', empId); if (r === true) setPush('on'); else showMsg(r) }
  const badge = { tasks: nTasks, count: nCount }

  if (!emp && !err) return <p className="muted pad">Loading...</p>
  return (
    <div className="app">
      <header className="top">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Mark size={38} id="staff" /><div><div className="muted small">{SHOP}</div><h1 className="h1" style={{ fontSize: 20 }}>{emp ? emp.name : APP}</h1></div></div>
        <button className="ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {err && <p className="error pad">{err}</p>}
      {ok && <p className="pad" style={{ color: 'var(--good)', fontWeight: 600 }}>{ok}</p>}
      {emp && tab === 'home' && (
        <>
          <div className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
            <span>Shop fund balance</span><b style={{ fontSize: 22, color: balance != null && balance < 0 ? 'var(--bad)' : undefined }}>{balance == null ? '...' : rs(balance)}</b>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TILES.map(([k, l, s]) => (
              <button key={k} className="chartcard" style={{ textAlign: 'left', border: 0, display: 'grid', gap: 3, minHeight: 74 }} onClick={() => setTab(k)}>
                <b>{l}{badge[k] > 0 ? <span style={{ background: 'var(--bad)', color: '#fff', borderRadius: 10, padding: '0 7px', marginLeft: 6, fontSize: 12 }}>{badge[k]}</span> : ''}</b>
                <span className="muted small">{k === 'tasks' ? (nTasks ? nTasks + ' to do' : 'Nothing pending') : k === 'count' ? (nCount ? nCount + ' count sheet(s)' : 'None right now') : k === 'att' ? 'Present, leave, balance' : s}</span>
              </button>))}
          </div>
          {push === 'ask' && <button className="ghost" style={{ marginTop: 12 }} onClick={turnOn}>Turn on notifications</button>}
          {push === 'on' && <p className="muted small" style={{ marginTop: 12 }}>Notifications are on for this phone.</p>}
        </>)}
      {emp && tab !== 'home' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px' }}><button className="ghost sm" onClick={() => { setTab('home'); load() }}>Back</button><h2 className="h2" style={{ margin: 0 }}>{TITLE[tab]}</h2></div>
          {tab === 'exp' && (
            <>
              <AddExpense emp={emp} uid={uid} balance={balance} onSaved={saved} />
              <h2 className="h2" style={{ marginTop: 14 }}>My entries, {ymName(ym)}</h2>
              <Recent rows={monthRows} reload={load} />
            </>)}
          {tab === 'tasks' && <Tasks onChange={setNTasks} />}
          {tab === 'tag' && <TagBill />}
          {tab === 'report' && <Report emp={emp} />}
          {tab === 'ret' && <ReturnNote emp={emp} />}
          {tab === 'count' && <CountSheets onChange={load} />}
          {tab === 'req' && <RequestMoney emp={emp} balance={balance} />}
          {tab === 'att' && <Attendance emp={emp} entries={ents} />}
        </>)}
    </div>
  )
}
