import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs } from './util'
import ExportBar from './Export'
import MonthPick, { curYm, ymName } from './MonthPick'
import { askConfirm } from './dialog'

// Shop expenses (rent, electricity, fuel...). Saved only in this app, not connected to Profit Maker.
const DEFAULT_CATS = ['Rent', 'Electricity', 'Fuel / transport', 'Tea / food', 'Packing', 'Repairs', 'Phone / internet', 'Fees / licence', 'Stationery', 'Other']
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const span = (ym) => { const y = Math.floor(ym / 100), m = ym % 100; return { from: y + '-' + String(m).padStart(2, '0') + '-01', to: y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0') } }
const dm = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const money = (v) => Math.round((Number(v) || 0) * 100) / 100

export default function Expenses({ back }) {
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

  const load = useCallback(async () => {
    const s = span(ym)
    const { data, error } = await supabase.from('expenses').select('*').gte('d', s.from).lte('d', s.to).order('d', { ascending: false }).order('id', { ascending: false })
    if (error) { setErr(error.message + ' (run migration-11.sql in Supabase)'); setRows([]); return }
    setErr(''); setRows(data)
  }, [ym])
  useEffect(() => { setRows(null); load() }, [load])
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
  const shown = (rows || []).filter((r) => !filter || r.category === filter)

  const openForm = () => { const s = span(ym), t = iso(new Date()); setD(t >= s.from && t <= s.to ? t : s.to); setCat(''); setAmt(''); setNote(''); setErr(''); setForm(true) }
  const save = async () => {
    const category = cat.trim(), amount = Number(amt)
    if (!category) return setErr('Choose or type a category.')
    if (!(amount > 0)) return setErr('Enter the amount.')
    const { error } = await supabase.from('expenses').insert({ d, category, amount, note: note || null })
    if (error) return setErr('Could not save: ' + error.message)
    setForm(false); load()
  }
  const del = async (r) => { if (await askConfirm('Delete ' + r.category + ' ' + rs(r.amount) + '?')) { await supabase.from('expenses').delete().eq('id', r.id); load() } }

  const build = () => {
    const list = [...shown].sort((a, b) => a.d.localeCompare(b.d))
    const out = list.map((r) => [dm(r.d), r.category, r.note || '', money(r.amount)])
    const bold = [out.length]
    out.push(['', 'TOTAL', '', money(list.reduce((s, r) => s + Number(r.amount), 0))])
    if (!filter) { out.push(['', '', '', '']); byCat.forEach(([c, v]) => out.push(['', c, 'category total', money(v)])) }
    return { title: 'Shop expenses: ' + ymName(ym) + (filter ? ' | ' + filter : ''), subtitle: list.length + ' entries', filename: 'expenses-' + ym, columns: ['Date', 'Category', 'Note', 'Amount'], rows: out, bold, numCols: [3] }
  }
  const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }

  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Expenses</h1></div>
        <button className="ghost sm" onClick={openForm}>+ Add</button></header>
      <MonthPick ym={ym} onChange={setYm} />
      {form && (
        <div className="chartcard" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{cats.map((c) => <button key={c} className={'qc' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
          <input {...inp} placeholder="Category (tap one above or type a new one)" value={cat} onChange={(e) => setCat(e.target.value)} />
          <input {...inp} type="number" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <input {...inp} type="date" value={d} onChange={(e) => setD(e.target.value)} />
          <input {...inp} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
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
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
          {shown.map((r) => (
            <div key={r.id} className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span><b>{dm(r.d)}</b> {r.category}{r.note ? <span className="muted small"> | {r.note}</span> : ''}</span>
              <span><b>{rs(r.amount)}</b> <button className="ghost sm" onClick={() => del(r)}>x</button></span>
            </div>))}
        </>)}
      <p className="muted small" style={{ marginTop: 14 }}>Expenses are saved only in this app. Staff salaries are in Staff and are added to expenses on the CA &amp; GST tab to show your real profit.</p>
    </div>
  )
}
