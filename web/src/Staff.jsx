import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs, num, waLink, SHOP } from './util'
import { exportPdf } from './exporter'
import MonthPick, { curYm, ymName } from './MonthPick'
import { calc, inMonth, daysIn } from './staffcalc'

// Staff: attendance exceptions, advances, salary. Saved only in this app's own tables, not connected to Profit Maker.
const KINDS = [
  ['absent', 'Absent (unpaid)', 'day'], ['half', 'Half day (unpaid)', 'day'], ['paidleave', 'Paid leave', 'day'],
  ['advance', 'Advance given', 'money'], ['recovery', 'Advance cut from salary', 'money'], ['salary', 'Salary paid', 'money'],
  ['bonus', 'Bonus / incentive', 'money'], ['deduction', 'Other deduction', 'money'],
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
      <div className="btnrow" style={{ paddingTop: 0 }}>
        <button className="primary" style={{ flex: 1 }} onClick={() => f.name.trim() && onSave({ ...f, name: f.name.trim(), salary: Number(f.salary) || 0, join_date: f.join_date || null })}>Save</button>
        <button className="ghost" style={{ margin: 0 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function Detail({ emp, all, ym, setYm, reload, back, edit }) {
  const c = useMemo(() => calc(emp, all, ym), [emp, all, ym])
  const [kind, setKind] = useState(null)
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
  const del = async (e) => { if (window.confirm('Delete this entry?')) { await supabase.from('emp_entries').delete().eq('id', e.id); reload() } }

  const slipRows = () => [
    ['Basic salary (' + c.days + ' days)', c.salary], ['Unpaid leave: ' + c.unpaid + ' day(s)', -c.cut], ['Bonus / incentive', c.bonus], ['Other deductions', -c.other],
    ['Net salary', c.net], ['Advance cut from salary', -c.recovered], ['Salary paid', -c.paid], ['Balance to pay', c.balance], ['Advance still to recover (all time)', c.advance],
  ]
  const slip = () => exportPdf({ title: 'Salary slip: ' + emp.name + ' | ' + ymName(ym), subtitle: SHOP + (emp.role ? ' | ' + emp.role : ''), filename: 'salary-' + emp.name.replace(/\W+/g, '-').toLowerCase() + '-' + ym,
    columns: ['Item', 'Rupees'], numCols: [1], bold: [4, 7], rows: slipRows().map(([l, v]) => [l, v]) })
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
        {slipRows().slice(0, 8).map(([l, v], i) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: i === 4 || i === 7 ? 800 : 400, borderTop: i === 4 || i === 7 ? '1px solid var(--line)' : 0, paddingTop: i === 4 || i === 7 ? 5 : 0 }}><span>{l}</span><span>{rs(v)}</span></div>))}
        <div className="muted small" style={{ marginTop: 4 }}>Advance still to recover (all time): <b>{rs(c.advance)}</b>{c.paidLeave ? ' | paid leaves this month: ' + c.paidLeave : ''}</div>
        <div className="muted small">Unpaid days cut at salary / {c.days} days per day.</div>
      </div>
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

export default function Staff({ back }) {
  const [emps, setEmps] = useState(null)
  const [all, setAll] = useState([])
  const [ym, setYm] = useState(curYm())
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(null)
  const [showOld, setShowOld] = useState(false)
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from('employees').select('*').order('name'), supabase.from('emp_entries').select('*').order('d')])
    if (a.error || b.error) { setErr((a.error || b.error).message + ' (run migration-10.sql in Supabase)'); setEmps([]); return }
    setErr(''); setEmps(a.data); setAll(b.data)
  }, [])
  useEffect(() => { reload() }, [reload])

  const saveEmp = async (f) => {
    const row = { name: f.name, role: f.role || null, phone: f.phone || null, salary: f.salary, join_date: f.join_date, active: f.active !== false }
    const { error } = f.id ? await supabase.from('employees').update(row).eq('id', f.id) : await supabase.from('employees').insert(row)
    if (error) return alert('Could not save: ' + error.message)
    setForm(null); reload()
  }
  const removeEmp = async (f) => {
    if (!window.confirm('Delete ' + f.name + ' and all their entries? Use "Not working now" instead to keep the history.')) return
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
  if (cur) return <Detail emp={cur} all={all} ym={ym} setYm={setYm} reload={reload} back={() => setSel(null)} edit={() => setForm({ ...cur })} />

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Staff</h1></div>
        <button className="ghost sm" onClick={() => setForm({ name: '', role: '', phone: '', salary: '', join_date: '', active: true })}>+ Add</button></header>
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
      {rows.map(({ e, c }) => (
        <button key={e.id} className="chartcard" style={{ width: '100%', textAlign: 'left', border: 0, marginBottom: 8, display: 'grid', gap: 3, opacity: e.active ? 1 : 0.6 }} onClick={() => setSel(e.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{e.name}</b><b style={{ color: c.balance > 0 ? 'var(--warn)' : 'var(--good)' }}>{c.balance > 0 ? 'Due ' + rs(c.balance) : 'Settled'}</b></div>
          <span className="muted small">{e.role || 'Staff'} | salary {rs(e.salary)} | leave {num(c.unpaid)} day(s){c.advance > 0 ? ' | advance ' + rs(c.advance) : ''}</span>
        </button>))}
      {emps && emps.some((e) => !e.active) && <button className="more" onClick={() => setShowOld(!showOld)}>{showOld ? 'Hide' : 'Show'} people who left</button>}
      <p className="muted small" style={{ marginTop: 14 }}>Staff records are saved only in this app and are not connected to Profit Maker. Anyone who logs in to this app can see them.</p>
    </div>
  )
}
