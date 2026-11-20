import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { fetchAll, rs, waLink, SHOP } from './util'
import ExportBar from './Export'

// Temporary payment collections: money received during the day, to be entered in Profit Maker later (often at day end).
// Saved only in this app's own table (temp_collections). Nothing is written to Profit Maker or its backups.
const MODES = ['Cash', 'UPI', 'Cheque', 'Bank transfer', 'Other']
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
const age = (s) => Math.max(0, Math.floor((new Date(iso(new Date()) + 'T00:00:00') - new Date(s + 'T00:00:00')) / 864e5))
const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }
const sumBy = (rows) => { const m = {}; rows.forEach((r) => { m[r.mode] = (m[r.mode] || 0) + Number(r.amount) }); return m }
const modeText = (m) => Object.entries(m).map(([k, v]) => k + ' ' + rs(v)).join(' | ')

function NewCollection({ onSaved }) {
  const [parties, setParties] = useState([])
  const [pq, setPq] = useState('')
  const [party, setParty] = useState(null)
  const [amt, setAmt] = useState('')
  const [mode, setMode] = useState('Cash')
  const [d, setD] = useState(iso(new Date()))
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [last, setLast] = useState(null)
  useEffect(() => { fetchAll('parties', 'id,name,city,phone,phone2,receivable,deleted').then((p) => setParties(p.filter((x) => !x.deleted))).catch(() => {}) }, [])
  const hits = useMemo(() => { const w = pq.trim().toLowerCase(); return w && !party ? parties.filter((p) => (p.name + ' ' + (p.city || '')).toLowerCase().includes(w)).slice(0, 6) : [] }, [pq, parties, party])
  const due = party ? Math.max(Number(party.receivable) || 0, 0) : 0

  const save = async () => {
    setErr('')
    const name = party ? party.name : pq.trim(), amount = Number(amt)
    if (!name) return setErr('Choose or type who paid.')
    if (!(amount > 0)) return setErr('Enter the amount.')
    setBusy(true)
    const { error } = await supabase.from('temp_collections').insert({ d, party_id: party ? party.id : null, party_name: name, amount, mode, ref: ref.trim() || null, note: note.trim() || null })
    setBusy(false)
    if (error) return setErr('Could not save: ' + error.message + ' (run migration-15.sql in Supabase)')
    setLast({ name, amount, mode, d, phone: party && (party.phone || party.phone2) })
    setParty(null); setPq(''); setAmt(''); setRef(''); setNote(''); onSaved && onSaved()
  }
  const receipt = (l) => 'Dear ' + l.name + ', we have received ' + rs(l.amount) + ' (' + l.mode + ') on ' + dmy(l.d) + '. Thank you. - ' + SHOP

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {last && (
        <div className="chartcard" style={{ margin: 0, display: 'grid', gap: 6, borderLeft: '4px solid var(--good)' }}>
          <b>Saved: {last.name} {rs(last.amount)} ({last.mode})</b>
          <div className="btnrow" style={{ paddingTop: 0 }}>
            {last.phone && <a className="ghost sm" target="_blank" rel="noreferrer" href={waLink(last.phone, receipt(last))}>Send receipt on WhatsApp</a>}
            <button className="ghost sm" onClick={() => setLast(null)}>Close</button>
          </div>
        </div>)}
      <div>
        {party
          ? <div className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
              <span><b>{party.name}</b> <span className="muted small">{party.city}</span><br /><span className="muted small">Pending dues: {rs(due)}</span></span>
              <button className="ghost sm" onClick={() => { setParty(null); setPq('') }}>Change</button></div>
          : <input {...inp} type="search" placeholder="Received from (search party or type a name)..." value={pq} onChange={(e) => setPq(e.target.value)} />}
        {hits.map((p) => <button key={p.id} className="more" style={{ marginTop: 6, textAlign: 'left', color: 'inherit', borderStyle: 'solid' }} onClick={() => setParty(p)}><b>{p.name}</b> <span className="muted small">{p.city} | dues {rs(Math.max(Number(p.receivable) || 0, 0))}</span></button>)}
      </div>
      <input {...inp} type="number" inputMode="decimal" placeholder="Amount received" value={amt} onChange={(e) => setAmt(e.target.value)} />
      {party && due > 0 && Number(amt) > due + 0.5 && <span className="muted small">This is more than the pending dues ({rs(due)}). That is fine if it is an advance or older bills are not synced yet.</span>}
      {party && due > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="qc" onClick={() => setAmt(String(Math.round(due * 100) / 100))}>Full dues {rs(due)}</button></div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{MODES.map((m) => <button key={m} className={'qc' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>{m}</button>)}</div>
      {(mode === 'Cheque' || mode === 'UPI' || mode === 'Bank transfer') && <input {...inp} placeholder={mode === 'Cheque' ? 'Cheque number and bank' : 'Reference number'} value={ref} onChange={(e) => setRef(e.target.value)} />}
      <label className="muted small">Date received<input {...inp} type="date" value={d} max={iso(new Date())} onChange={(e) => setD(e.target.value)} /></label>
      <input {...inp} placeholder="Note (optional, e.g. for bill AB01898, collected by Ravi)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save collection'}</button>
    </div>
  )
}

function Pending({ refreshKey }) {
  const [rows, setRows] = useState(null)
  const [show, setShow] = useState('pending')
  const [n, setN] = useState(0)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.from('temp_collections').select('*').eq('status', show).order('d', { ascending: show === 'pending' }).order('id', { ascending: show === 'pending' }).limit(300)
      .then(({ data, error }) => { if (error) setErr(error.message + ' (run migration-15.sql in Supabase)'); setRows(data || []) })
  }, [show, refreshKey, n])

  const days = useMemo(() => { const m = new Map(); (rows || []).forEach((r) => { if (!m.has(r.d)) m.set(r.d, []); m.get(r.d).push(r) }); return [...m.entries()] }, [rows])
  const markMany = async (list) => {
    const pm = list.length > 1 ? 'x' : window.prompt('Profit Maker receipt / voucher number (optional):', '')
    if (pm === null) return
    if (list.length > 1 && !window.confirm('Mark all ' + list.length + ' collections (' + rs(list.reduce((s, r) => s + Number(r.amount), 0)) + ') as entered in Profit Maker?')) return
    await supabase.from('temp_collections').update({ status: 'entered', pm_ref: list.length > 1 ? null : pm || null, entered_at: new Date().toISOString() }).in('id', list.map((r) => r.id)); setN(n + 1)
  }
  const undo = async (r) => { await supabase.from('temp_collections').update({ status: 'pending', pm_ref: null, entered_at: null }).eq('id', r.id); setN(n + 1) }
  const del = async (r) => { if (window.confirm('Delete ' + r.party_name + ' ' + rs(r.amount) + '?')) { await supabase.from('temp_collections').delete().eq('id', r.id); setN(n + 1) } }

  // Checklist to type into Profit Maker, with the total for each day and payment mode
  const build = () => {
    const out = [], bold = []
    days.forEach(([d, list]) => {
      list.forEach((r) => out.push([dmy(d), r.party_name, r.mode, r.ref || '', r.note || '', Number(r.amount)]))
      bold.push(out.length); out.push([dmy(d) + ' total', '', '', '', modeText(sumBy(list)), list.reduce((s, r) => s + Number(r.amount), 0)])
    })
    bold.push(out.length); out.push(['GRAND TOTAL', '', '', '', modeText(sumBy(rows || [])), (rows || []).reduce((s, r) => s + Number(r.amount), 0)])
    return { title: 'Collections to enter in Profit Maker', subtitle: (rows || []).length + ' collections', filename: 'pending-collections', columns: ['Date', 'Party', 'Mode', 'Reference', 'Note', 'Amount'], rows: out, bold, numCols: [5] }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="seg" style={{ width: 'fit-content' }}>{[['pending', 'To enter'], ['entered', 'Entered']].map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => { setRows(null); setShow(k) }}>{l}</button>)}</div>
      {err && <p className="error">{err}</p>}
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && !err && <div className="empty"><b>Nothing here</b><span>{show === 'pending' ? 'All collections are entered in Profit Maker.' : 'No entered collections yet.'}</span></div>}
      {rows && rows.length > 0 && show === 'pending' && (
        <>
          <div className="total" style={{ margin: 0 }}><span>To enter in Profit Maker</span><b>{rs(rows.reduce((s, r) => s + Number(r.amount), 0))}</b><span>{rows.length} collections</span></div>
          <ExportBar build={build} />
        </>)}
      {days.map(([d, list]) => { const a = age(d); return (
        <div key={d} style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
            <b>{dmy(d)} <span className="muted small">{a === 0 ? 'today' : a + ' day' + (a > 1 ? 's' : '') + ' ago'}</span></b><b>{rs(list.reduce((s, r) => s + Number(r.amount), 0))}</b></div>
          <span className="muted small">{modeText(sumBy(list))}</span>
          {list.map((r) => (
            <div key={r.id} className="chartcard" style={{ margin: 0, display: 'grid', gap: 4, borderLeft: show === 'pending' && a >= 3 ? '4px solid var(--bad)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{r.party_name}</b><b>{rs(r.amount)}</b></div>
              <span className="muted small">{r.mode}{r.ref ? ' | ' + r.ref : ''}{r.note ? ' | ' + r.note : ''}{r.pm_ref ? ' | entered as ' + r.pm_ref : ''}</span>
              <div className="btnrow" style={{ paddingTop: 0 }}>
                {show === 'pending' ? <button className="ghost sm" onClick={() => markMany([r])}>Mark entered</button> : <button className="ghost sm" onClick={() => undo(r)}>Move back</button>}
                <button className="ghost sm" onClick={() => del(r)}>Delete</button>
              </div>
            </div>))}
          {show === 'pending' && list.length > 1 && <button className="ghost" style={{ justifySelf: 'start' }} onClick={() => markMany(list)}>Mark all {list.length} of {dmy(d)} as entered</button>}
        </div>) })}
    </div>
  )
}

export default function TempCollection({ back }) {
  const [mode, setMode] = useState('new')
  const [k, setK] = useState(0)
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Temporary collections</h1></div></header>
      <div className="seg" style={{ width: 'fit-content', marginBottom: 12 }}>{[['new', 'New'], ['list', 'Pending list']].map(([m, l]) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setK(k + 1) }}>{l}</button>)}</div>
      {mode === 'new' ? <NewCollection onSaved={() => setK(k + 1)} /> : <Pending refreshKey={k} />}
      <p className="muted small" style={{ marginTop: 14 }}>Collections are saved only in this app. Profit Maker and its backups are never changed. After you enter them in Profit Maker, tap Mark entered.</p>
    </div>
  )
}
