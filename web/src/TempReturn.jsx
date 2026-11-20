import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { fetchAll, num } from './util'
import { exportPdf } from './exporter'
import ExportBar from './Export'
import { askConfirm, askPrompt } from './dialog'

// Temporary sales returns: goods that came back but are not yet entered in Profit Maker.
// Saved only in this app's own table (temp_returns). Nothing is written to Profit Maker or its backups.
const REASONS = ['Expired', 'Near expiry', 'Damaged', 'Wrong item', 'Excess / not needed', 'Other']
const dmy = (s) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const age = (s) => Math.max(0, Math.floor((Date.now() - new Date(s)) / 864e5))
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }
const qtyOf = (r) => r.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)

async function slipPdf(r) {
  const rows = r.lines.map((l, i) => [i + 1, l.name, l.pack || '', l.batch || '', l.reason || '', l.inv || '', num(l.qty)])
  rows.push(['', 'TOTAL QTY', '', '', '', '', num(qtyOf(r))])
  await exportPdf({ title: 'SALES RETURN NOTE ' + r.ret_no + ' (to be entered in Profit Maker)', subtitle: 'From: ' + r.party_name + ' | Received: ' + dmy(r.d) + (r.note ? ' | ' + r.note : ''),
    columns: ['#', 'Product', 'Pack', 'Batch', 'Reason', 'Bill', 'Qty'], rows, bold: [rows.length - 1], numCols: [0, 6], filename: r.ret_no })
}

function NewReturn({ onSaved }) {
  const [parties, setParties] = useState([])
  const [stock, setStock] = useState([])
  const [pq, setPq] = useState('')
  const [party, setParty] = useState(null)
  const [d, setD] = useState(iso(new Date()))
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([])
  const [sq, setSq] = useState('')
  const [batches, setBatches] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    fetchAll('parties', 'id,name,city,deleted').then((p) => setParties(p.filter((x) => !x.deleted))).catch(() => {})
    fetchAll('stock_summary', 'id,name,packing,company').then(setStock).catch(() => {})
  }, [])
  const phits = useMemo(() => { const w = pq.trim().toLowerCase(); return w && !party ? parties.filter((p) => (p.name + ' ' + (p.city || '')).toLowerCase().includes(w)).slice(0, 6) : [] }, [pq, parties, party])
  const shits = useMemo(() => { const w = sq.trim().toLowerCase().split(/\s+/).filter(Boolean); return w.length ? stock.filter((s) => w.every((x) => (s.name + ' ' + (s.company || '')).toLowerCase().includes(x))).slice(0, 8) : [] }, [sq, stock])

  const add = async (s) => {
    setLines((l) => [...l, { pid: s.id, name: s.name, pack: s.packing, batch: '', qty: 1, reason: 'Expired', inv: '' }]); setSq('')
    if (!batches[s.id]) { const { data } = await supabase.from('batches').select('batch_no').eq('product_id', s.id).order('exp_year', { ascending: false }).limit(6); setBatches((b) => ({ ...b, [s.id]: (data || []).map((x) => x.batch_no) })) }
  }
  const edit = (i, k, v) => setLines((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  const save = async () => {
    setErr('')
    const name = party ? party.name : pq.trim()
    if (!name) return setErr('Choose or type the party name.')
    if (!lines.length) return setErr('Add at least one product.')
    if (lines.some((l) => !(Number(l.qty) > 0))) return setErr('Every product needs a quantity.')
    setBusy(true)
    try {
      const t = new Date(), ymd = String(t.getFullYear()).slice(2) + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0')
      const { count } = await supabase.from('temp_returns').select('id', { count: 'exact', head: true }).gte('created_at', new Date(t.getFullYear(), t.getMonth(), t.getDate()).toISOString())
      const ret_no = 'RET-' + ymd + '-' + String((count || 0) + 1).padStart(2, '0')
      const { data, error } = await supabase.from('temp_returns').insert({ ret_no, d, party_id: party ? party.id : null, party_name: name, note: note || null, lines: lines.map((l) => ({ ...l, qty: Number(l.qty) || 0, batch: l.batch.trim() })), status: 'pending' }).select().single()
      if (error) throw error
      await slipPdf(data).catch(() => {})
      onSaved()
    } catch (e) { setErr('Could not save: ' + e.message + ' (run migration-14.sql in Supabase)') }
    setBusy(false)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        {party
          ? <div className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}><b>{party.name} <span className="muted small">{party.city}</span></b><button className="ghost sm" onClick={() => { setParty(null); setPq('') }}>Change</button></div>
          : <input {...inp} type="search" placeholder="Returned by (search party or type a name)..." value={pq} onChange={(e) => setPq(e.target.value)} />}
        {phits.map((p) => <button key={p.id} className="more" style={{ marginTop: 6, textAlign: 'left', color: 'inherit', borderStyle: 'solid' }} onClick={() => setParty(p)}><b>{p.name}</b> <span className="muted small">{p.city}</span></button>)}
      </div>
      <label className="muted small">Date goods came back<input {...inp} type="date" value={d} max={iso(new Date())} onChange={(e) => setD(e.target.value)} /></label>
      <div>
        <input {...inp} type="search" placeholder="Search product to add..." value={sq} onChange={(e) => setSq(e.target.value)} />
        {shits.map((s) => <button key={s.id} className="more" style={{ marginTop: 6, textAlign: 'left', color: 'inherit', borderStyle: 'solid' }} onClick={() => add(s)}><b>{s.name}</b> <span className="muted small">{s.packing} {s.company ? '| ' + s.company : ''}</span></button>)}
      </div>
      {lines.map((l, i) => (
        <div key={i} className="chartcard" style={{ display: 'grid', gap: 6, margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{l.name} <span className="muted small">{l.pack}</span></b><button className="ghost sm" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>Remove</button></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input {...inp} placeholder="Batch no." value={l.batch} onChange={(e) => edit(i, 'batch', e.target.value)} />
            <input {...inp} type="number" inputMode="numeric" placeholder="Qty" value={l.qty} onChange={(e) => edit(i, 'qty', e.target.value)} />
          </div>
          {(batches[l.pid] || []).length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{batches[l.pid].map((b) => <button key={b} className={'qc' + (l.batch === b ? ' on' : '')} onClick={() => edit(i, 'batch', b)}>{b}</button>)}</div>}
          <select {...inp} value={l.reason} onChange={(e) => edit(i, 'reason', e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <input {...inp} placeholder="Original bill no. (optional)" value={l.inv} onChange={(e) => edit(i, 'inv', e.target.value)} />
        </div>))}
      <input {...inp} placeholder="Note (optional, e.g. to be checked by Ravi)" value={note} onChange={(e) => setNote(e.target.value)} />
      {lines.length > 0 && <p className="muted small" style={{ margin: 0 }}>{lines.length} item{lines.length > 1 ? 's' : ''} | total qty {num(lines.reduce((x, l) => x + (Number(l.qty) || 0), 0))}</p>}
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save and share PDF'}</button>
    </div>
  )
}

function Pending({ refreshKey }) {
  const [rows, setRows] = useState(null)
  const [show, setShow] = useState('pending')
  const [n, setN] = useState(0)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.from('temp_returns').select('*').eq('status', show).order('d', { ascending: show === 'pending' }).limit(150)
      .then(({ data, error }) => { if (error) setErr(error.message + ' (run migration-14.sql in Supabase)'); setRows(data || []) })
  }, [show, refreshKey, n])
  const done = async (r) => {
    const pm = await askPrompt('Profit Maker sales return number (optional):', '')
    if (pm === null) return
    await supabase.from('temp_returns').update({ status: 'entered', pm_ref: pm || null, entered_at: new Date().toISOString() }).eq('id', r.id); setN(n + 1)
  }
  const undo = async (r) => { await supabase.from('temp_returns').update({ status: 'pending', pm_ref: null, entered_at: null }).eq('id', r.id); setN(n + 1) }
  const del = async (r) => { if (await askConfirm('Delete ' + r.ret_no + '?')) { await supabase.from('temp_returns').delete().eq('id', r.id); setN(n + 1) } }
  // One checklist of everything still to be typed into Profit Maker
  const build = () => {
    const out = [], bold = []
    ;(rows || []).forEach((r) => r.lines.forEach((l) => out.push([r.ret_no, dmy(r.d), r.party_name, l.name, l.pack || '', l.batch || '', l.reason || '', num(l.qty)])))
    bold.push(out.length); out.push(['TOTAL', '', '', '', '', '', '', num((rows || []).reduce((s, r) => s + qtyOf(r), 0))])
    return { title: 'Sales returns to enter in Profit Maker', subtitle: (rows || []).length + ' return notes', filename: 'pending-returns', columns: ['Note', 'Received', 'Party', 'Product', 'Pack', 'Batch', 'Reason', 'Qty'], rows: out, bold, numCols: [7] }
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="seg" style={{ width: 'fit-content' }}>{[['pending', 'To enter'], ['entered', 'Entered']].map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => { setRows(null); setShow(k) }}>{l}</button>)}</div>
      {err && <p className="error">{err}</p>}
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && !err && <div className="empty"><b>Nothing here</b><span>{show === 'pending' ? 'All returns are entered in Profit Maker.' : 'No entered returns yet.'}</span></div>}
      {rows && rows.length > 0 && show === 'pending' && <ExportBar build={build} />}
      {(rows || []).map((r) => { const a = age(r.d), late = show === 'pending' && a >= 3; return (
        <div key={r.id} className="chartcard" style={{ display: 'grid', gap: 6, margin: 0, borderLeft: late ? '4px solid var(--bad)' : undefined }}>
          <b>{r.party_name}</b>
          <span className="muted small">{r.ret_no} | received {dmy(r.d)}{show === 'pending' ? ' | ' + (a === 0 ? 'today' : a + ' day' + (a > 1 ? 's' : '') + ' ago') : ''} | qty {num(qtyOf(r))}{r.pm_ref ? ' | entered as ' + r.pm_ref : ''}{r.note ? ' | ' + r.note : ''}</span>
          {r.lines.map((l, i) => <span key={i} className="small">{l.name} <span className="muted">{l.pack} | batch {l.batch || '-'} | {l.reason} | </span><b>{num(l.qty)}</b></span>)}
          <div className="btnrow" style={{ paddingTop: 0 }}>
            <button className="ghost sm" onClick={() => slipPdf(r)}>PDF</button>
            {show === 'pending' ? <button className="ghost sm" onClick={() => done(r)}>Mark entered</button> : <button className="ghost sm" onClick={() => undo(r)}>Move back</button>}
            <button className="ghost sm" onClick={() => del(r)}>Delete</button>
          </div>
        </div>) })}
    </div>
  )
}

export default function TempReturn({ back }) {
  const [mode, setMode] = useState('new')
  const [k, setK] = useState(0)
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Temporary returns</h1></div></header>
      <div className="seg" style={{ width: 'fit-content', marginBottom: 12 }}>{[['new', 'New'], ['list', 'Pending list']].map(([m, l]) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{l}</button>)}</div>
      {mode === 'new' ? <NewReturn key={k} onSaved={() => { setK(k + 1); setMode('list') }} /> : <Pending refreshKey={k} />}
      <p className="muted small" style={{ marginTop: 14 }}>Temporary returns are saved only in this app. Profit Maker and its backups are never changed. After you enter the return in Profit Maker, tap Mark entered.</p>
    </div>
  )
}
