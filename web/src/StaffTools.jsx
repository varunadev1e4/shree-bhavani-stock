import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { rs } from './util'
import { askConfirm, showMsg } from './dialog'
import { iso, dm } from './expcommon'

// Employee tools. Everything here is saved in the app's own tables. Employees only ever see their own entries
// (and the tasks / count sheets the owner gives them). The database enforces this, not just these screens.
const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }
const when = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const Chips = ({ list, value, onPick }) => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{list.map(([k, l]) => <button key={k} className={'qc' + (value === k ? ' on' : '')} onClick={() => onPick(k)}>{l}</button>)}</div>
const Pill = ({ s }) => <span className="muted small" style={{ color: s === 'open' || s === 'new' ? 'var(--warn)' : s === 'rejected' ? 'var(--bad)' : 'var(--good)' }}>{{ open: 'Waiting', new: 'Waiting', done: 'Done', rejected: 'Not approved' }[s] || s}</span>

// ---------- 1. Daily tasks ----------
export function Tasks({ onChange }) {
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('emp_tasks').select('*').order('due_d', { nullsFirst: false }).order('id', { ascending: false }).limit(100)
    if (error) return showMsg(error.message + ' (owner: run migration-25.sql)')
    setRows(data); onChange && onChange(data.filter((x) => !x.done).length)
  }, [onChange])
  useEffect(() => { load() }, [load])
  const mark = async (t, done) => {
    const { error } = await supabase.rpc('complete_task', { p_id: t.id, p_done: done, p_note: null })
    if (error) return showMsg('Could not save: ' + error.message)
    load()
  }
  if (!rows) return <p className="muted pad">Loading...</p>
  const open = rows.filter((x) => !x.done), done = rows.filter((x) => x.done && Date.now() - new Date(x.done_at).getTime() < 3 * 864e5)
  return (
    <>
      {!open.length && <div className="empty"><b>No tasks right now</b><span>New tasks from the owner will appear here.</span></div>}
      {open.map((t) => (
        <div key={t.id} className="chartcard" style={{ marginBottom: 8, display: 'grid', gap: 4 }}>
          <b>{t.title}</b>
          {t.details && <span className="muted small">{t.details}</span>}
          <span className="muted small">{t.due_d ? 'Due ' + dm(t.due_d) : 'No due date'}{t.due_d && t.due_d < iso(new Date()) ? ' | overdue' : ''}</span>
          <button className="primary" onClick={() => mark(t, true)}>Mark done</button>
        </div>))}
      {done.length > 0 && <h2 className="h2" style={{ marginTop: 14 }}>Done recently</h2>}
      {done.map((t) => (
        <div key={t.id} className="chartcard" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7 }}>
          <span>{t.title}</span><button className="ghost sm" onClick={() => mark(t, false)}>Undo</button>
        </div>))}
    </>)
}

// ---------- 5. Tag the bills I delivered ----------
export function TagBill() {
  const [no, setNo] = useState('')
  const [mine, setMine] = useState([])
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('bill_tags').select('*').order('id', { ascending: false }).limit(60)
    if (data) setMine(data)
  }, [])
  useEffect(() => { load() }, [load])
  const tag = async () => {
    const b = no.trim().replace(/\s+/g, '').toUpperCase().replace(/O/g, '0')
    if (!b) return showMsg('Enter the bill number.')
    setBusy(true)
    let { data, error } = await supabase.rpc('tag_bill', { p_bill: b, p_force: false })
    if (!error && data === 'unknown') {
      if (await askConfirm('Bill ' + b.toUpperCase() + ' is not in the app yet (new bills arrive within about 30 minutes). Check the number. Tag it anyway?')) ({ data, error } = await supabase.rpc('tag_bill', { p_bill: b, p_force: true }))
      else { setBusy(false); return }
    }
    setBusy(false)
    if (error) return showMsg('Could not save: ' + error.message)
    if (String(data).startsWith('taken:')) return showMsg('Bill ' + b.toUpperCase() + ' is already tagged by ' + String(data).slice(6) + '.')
    setNo(''); load()
  }
  const del = async (t) => {
    if (!await askConfirm('Remove the tag on ' + t.bill_no + '?')) return
    const { error } = await supabase.from('bill_tags').delete().eq('id', t.id)
    if (error) return showMsg('Could not remove: ' + error.message)
    load()
  }
  const today = iso(new Date())
  return (
    <>
      <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
        <b>I delivered this bill</b>
        <input {...inp} placeholder="Bill number" autoCapitalize="characters" value={no} onChange={(e) => setNo(e.target.value.toUpperCase().replace(/O/g, '0'))} onKeyDown={(e) => e.key === 'Enter' && tag()} />
        <button className="primary" disabled={busy} onClick={tag}>{busy ? 'Saving...' : 'Tag bill'}</button>
      </div>
      <h2 className="h2" style={{ marginTop: 14 }}>My deliveries ({mine.length})</h2>
      {!mine.length && <p className="muted small">No bills tagged yet.</p>}
      {mine.map((t) => (
        <div key={t.id} className="chartcard" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><b>{t.bill_no}</b> <span className="muted small">{dm(t.d)}</span></span>
          {t.d === today && <button className="ghost sm" onClick={() => del(t)}>x</button>}
        </div>))}
    </>)
}

// ---------- 2 and 3. Suggestions and problem reports ----------
const KINDS = [['low', 'Low stock'], ['new', 'New product'], ['issue', 'Shop problem']]
export function Report({ emp }) {
  const [kind, setKind] = useState('low')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const { data } = await supabase.from('staff_reports').select('*').order('id', { ascending: false }).limit(30); if (data) setRows(data) }, [])
  useEffect(() => { load() }, [load])
  const ph = { low: 'Product name that is running low', new: 'Product customers ask for', issue: 'What is the problem?' }[kind]
  const send = async () => {
    if (!title.trim()) return showMsg('Please write ' + (kind === 'issue' ? 'the problem' : 'the product name') + '.')
    setBusy(true)
    const { error } = await supabase.from('staff_reports').insert({ emp_id: emp.id, kind, title: title.trim(), details: details.trim() || null })
    setBusy(false)
    if (error) return showMsg('Could not send: ' + error.message)
    setTitle(''); setDetails(''); load(); showMsg('Sent to the owner.')
  }
  return (
    <>
      <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
        <Chips list={KINDS} value={kind} onPick={setKind} />
        <input {...inp} placeholder={ph} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input {...inp} placeholder="More details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
        <button className="primary" disabled={busy} onClick={send}>{busy ? 'Sending...' : 'Send to owner'}</button>
      </div>
      <h2 className="h2" style={{ marginTop: 14 }}>My reports</h2>
      {!rows.length && <p className="muted small">Nothing sent yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 6, display: 'grid', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><b>{r.title}</b> <span className="muted small">{KINDS.find((k) => k[0] === r.kind)[1]} | {when(r.created_at)}</span></span><Pill s={r.status} /></div>
          {r.details && <span className="muted small">{r.details}</span>}
          {r.owner_note && <span className="small">Owner: {r.owner_note}</span>}
        </div>))}
    </>)
}

// ---------- 6. Sales return notes ----------
const WHY = [['Expired', 'Expired'], ['Near expiry', 'Near expiry'], ['Damaged', 'Damaged'], ['Wrong item', 'Wrong item'], ['Other', 'Other']]
export function ReturnNote({ emp }) {
  const blank = { shop_name: '', product: '', batch: '', qty: '', exp: '', reason: '', note: '' }
  const [f, setF] = useState(blank)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF({ ...f, [k]: v })
  const load = useCallback(async () => { const { data } = await supabase.from('field_returns').select('*').order('id', { ascending: false }).limit(30); if (data) setRows(data) }, [])
  useEffect(() => { load() }, [load])
  const send = async () => {
    if (!f.shop_name.trim()) return showMsg('Enter the shop name.')
    if (!f.product.trim()) return showMsg('Enter the product name.')
    if (!(Number(f.qty) > 0)) return showMsg('Enter the quantity.')
    const exp = f.exp.trim()
    if (exp && !/^(0?[1-9]|1[0-2])\s*[/-]\s*(\d{2}|\d{4})$/.test(exp)) return showMsg('Write the expiry like 08/27 (month/year).')
    setBusy(true)
    const { error } = await supabase.from('field_returns').insert({ emp_id: emp.id, shop_name: f.shop_name.trim(), product: f.product.trim(), batch: f.batch.trim() || null, qty: Number(f.qty), exp: exp || null, reason: f.reason || null, note: f.note.trim() || null })
    setBusy(false)
    if (error) return showMsg('Could not send: ' + error.message)
    setF({ ...blank, shop_name: f.shop_name }); load(); showMsg('Return note sent to the owner.')
  }
  return (
    <>
      <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
        <input {...inp} placeholder="Shop name" value={f.shop_name} onChange={(e) => set('shop_name', e.target.value)} />
        <input {...inp} placeholder="Product name" value={f.product} onChange={(e) => set('product', e.target.value)} />
        <input {...inp} placeholder="Batch number" autoCapitalize="characters" value={f.batch} onChange={(e) => set('batch', e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input {...inp} type="number" inputMode="decimal" placeholder="Quantity" value={f.qty} onChange={(e) => set('qty', e.target.value)} />
          <input {...inp} placeholder="Expiry MM/YY" inputMode="numeric" value={f.exp} onChange={(e) => set('exp', e.target.value)} />
        </div>
        <Chips list={WHY} value={f.reason} onPick={(k) => set('reason', f.reason === k ? '' : k)} />
        <input {...inp} placeholder="Note (optional)" value={f.note} onChange={(e) => set('note', e.target.value)} />
        <button className="primary" disabled={busy} onClick={send}>{busy ? 'Sending...' : 'Send return note'}</button>
        <span className="muted small">This is only a note for the owner. It does not change any bill or stock.</span>
      </div>
      <h2 className="h2" style={{ marginTop: 14 }}>My return notes</h2>
      {!rows.length && <p className="muted small">Nothing sent yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 6, display: 'grid', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><b>{r.product}</b> x {Number(r.qty)}</span><Pill s={r.status} /></div>
          <span className="muted small">{r.shop_name} | batch {r.batch || '-'} | exp {r.exp || '-'} | {when(r.created_at)}{r.reason ? ' | ' + r.reason : ''}</span>
          {r.owner_note && <span className="small">Owner: {r.owner_note}</span>}
        </div>))}
    </>)
}

// ---------- 7. Ask for money for the shop fund ----------
export function RequestMoney({ emp, balance }) {
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState([])
  const load = useCallback(async () => { const { data } = await supabase.from('fund_requests').select('*').order('id', { ascending: false }).limit(20); if (data) setRows(data) }, [])
  useEffect(() => { load() }, [load])
  const send = async () => {
    if (!(Number(amt) > 0)) return showMsg('Enter the amount you need.')
    const { error } = await supabase.from('fund_requests').insert({ emp_id: emp.id, amount: Number(amt), note: note.trim() || null })
    if (error) return showMsg('Could not send: ' + error.message)
    setAmt(''); setNote(''); load(); showMsg('Request sent to the owner.')
  }
  return (
    <>
      <div className="chartcard" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shop fund balance now</span><b style={{ color: balance != null && balance < 0 ? 'var(--bad)' : undefined }}>{balance == null ? '-' : rs(balance)}</b></div>
        <input {...inp} type="number" inputMode="decimal" placeholder="Amount needed" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <input {...inp} placeholder="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="primary" onClick={send}>Request money</button>
      </div>
      <h2 className="h2" style={{ marginTop: 14 }}>My requests</h2>
      {!rows.length && <p className="muted small">No requests yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span><b>{rs(r.amount)}</b> <span className="muted small">{when(r.created_at)}{r.note ? ' | ' + r.note : ''}</span></span><Pill s={r.status} />
        </div>))}
    </>)
}

// ---------- 4. Blind stock count ----------
function CountLines({ count, back, onChange }) {
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(0)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('count_items').select('*').eq('count_id', count.id).order('product').order('id').limit(1000)
    if (error) return showMsg(error.message)
    setItems(data); onChange && onChange()
  }, [count.id, onChange])
  useEffect(() => { load() }, [load])
  const save = async (it) => {
    const v = vals[it.id] !== undefined ? vals[it.id] : it.counted_qty
    if (v === '' || v == null || Number(v) < 0) return showMsg('Enter the quantity you counted. Write 0 if there is none.')
    setBusy(it.id)
    const { error } = await supabase.rpc('submit_count', { p_item: it.id, p_qty: Number(v), p_note: null })
    setBusy(0)
    if (error) return showMsg('Could not save: ' + error.message)
    setVals((x) => { const n = { ...x }; delete n[it.id]; return n }); load()
  }
  const list = useMemo(() => (items || []).filter((i) => !q || (i.product + ' ' + (i.batch || '')).toLowerCase().includes(q.toLowerCase())), [items, q])
  const done = (items || []).filter((i) => i.counted_qty != null).length
  return (
    <>
      <button className="ghost sm" onClick={back}>Back to count sheets</button>
      <h2 className="h2" style={{ marginTop: 8 }}>{count.title}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Count what is on the shelf and enter it. Counted {done} of {(items || []).length}.</p>
      <input {...inp} placeholder="Search product or batch" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp.style, marginBottom: 10 }} />
      {!items && <p className="muted pad">Loading...</p>}
      {list.map((i) => (
        <div key={i.id} className="chartcard" style={{ marginBottom: 8, display: 'grid', gap: 6, borderLeft: i.counted_qty != null ? '4px solid var(--good)' : undefined }}>
          <div><b>{i.product}</b> <span className="muted small">{i.pack || ''}</span><br /><span className="muted small">Batch {i.batch || '-'} | Exp {i.exp || '-'}{i.rack ? ' | Rack ' + i.rack : ''}</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input {...inp} type="number" inputMode="decimal" placeholder="Counted quantity" value={vals[i.id] !== undefined ? vals[i.id] : i.counted_qty ?? ''} onChange={(e) => setVals({ ...vals, [i.id]: e.target.value })} />
            <button className="primary" disabled={busy === i.id} style={{ margin: 0, whiteSpace: 'nowrap' }} onClick={() => save(i)}>{i.counted_qty != null && vals[i.id] === undefined ? 'Saved' : 'Save'}</button>
          </div>
        </div>))}
    </>)
}
export function CountSheets({ onChange }) {
  const [sheets, setSheets] = useState(null)
  const [cur, setCur] = useState(null)
  useEffect(() => { supabase.from('counts').select('*').eq('status', 'open').order('id', { ascending: false }).then(({ data, error }) => { if (error) showMsg(error.message + ' (owner: run migration-25.sql)'); setSheets(data || []) }) }, [])
  if (cur) return <CountLines count={cur} back={() => setCur(null)} onChange={onChange} />
  if (!sheets) return <p className="muted pad">Loading...</p>
  if (!sheets.length) return <div className="empty"><b>No stock count to do</b><span>When the owner starts a count, it will appear here.</span></div>
  return sheets.map((c) => (
    <button key={c.id} className="chartcard" style={{ width: '100%', textAlign: 'left', border: 0, marginBottom: 8 }} onClick={() => setCur(c)}>
      <b>{c.title}</b><br /><span className="muted small">Started {when(c.created_at)} | tap to count</span>
    </button>))
}