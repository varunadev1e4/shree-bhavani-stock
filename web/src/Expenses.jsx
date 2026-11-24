import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs, fetchPaged } from './util'
import ExportBar from './Export'
import MonthPick, { curYm, ymName } from './MonthPick'
import { askConfirm, askPrompt, showMsg } from './dialog'
import { flagged, billUrl } from './expcommon'

// Shop expenses (rent, electricity, fuel...). Saved only in this app, not connected to Profit Maker.
const DEFAULT_CATS = ['Rent', 'Electricity', 'Fuel / transport', 'Tea / food', 'Packing', 'Repairs', 'Phone / internet', 'Fees / licence', 'Stationery', 'Other']
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const span = (ym) => { const y = Math.floor(ym / 100), m = ym % 100; return { from: y + '-' + String(m).padStart(2, '0') + '-01', to: y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0') } }
const dm = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const money = (v) => Math.round((Number(v) || 0) * 100) / 100

export default function Expenses({ back, go }) {
  const [ym, setYm] = useState(curYm())
  const [rows, setRows] = useState(null)
  const [cats, setCats] = useState(DEFAULT_CATS)
  const [form, setForm] = useState(false)
  const [d, setD] = useState(iso(new Date()))
  const [cat, setCat] = useState('')
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('')
  const [emps, setEmps] = useState([])
  const [fund, setFund] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [tops, setTops] = useState([])
  const [by, setBy] = useState('')
  const [who, setWho] = useState('')

  const load = useCallback(async () => {
    const s = span(ym)
    const { data, error } = await supabase.from('expenses').select('*').gte('d', s.from).lte('d', s.to).order('d', { ascending: false }).order('id', { ascending: false })
    if (error) { setErr(error.message + ' (run migration-11.sql in Supabase)'); setRows([]); return }
    setErr(''); setRows(data)
  }, [ym])
  useEffect(() => { setRows(null); load() }, [load])
  useEffect(() => {
    supabase.from('employees').select('id,name,active').order('name').then(({ data }) => data && setEmps(data))
  }, [])
  const loadFund = useCallback(async () => {
    const [b, t] = await Promise.all([supabase.rpc('fund_balance'), supabase.from('shop_fund').select('*').order('d', { ascending: false }).order('id', { ascending: false }).limit(20)])
    if (!b.error) setFund(b.data == null ? null : Number(b.data))
    if (!t.error) setTops(t.data)
  }, [])
  useEffect(() => { loadFund() }, [loadFund, rows])
  const topUp = async () => {
    const v = await askPrompt('Money added to the shop fund (Rs)', '')
    const amount = Number(v)
    if (!(amount > 0)) return
    const { error } = await supabase.from('shop_fund').insert({ d: iso(new Date()), amount })
    if (error) return showMsg('Could not save: ' + error.message + ' (run migration-24.sql in Supabase)')
    loadFund()
  }
  const openLedger = async () => {
    if (ledger) return setLedger(null)
    const [a, b] = await Promise.all([fetchPaged('shop_fund', '*').then((data) => ({ data: data.sort((x, y) => String(x.d).localeCompare(String(y.d)) || x.id - y.id) })).catch((error) => ({ error })), fetchPaged('expenses', '*', (q) => q.not('emp_id', 'is', null)).then((data) => ({ data: data.sort((x, y) => String(x.d).localeCompare(String(y.d)) || x.id - y.id) })).catch((error) => ({ error }))])
    if (a.error || b.error) return showMsg((a.error || b.error).message)
    const start = a.data.length ? a.data[0].d : '9999'
    const ev = [...a.data.map((t) => ({ d: t.d, id: 'f' + t.id, t: 'in', label: 'Money added', note: t.note || '', amt: Number(t.amount) })),
      ...b.data.filter((x) => x.d >= start).map((x) => ({ d: x.d, id: 'e' + x.id, t: 'out', label: x.category, note: [name(x.emp_id), x.note].filter(Boolean).join(' | '), amt: -Number(x.amount) }))]
      .sort((p, q) => p.d.localeCompare(q.d) || String(p.id).localeCompare(String(q.id)))
    let bal = 0; ev.forEach((e) => { bal += e.amt; e.bal = bal })
    setLedger(ev.reverse())
  }
  const delTop = async (t) => { if (await askConfirm('Remove the ' + rs(t.amount) + ' you added on ' + dm(t.d) + '?')) { await supabase.from('shop_fund').delete().eq('id', t.id); loadFund() } }
  // Remember categories typed earlier
  useEffect(() => {
    supabase.from('expenses').select('category').order('id', { ascending: false }).limit(300).then(({ data }) => {
      if (data) setCats([...new Set([...DEFAULT_CATS.slice(0, -1), ...data.map((x) => x.category), 'Other'])])
    })
  }, [])

  const byCat = useMemo(() => {
    const m = new Map(); (rows || []).forEach((r) => m.set(r.category, (m.get(r.category) || 0) + Number(r.amount)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])
  const total = byCat.reduce((s, [, v]) => s + v, 0)
  const name = (id) => (emps.find((e) => e.id === id) || {}).name || ''
  const byPerson = useMemo(() => {
    const m = new Map(); (rows || []).filter((r) => r.emp_id).forEach((r) => { const o = m.get(r.emp_id) || { sum: 0, last: '' }; o.sum += Number(r.amount); if (r.d > o.last) o.last = r.d; m.set(r.emp_id, o) })
    return [...m.entries()].sort((a, b) => b[1].sum - a[1].sum)
  }, [rows])
  const big = useMemo(() => flagged(rows || []), [rows])
  const shown = (rows || []).filter((r) => (!filter || r.category === filter) && (!who || String(r.emp_id || '') === who))
  const photo = async (p) => { try { window.open(await billUrl(p), '_blank') } catch (e) { showMsg('Could not open the photo: ' + e.message) } }

  const openForm = () => { const s = span(ym), t = iso(new Date()); setD(t >= s.from && t <= s.to ? t : s.to); setCat(''); setAmt(''); setNote(''); setBy(''); setErr(''); setForm(true) }
  const save = async () => {
    const category = cat.trim(), amount = Number(amt)
    if (!category) return setErr('Choose or type a category.')
    if (!(amount > 0)) return setErr('Enter the amount.')
    const { error } = await supabase.from('expenses').insert({ d, category, amount, note: note || null, ...(by ? { emp_id: Number(by) } : {}) })
    if (error) return setErr('Could not save: ' + error.message)
    setForm(false); load()
  }
  const del = async (r) => { if (await askConfirm('Delete ' + r.category + ' ' + rs(r.amount) + '?')) { await supabase.from('expenses').delete().eq('id', r.id); load() } }

  const build = () => {
    const list = [...shown].sort((a, b) => a.d.localeCompare(b.d))
    const out = list.map((r) => [dm(r.d), r.category, [name(r.emp_id), r.note].filter(Boolean).join(' | '), money(r.amount)])
    const bold = [out.length]
    out.push(['', 'TOTAL', '', money(list.reduce((s, r) => s + Number(r.amount), 0))])
    if (!filter) { out.push(['', '', '', '']); byCat.forEach(([c, v]) => out.push(['', c, 'category total', money(v)])) }
    return { title: 'Shop expenses: ' + ymName(ym) + (filter ? ' | ' + filter : '') + (who ? ' | ' + name(Number(who)) : ''), subtitle: list.length + ' entries', filename: 'expenses-' + ym, columns: ['Date', 'Category', 'Note', 'Amount'], rows: out, bold, numCols: [3] }
  }
  const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Expenses</h1></div>
        <div style={{ display: 'flex', gap: 6 }}><button className="ghost sm" onClick={openForm}>+ Add</button></div></header>
      <MonthPick ym={ym} onChange={setYm} />
      <div className="chartcard" style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Shop fund (employees spend from this)<br /><span className="muted small">Every expense an employee logs is deducted</span></span>
          <b style={{ fontSize: 20, color: fund != null && fund < 0 ? 'var(--bad)' : undefined }}>{fund == null ? '-' : rs(fund)}</b>
        </div>
        <div style={{ display: 'flex', gap: 6 }}><button className="ghost sm" onClick={topUp}>+ Add money to fund</button><button className="ghost sm" onClick={openLedger}>{ledger ? 'Hide history' : 'Fund history'}</button></div>
        {ledger && (
          <div style={{ display: 'grid', gap: 5, marginTop: 4 }}>
            {!ledger.length && <span className="muted small">No fund entries yet.</span>}
            {ledger.slice(0, 80).map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 5 }}>
                <span><b>{dm(e.d)}</b> {e.label}{e.note ? <span className="muted small"> | {e.note}</span> : ''}</span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b style={{ color: e.amt < 0 ? 'var(--bad)' : 'var(--good)' }}>{e.amt < 0 ? '-' : '+'}{rs(Math.abs(e.amt))}</b><br /><span className="muted small">bal {rs(e.bal)}</span></span>
              </div>))}
          </div>)}
        {tops.slice(0, 3).map((t) => <div key={t.id} className="muted small" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Added {dm(t.d)}</span><span>{rs(t.amount)} <button className="ghost sm" onClick={() => delTop(t)}>x</button></span></div>)}
      </div>
      {form && (
        <div className="chartcard" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{cats.map((c) => <button key={c} className={'qc' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
          <input {...inp} placeholder="Category (tap one above or type a new one)" value={cat} onChange={(e) => setCat(e.target.value)} />
          <input {...inp} type="number" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <input {...inp} type="date" value={d} onChange={(e) => setD(e.target.value)} />
          <input {...inp} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {emps.length > 0 && <select {...inp} value={by} onChange={(e) => setBy(e.target.value)}><option value="">Spent by: shop / owner</option>{emps.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
          {err && <p className="error">{err}</p>}
          <div className="btnrow" style={{ paddingTop: 0 }}><button className="primary" style={{ flex: 1 }} onClick={save}>Save</button><button className="ghost" style={{ margin: 0 }} onClick={() => setForm(false)}>Cancel</button></div>
        </div>)}
      {!form && err && <p className="error pad">{err}</p>}
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && !err && <div className="empty"><b>No expenses in {ymName(ym)}</b><span>Tap + Add to record one.</span></div>}
      {rows && rows.length > 0 && (
        <>
          <div className="chartcard" style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17 }}><span>Total for the month</span><b>{rs(total)}</b></div>
            {byCat.map(([c, v]) => (
              <button key={c} onClick={() => setFilter(filter === c ? '' : c)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', display: 'grid', gap: 2, fontWeight: filter === c ? 700 : 400 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{c}</span><span>{rs(v)} <span className="muted small">{Math.round((v / total) * 100)}%</span></span></span>
                <i style={{ display: 'block', height: 5, borderRadius: 3, background: 'var(--accent)', width: Math.max(2, (v / byCat[0][1]) * 100) + '%', opacity: filter && filter !== c ? 0.3 : 1 }} />
              </button>))}
            {filter && <span className="muted small">Showing only {filter}. Tap it again to show all.</span>}
          </div>
          {byPerson.length > 0 && (
            <div className="chartcard" style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              <b>Entered by staff</b>
              {byPerson.map(([id, o]) => (
                <button key={id} onClick={() => setWho(who === String(id) ? '' : String(id))} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', display: 'flex', justifyContent: 'space-between', fontWeight: who === String(id) ? 700 : 400 }}>
                  <span>{name(id) || 'Employee'} <span className="muted small">last entry {dm(o.last)}</span></span><span>{rs(o.sum)}</span>
                </button>))}
              {who && <span className="muted small">Showing only {name(Number(who))}. Tap the name again to show all.</span>}
            </div>)}
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
          {shown.map((r) => (
            <div key={r.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span><b>{dm(r.d)}</b> {r.category}{r.emp_id ? <span className="muted small"> | {name(r.emp_id)}</span> : ''}{r.note ? <span className="muted small"> | {r.note}</span> : ''}{big.has(r.id) ? <span style={{ color: 'var(--warn)' }} title="Much larger than usual for this category"> unusually large</span> : ''}</span>
              <span><b>{rs(r.amount)}</b> {r.photo && <button className="ghost sm" onClick={() => photo(r.photo)}>Bill</button>} <button className="ghost sm" onClick={() => del(r)}>x</button></span>
            </div>))}
        </>)}
      <p className="muted small" style={{ marginTop: 14 }}>Expenses are saved only in this app. Staff salaries are in Staff and are added to expenses on the CA &amp; GST tab to show your real profit.</p>
    </div>
  )
}
