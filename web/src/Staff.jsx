import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBackLayer } from './backstack'
import { supabase } from './supabase'
import { rs, num, waLink, SHOP, fetchPaged } from './util'
import { exportPdf } from './exporter'
import MonthPick, { curYm, ymName } from './MonthPick'
import { calc, inMonth, daysIn, leaveBalance } from './staffcalc'
import { askConfirm, showMsg } from './dialog'
import AttCalendar, { setAttendance } from './AttCalendar'

// Staff: attendance exceptions, advances, salary. Saved only in this app's own tables, not connected to Profit Maker.
const KINDS = [
  ['absent', 'Absent (unpaid)', 'day'], ['half', 'Half day (unpaid)', 'day'], ['paidleave', 'Paid leave', 'day'],
  ['advance', 'Advance given', 'money'], ['recovery', 'Advance cut from salary', 'money'], ['salary', 'Salary paid', 'money'],
  ['bonus', 'Bonus / incentive', 'money'], ['overtime', 'Overtime', 'money'], ['deduction', 'Other deduction', 'money'],
]
const LABEL = Object.fromEntries(KINDS.map(([k, l]) => [k, l]))
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const dm = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function EmpForm({ init, onSave, onCancel }) {
  const [f, setF] = useState(init)
  const set = (k, v) => setF({ ...f, [k]: v })
  const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }
  return (
    <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
      <input {...inp} placeholder="Name" value={f.name} onChange={(e) => set('name', e.target.value)} />
      <input {...inp} placeholder="Role (e.g. delivery, billing)" value={f.role || ''} onChange={(e) => set('role', e.target.value)} />
      <input {...inp} type="tel" placeholder="Phone" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} />
      <label className="muted small">Monthly salary<input {...inp} type="number" inputMode="decimal" value={f.salary} onChange={(e) => set('salary', e.target.value)} /></label>
      <label className="muted small">Joining date<input {...inp} type="date" value={f.join_date || ''} onChange={(e) => set('join_date', e.target.value)} /></label>
      <label className="muted small">Advance cut from salary every month (0 = I will enter it myself)<input {...inp} type="number" inputMode="decimal" value={f.adv_cut || ''} onChange={(e) => set('adv_cut', e.target.value)} /></label>
      {Number(f.adv_cut) > 0 && <label className="muted small">Automatic cut starts from<input {...inp} type="date" value={f.adv_cut_from || ''} onChange={(e) => set('adv_cut_from', e.target.value)} /></label>}
      <label className="muted small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!f.no_attendance} onChange={(e) => set('no_attendance', e.target.checked)} />Owner / partner: no attendance, no salary cut for leave</label>
      <label className="muted small">Paid leaves allowed per year (0 = do not track)<input {...inp} type="number" inputMode="decimal" value={f.leave_quota || ''} onChange={(e) => set('leave_quota', e.target.value)} /></label>
      <label className="muted small">Last working day (only if leaving; salary stops after it)<input {...inp} type="date" value={f.leave_date || ''} onChange={(e) => set('leave_date', e.target.value)} /></label>
      <label className="muted small">Login email for this employee (optional). First add the same email in Supabase &gt; Authentication &gt; Users &gt; Add user. The employee can then only add expenses and see own attendance.<input {...inp} type="email" placeholder="employee@example.com" value={f.login || ''} onChange={(e) => set('login', e.target.value)} /></label>
      <div className="btnrow" style={{ paddingTop: 0 }}>
        <button className="primary" style={{ flex: 1 }} onClick={() => f.name.trim() && onSave({ ...f, name: f.name.trim(), salary: Number(f.salary) || 0, join_date: f.join_date || null, adv_cut: Number(f.adv_cut) || 0, adv_cut_from: f.adv_cut_from || (Number(f.adv_cut) > 0 ? iso(new Date()).slice(0, 8) + '01' : null), leave_quota: Number(f.leave_quota) || 0, leave_date: f.leave_date || null, login: (f.login || '').trim().toLowerCase() })}>Save</button>
        <button className="ghost" style={{ margin: 0 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function Detail({ emp, all, ym, setYm, reload, back, edit }) {
  const c = useMemo(() => calc(emp, all, ym), [emp, all, ym])
  const lb = useMemo(() => leaveBalance(emp, all, ym), [emp, all, ym])

  const [kind, setKind] = useState(null)
  const [day, setDay] = useState(null)
  const [d, setD] = useState(iso(new Date()))
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const open = (k) => {
    setKind(k); setNote(''); setErr('')
    const t = iso(new Date()); setD(inMonth(t, ym) ? t : ym.toString().slice(0, 4) + '-' + String(ym % 100).padStart(2, '0') + '-' + String(daysIn(ym)).padStart(2, '0'))
    setAmt(k === 'salary' ? String(Math.max(0, c.balance)) : k === 'recovery' ? String(Math.min(Math.max(0, c.advance), Math.max(0, c.net - c.paid))) : '')
  }
  const type = kind && KINDS.find((x) => x[0] === kind)[2]
  const save = async () => {
    setErr('')
    const row = { emp_id: emp.id, d, kind, amount: type === 'day' ? (kind === 'half' ? 0.5 : 1) : Number(amt) || 0, note: note || null }
    if (type === 'money' && !(row.amount > 0)) return setErr('Enter the amount.')
    const { error } = await supabase.from('emp_entries').insert(row)
    if (error) return setErr('Could not save: ' + error.message)
    setKind(null); reload()
  }
  const del = async (e) => { if (await askConfirm('Delete this entry?')) { await supabase.from('emp_entries').delete().eq('id', e.id); reload() } }

  const slipRows = () => [
    ['Basic salary (' + c.days + ' days)', c.salary], ['Unpaid leave: ' + c.unpaid + ' day(s)', -c.cut], ['Bonus / incentive', c.bonus], ['Overtime', c.overtime], ['Other deductions', -c.other],
    ['Net salary', c.net], ['Advance cut from salary' + (c.autoCut ? ' (automatic)' : ''), -c.recovered], ['Salary paid', -c.paid], ['Balance to pay', c.balance], ['Advance still to recover', c.advance],
  ]
  const slip = () => exportPdf({ title: 'Salary slip: ' + emp.name + ' | ' + ymName(ym), subtitle: SHOP + (emp.role ? ' | ' + emp.role : ''), filename: 'salary-' + emp.name.replace(/\W+/g, '-').toLowerCase() + '-' + ym,
    columns: ['Item', 'Rupees'], numCols: [1], bold: [5, 8], rows: slipRows().map(([l, v]) => [l, v]) })
  const text = () => {
    const t = SHOP + '\nSalary ' + ymName(ym) + ' - ' + emp.name + '\n' + slipRows().map(([l, v]) => l + ': ' + Math.round(v)).join('\n')
    window.open(waLink(emp.phone || '', t), '_blank')
  }

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button>
        <h1 className="h1" style={{ marginTop: 8 }}>{emp.name}</h1><span className="muted small">{emp.role} {emp.phone ? '| ' + emp.phone : ''} | salary {rs(emp.salary)}{emp.active ? '' : ' | not working now'}</span></div>
        <button className="ghost sm" onClick={edit}>Edit</button></header>
      <MonthPick ym={ym} onChange={setYm} />
      <div className="chartcard" style={{ display: 'grid', gap: 5 }}>
        {slipRows().slice(0, 9).map(([l, v], i) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: i === 5 || i === 8 ? 800 : 400, borderTop: i === 5 || i === 8 ? '1px solid var(--line)' : 0, paddingTop: i === 5 || i === 8 ? 5 : 0, color: i === 8 && c.overpaid ? 'var(--bad)' : undefined }}><span>{l}</span><span>{rs(v)}</span></div>))}
        {c.overpaid && <div className="small" style={{ color: 'var(--bad)' }}>Paid more than the salary due by {rs(-c.balance)}. Record the advance cut next month or reduce the next payment.</div>}
        <div className="muted small" style={{ marginTop: 4 }}>Advance still to recover: <b>{rs(c.advance)}</b>{c.paidLeave ? ' | paid leaves this month: ' + c.paidLeave : ''}</div>
        {lb.quota > 0 && <div className="muted small">Paid leaves this year: used {lb.used} of {lb.quota}, {Math.max(0, lb.left)} left</div>}

        <div className="muted small">Unpaid days cut at salary / {c.days} days per day.</div>
      </div>
      {!emp.no_attendance && (
        <>
          <h2 className="h2" style={{ marginTop: 14 }}>Attendance calendar</h2>
          <AttCalendar ym={ym} entries={all.filter((e) => e.emp_id === emp.id)} onPick={setDay} picked={day} join={emp.join_date} leave={emp.leave_date} />
          {day && (
            <div className="chartcard" style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              <b>{dm(day)}</b>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['', 'Present'], ['absent', 'Absent'], ['half', 'Half day'], ['paidleave', 'Paid leave']].map(([k, l]) => (
                  <button key={l} className="qc" onClick={async () => { const er = await setAttendance(emp.id, day, k); if (er) return showMsg('Could not save: ' + er.message); setDay(null); reload() }}>{l}</button>))}
              </div>
            </div>)}
        </>)}
      <h2 className="h2" style={{ marginTop: 14 }}>Add entry</h2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{KINDS.map(([k, l]) => <button key={k} className={'qc' + (kind === k ? ' on' : '')} onClick={() => open(k)}>{l}</button>)}</div>
      {kind && (
        <div className="chartcard" style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <b>{LABEL[kind]}</b>
          <input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} type="date" value={d} onChange={(e) => setD(e.target.value)} />
          {type === 'money' && <input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} type="number" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />}
          <input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <p className="error">{err}</p>}
          <div className="btnrow" style={{ paddingTop: 0 }}><button className="primary" style={{ flex: 1 }} onClick={save}>Save</button><button className="ghost" style={{ margin: 0 }} onClick={() => setKind(null)}>Cancel</button></div>
        </div>)}
      <h2 className="h2" style={{ marginTop: 14 }}>{ymName(ym)} entries</h2>
      {!c.m.length && <p className="muted small">Nothing recorded. Everyone counts as present unless you add leave.</p>}
      {[...c.m].sort((a, b) => a.d.localeCompare(b.d)).map((e) => (
        <div key={e.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span><b>{dm(e.d)}</b> {LABEL[e.kind]}{e.note ? <span className="muted small"> | {e.note}</span> : ''}</span>
          <span>{['absent', 'half', 'paidleave'].includes(e.kind) ? '' : rs(e.amount)} <button className="ghost sm" onClick={() => del(e)}>x</button></span>
        </div>))}
      <div className="btnrow"><button className="ghost sm" onClick={slip}>Salary slip PDF</button><button className="ghost sm" onClick={text}>Send on WhatsApp</button></div>
    </div>
  )
}

export default function Staff({ back, go }) {
  const [emps, setEmps] = useState(null)
  const [all, setAll] = useState([])
  const [ym, setYm] = useState(curYm())
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(null)
  useBackLayer(!!sel, () => setSel(null))
  useBackLayer(!!form, () => setForm(null))
  const [showOld, setShowOld] = useState(false)
  const [err, setErr] = useState('')
  const [logins, setLogins] = useState({})
  const [expTot, setExpTot] = useState(null)

  const reload = useCallback(async () => {
    let a, b
    try { [a, b] = await Promise.all([supabase.from('employees').select('*').order('name'), fetchPaged('emp_entries', '*')]) } catch (e) { setErr(e.message + ' (run migration-10.sql in Supabase)'); setEmps([]); return }
    if (a.error) { setErr(a.error.message + ' (run migration-10.sql in Supabase)'); setEmps([]); return }
    setErr(''); setEmps(a.data); setAll(b.sort((x, y) => String(x.d).localeCompare(String(y.d))))
    const r = await supabase.from('app_roles').select('email,emp_id').eq('role', 'staff')
    if (!r.error) setLogins(Object.fromEntries(r.data.filter((x) => x.emp_id).map((x) => [x.emp_id, x.email])))
  }, [])
  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    const y = Math.floor(ym / 100), m = ym % 100, from = y + '-' + String(m).padStart(2, '0') + '-01', to = y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0')
    setExpTot(null)
    fetchPaged('expenses', 'amount,emp_id', (q) => q.gte('d', from).lte('d', to)).then((data) => {
      const all = data.reduce((t, x) => t + Number(x.amount), 0), staff = data.filter((x) => x.emp_id).reduce((t, x) => t + Number(x.amount), 0)
      setExpTot({ all, staff })
    }).catch(() => {})
  }, [ym])

  const saveEmp = async (f) => {
    const row = { name: f.name, role: f.role || null, phone: f.phone || null, salary: f.salary, join_date: f.join_date, active: f.active !== false,
      adv_cut: f.adv_cut || 0, adv_cut_from: f.adv_cut_from || null, no_attendance: !!f.no_attendance, leave_quota: f.leave_quota || 0, leave_date: f.leave_date || null }
    const q = f.id ? supabase.from('employees').update(row).eq('id', f.id).select('id') : supabase.from('employees').insert(row).select('id')
    const { data, error } = await q
    if (error) return showMsg('Could not save: ' + error.message + ' (run migration-23.sql in Supabase)')
    const id = f.id || (data && data[0] && data[0].id)
    // Employee login: link or unlink (never touches an owner login)
    if (id && f.login !== undefined) {
      const old = logins[id] || ''
      if (f.login !== old) {
        if (f.login) {
          const ex = await supabase.from('app_roles').select('role,emp_id').eq('email', f.login).limit(1)
          if (ex.data && ex.data[0] && ex.data[0].role === 'owner') return showMsg('That email is an owner login, so it cannot be used for an employee. The employee details were saved.')
          if (ex.data && ex.data[0] && ex.data[0].emp_id && ex.data[0].emp_id !== id) return showMsg('That email is already linked to another employee. The employee details were saved.')
          const r = await supabase.from('app_roles').upsert({ email: f.login, role: 'staff', emp_id: id }, { onConflict: 'email' })
          if (r.error) return showMsg('Details saved, but the login could not be linked: ' + r.error.message)
        }
        if (old) await supabase.from('app_roles').delete().eq('email', old).eq('role', 'staff')
      }
    }
    setForm(null); reload()
  }
  const removeEmp = async (f) => {
    if (!await askConfirm('Delete ' + f.name + ' and all their entries? Use "Not working now" instead to keep the history.')) return
    await supabase.from('employees').delete().eq('id', f.id); setForm(null); setSel(null); reload()
  }

  const list = (emps || []).filter((e) => showOld || e.active)
  const rows = list.map((e) => ({ e, c: calc(e, all, ym) }))
  const T = rows.reduce((s, r) => ({ net: s.net + r.c.net, bal: s.bal + r.c.balance, adv: s.adv + r.c.advance }), { net: 0, bal: 0, adv: 0 })

  if (form) return (
    <div className="app"><header className="top"><h1 className="h1">{form.id ? 'Edit employee' : 'New employee'}</h1></header>
      <EmpForm init={form} onSave={saveEmp} onCancel={() => setForm(null)} />
      {form.id && <div className="chartcard" style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <button className="ghost" style={{ margin: 0 }} onClick={() => saveEmp({ ...form, active: !form.active })}>{form.active ? 'Mark as not working now' : 'Mark as working again'}</button>
        <button className="ghost" style={{ margin: 0, color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={() => removeEmp(form)}>Delete employee</button></div>}
    </div>)

  const cur = sel && (emps || []).find((e) => e.id === sel)
  if (cur) return <Detail emp={cur} all={all} ym={ym} setYm={setYm} reload={reload} back={() => setSel(null)} edit={() => setForm({ ...cur, login: logins[cur.id] || '' })} />

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Staff</h1></div>
        <button className="ghost sm" onClick={() => setForm({ name: '', role: '', phone: '', salary: '', join_date: '', active: true })}>+ Add</button></header>
      {go && <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}><button className="qc on">People</button><button className="qc" onClick={() => go('att')}>Attendance</button><button className="qc" onClick={() => go('stats')}>Analytics</button></div>}
      <MonthPick ym={ym} onChange={setYm} />
      {err && <p className="error pad">{err}</p>}
      {!emps && <p className="muted pad">Loading...</p>}
      {emps && !list.length && !err && <div className="empty"><b>No employees yet</b><span>Tap + Add to create the first one.</span></div>}
      {rows.length > 0 && (
        <div className="minis" style={{ marginBottom: 10 }}>
          <div className="mini"><span>Salary bill</span><b>{rs(T.net)}</b></div>
          <div className="mini"><span>Still to pay</span><b>{rs(T.bal)}</b></div>
          <div className="mini"><span>Advances out</span><b>{rs(T.adv)}</b></div>
        </div>)}
      {expTot && go && (
        <button className="chartcard" style={{ width: '100%', textAlign: 'left', border: 0, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => go('exp')}>
          <span>Expenses {rs(expTot.all)} (staff {rs(expTot.staff)}) + salaries = <b>{rs(expTot.all + T.net)}</b></span><span className="muted small">Open</span>
        </button>)}
      {rows.map(({ e, c }) => (
        <button key={e.id} className="chartcard" style={{ width: '100%', textAlign: 'left', border: 0, marginBottom: 8, display: 'grid', gap: 3, opacity: e.active ? 1 : 0.6 }} onClick={() => setSel(e.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{e.name}</b><b style={{ color: c.balance > 0 ? 'var(--warn)' : c.overpaid ? 'var(--bad)' : 'var(--good)' }}>{c.balance > 0 ? 'Due ' + rs(c.balance) : c.overpaid ? 'Overpaid ' + rs(-c.balance) : 'Settled'}</b></div>
          <span className="muted small">{e.role || 'Staff'} | salary {rs(e.salary)} | leave {num(c.unpaid)} day(s){c.advance > 0 ? ' | advance ' + rs(c.advance) : ''}{logins[e.id] ? ' | has login' : ''}</span>
        </button>))}
      {emps && emps.some((e) => !e.active) && <button className="more" onClick={() => setShowOld(!showOld)}>{showOld ? 'Hide' : 'Show'} people who left</button>}
      <p className="muted small" style={{ marginTop: 14 }}>Staff records are saved only in this app and are not connected to Profit Maker. Owner logins can see them; an employee login sees only that employee's own expenses and attendance.</p>
    </div>
  )
}
