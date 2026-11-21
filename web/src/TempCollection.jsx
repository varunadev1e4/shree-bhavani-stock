import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { fetchAll, rs } from './util'
import ExportBar from './Export'
import { BillBtn } from './BillShare'
import { askConfirm, askPrompt, showMsg } from './dialog'
import { receiptBlob, deliver } from './exporter'

// Temporary payment collections: money received during the day, to be entered in Profit Maker later (often at day end).
// Saved only in this app's own table (temp_collections). Nothing is written to Profit Maker or its backups.
const MODES = ['Cash', 'UPI', 'Cheque', 'Bank transfer', 'Other']
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const dmy = (s) => String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4)
const age = (s) => Math.max(0, Math.floor((new Date(iso(new Date()) + 'T00:00:00') - new Date(s + 'T00:00:00')) / 864e5))
const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const sumBy = (rows) => { const m = {}; rows.forEach((r) => { m[r.mode] = (m[r.mode] || 0) + Number(r.amount) }); return m }
const modeText = (m) => Object.entries(m).map(([k, v]) => k + ' ' + rs(v)).join(' | ')
const billText = (r) => (r.bills || []).map((b) => b.bill_no + ' ' + rs(b.paid)).join(', ')
const billLabel = (b) => b.bill_no + (b.ref_no ? ' / Inv ' + b.ref_no : '')
const TITLE = (r) => 'Receipt ' + (r.rec_no || '') + ' - ' + r.party_name

// Oldest bill first
function autoAlloc(amount, bills) {
  let left = r2(amount); const a = {}
  bills.forEach((b) => { const x = Math.min(left, b.bal); if (x > 0.005) { a[b.id] = String(r2(x)); left = r2(left - x) } })
  return a
}

function NewCollection({ onSaved }) {
  const [parties, setParties] = useState([])
  const [pq, setPq] = useState('')
  const [party, setParty] = useState(null)
  const [bills, setBills] = useState([])
  const [billsLoading, setBillsLoading] = useState(false)
  const [alloc, setAlloc] = useState({})
  const [manual, setManual] = useState(false)
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

  // Pending bills of this party (credit bills with a balance), less money already collected in this app but not yet entered in Profit Maker
  useEffect(() => {
    setBills([]); setAlloc({}); setManual(false)
    if (!party) return
    let stale = false
    setBillsLoading(true)
    Promise.all([
      supabase.from('pending_bills').select('id,bill_no,ref_no,bill_date,total,paid,balance').eq('party_id', party.id).eq('kind', 'R').gt('balance', 0.5).order('bill_date').order('id'),
      supabase.from('temp_collections').select('bills').eq('party_id', party.id).eq('status', 'pending'),
    ]).then(([a, b]) => {
      if (stale) return
      const held = {}; (b.data || []).forEach((c) => (c.bills || []).forEach((x) => { held[x.bill_no] = (held[x.bill_no] || 0) + Number(x.paid || 0) }))
      setBills((a.data || []).map((x) => ({ ...x, held: held[x.bill_no] || 0, bal: r2(Number(x.balance) - (held[x.bill_no] || 0)) })).filter((x) => x.bal > 0.5))
      setBillsLoading(false)
    }).catch(() => { if (!stale) setBillsLoading(false) })
    return () => { stale = true }
  }, [party])
  // Until you change a bill amount yourself, the money is spread over the oldest bills first
  useEffect(() => { if (!manual) setAlloc(autoAlloc(Number(amt) || 0, bills)) }, [amt, bills, manual])

  const allocated = r2(bills.reduce((s, b) => s + (Number(alloc[b.id]) || 0), 0))
  const amount = Number(amt) || 0
  const onAccount = r2(amount - allocated)
  const setBill = (id, v) => { setManual(true); setAlloc((a) => ({ ...a, [id]: v })) }
  const overBill = bills.find((b) => (Number(alloc[b.id]) || 0) > b.bal + 0.5)

  const save = async () => {
    setErr('')
    const name = party ? party.name : pq.trim()
    if (!name) return setErr('Choose or type who paid.')
    if (!(amount > 0)) return setErr('Enter the amount.')
    if (allocated > amount + 0.5) return setErr('The bills add up to ' + rs(allocated) + ', which is more than the amount received (' + rs(amount) + ').')
    if (overBill) return setErr('The amount for bill ' + overBill.bill_no + ' is more than its pending ' + rs(overBill.bal) + '.')
    setBusy(true)
    try {
      const t = new Date(), ymd = String(t.getFullYear()).slice(2) + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0')
      const { count } = await supabase.from('temp_collections').select('id', { count: 'exact', head: true }).gte('created_at', new Date(t.getFullYear(), t.getMonth(), t.getDate()).toISOString())
      const rec_no = 'REC-' + ymd + '-' + String((count || 0) + 1).padStart(2, '0')
      const against = bills.filter((b) => Number(alloc[b.id]) > 0).map((b) => ({ bill_no: billLabel(b), date: String(b.bill_date).slice(0, 10), total: Number(b.total), before: b.bal, paid: r2(alloc[b.id]) }))
      const row = { d, party_id: party ? party.id : null, party_name: name, amount, mode, ref: ref.trim() || null, note: note.trim() || null, rec_no, bills: against }
      const { data, error } = await supabase.from('temp_collections').insert(row).select().single()
      if (error) throw error
      // Build the PDF now so the Share button can open the share sheet instantly
      const pdf = await receiptBlob(data).catch(() => null)
      setLast({ row: data, pdf, phone: party && (party.phone || party.phone2) })
      setParty(null); setPq(''); setAmt(''); setRef(''); setNote(''); onSaved && onSaved()
    } catch (e) { setErr('Could not save: ' + e.message + ' (run migration-15.sql and migration-16.sql in Supabase)') }
    setBusy(false)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {last && (
        <div className="chartcard" style={{ margin: 0, display: 'grid', gap: 6, borderLeft: '4px solid var(--good)' }}>
          <b>Saved: {last.row.party_name} {rs(last.row.amount)} ({last.row.mode})</b>
          <span className="muted small">Receipt {last.row.rec_no}{last.row.bills.length ? ' | against ' + billText(last.row) : ' | on account'}</span>
          <div className="btnrow" style={{ paddingTop: 0 }}>
            {last.pdf
              ? <button className="primary" style={{ flex: 1 }} onClick={() => deliver(last.pdf.blob, last.pdf.filename, TITLE(last.row))}>Share receipt PDF</button>
              : <span className="error small">Could not make the receipt PDF. You can make it from the Pending list.</span>}
            <button className="ghost sm" onClick={() => setLast(null)}>Close</button>
          </div>
          <span className="muted small">In the share sheet choose WhatsApp, then pick the customer{last.phone ? ' (' + last.phone + ')' : ''}.</span>
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
      {party && due > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="qc" onClick={() => setAmt(String(r2(due)))}>Full dues {rs(due)}</button></div>}

      {party && (billsLoading ? <span className="muted small">Loading pending bills...</span> : bills.length > 0 ? (
        <div className="chartcard" style={{ margin: 0, padding: 0, overflowX: 'auto' }}>
          <div style={{ padding: '10px 12px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <b>Pending bills: money against which bill</b>
            {manual && <button className="ghost sm" onClick={() => setManual(false)}>Oldest first</button>}
          </div>
          <table className="rtable">
            <thead><tr><th style={{ textAlign: 'left' }}>Bill</th><th>Pending</th><th>Paying now</th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td style={{ textAlign: 'left', whiteSpace: 'normal' }}><b>{b.bill_no}</b> <span className="muted small">{dmy(String(b.bill_date).slice(0, 10))}</span> <BillBtn no={b.bill_no} date={b.bill_date} party={party.name} />
                    {b.held > 0 && <div className="muted small">{rs(b.held)} already collected here, not yet in Profit Maker</div>}</td>
                  <td>{rs(b.bal)}<div><button className="qc" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setBill(b.id, String(b.bal))}>Full</button></div></td>
                  <td><input className="fsel" style={{ width: 92, boxSizing: 'border-box', textAlign: 'right', padding: '8px 8px' }} type="number" inputMode="decimal" placeholder="0" value={alloc[b.id] || ''} onChange={(e) => setBill(b.id, e.target.value)} /></td>
                </tr>))}
            </tbody>
          </table>
          <div style={{ padding: '8px 12px 12px', display: 'grid', gap: 2 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Against bills</span><b>{rs(allocated)}</b></span>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{onAccount < -0.5 ? 'More than amount received' : 'On account / advance'}</span><b style={{ color: onAccount < -0.5 ? 'var(--bad)' : undefined }}>{rs(Math.abs(onAccount))}</b></span>
          </div>
        </div>
      ) : <span className="muted small">No pending bills found for this party (they may not be synced yet). The money will be saved as received on account.</span>)}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{MODES.map((m) => <button key={m} className={'qc' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>{m}</button>)}</div>
      {(mode === 'Cheque' || mode === 'UPI' || mode === 'Bank transfer') && <input {...inp} placeholder={mode === 'Cheque' ? 'Cheque number and bank' : 'Reference number'} value={ref} onChange={(e) => setRef(e.target.value)} />}
      <label className="muted small">Date received<input {...inp} type="date" value={d} max={iso(new Date())} onChange={(e) => setD(e.target.value)} /></label>
      <input {...inp} placeholder="Note (optional, e.g. collected by Ravi)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save and make receipt'}</button>
    </div>
  )
}

// First tap makes the receipt, second tap opens the share sheet (phones only allow sharing straight from a tap)
function ReceiptBtn({ r }) {
  const [pdf, setPdf] = useState(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (pdf) return deliver(pdf.blob, pdf.filename, TITLE(r))
    setBusy(true)
    try { setPdf(await receiptBlob({ ...r, rec_no: r.rec_no || 'REC-' + r.id })) } catch (e) { showMsg('Could not make the receipt: ' + e.message) }
    setBusy(false)
  }
  return <button className="ghost sm" disabled={busy} onClick={go}>{busy ? 'Making...' : pdf ? 'Share receipt' : 'Receipt PDF'}</button>
}

function Pending({ refreshKey }) {
  const [rows, setRows] = useState(null)
  const [show, setShow] = useState('pending')
  const [n, setN] = useState(0)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.from('temp_collections').select('*').eq('status', show).order('d', { ascending: show === 'pending' }).order('id', { ascending: show === 'pending' }).limit(300)
      .then(({ data, error }) => { if (error) setErr(error.message + ' (run migration-15.sql and migration-16.sql in Supabase)'); setRows(data || []) })
  }, [show, refreshKey, n])

  const days = useMemo(() => { const m = new Map(); (rows || []).forEach((r) => { if (!m.has(r.d)) m.set(r.d, []); m.get(r.d).push(r) }); return [...m.entries()] }, [rows])
  const markMany = async (list) => {
    let pm = null
    if (list.length > 1) { if (!(await askConfirm('Mark all ' + list.length + ' collections (' + rs(list.reduce((s, r) => s + Number(r.amount), 0)) + ') as entered in Profit Maker?', { ok: 'Mark all' }))) return }
    else { pm = await askPrompt('Profit Maker receipt / voucher number (optional):', ''); if (pm === null) return }
    await supabase.from('temp_collections').update({ status: 'entered', pm_ref: pm || null, entered_at: new Date().toISOString() }).in('id', list.map((r) => r.id)); setN(n + 1)
  }
  const undo = async (r) => { await supabase.from('temp_collections').update({ status: 'pending', pm_ref: null, entered_at: null }).eq('id', r.id); setN(n + 1) }
  const del = async (r) => { if (await askConfirm('Delete the collection from ' + r.party_name + ' (' + rs(r.amount) + ')?', { ok: 'Delete', danger: true })) { await supabase.from('temp_collections').delete().eq('id', r.id); setN(n + 1) } }

  // Checklist to type into Profit Maker, with the total for each day and payment mode
  const build = () => {
    const out = [], bold = []
    days.forEach(([d, list]) => {
      list.forEach((r) => out.push([dmy(d), r.party_name, r.mode, r.ref || '', billText(r) || 'On account', r.note || '', Number(r.amount)]))
      bold.push(out.length); out.push([dmy(d) + ' total', '', '', '', '', modeText(sumBy(list)), list.reduce((s, r) => s + Number(r.amount), 0)])
    })
    bold.push(out.length); out.push(['GRAND TOTAL', '', '', '', '', modeText(sumBy(rows || [])), (rows || []).reduce((s, r) => s + Number(r.amount), 0)])
    return { title: 'Collections to enter in Profit Maker', subtitle: (rows || []).length + ' collections', filename: 'pending-collections', columns: ['Date', 'Party', 'Mode', 'Reference', 'Against bills', 'Note', 'Amount'], rows: out, bold, numCols: [6] }
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
              <span className="muted small">{r.rec_no ? r.rec_no + ' | ' : ''}{r.mode}{r.ref ? ' | ' + r.ref : ''}{r.note ? ' | ' + r.note : ''}{r.pm_ref ? ' | entered as ' + r.pm_ref : ''}</span>
              <span className="small">{(r.bills || []).length ? 'Against: ' + billText(r) : <span className="muted">On account</span>}</span>
              <div className="btnrow" style={{ paddingTop: 0 }}>
                <ReceiptBtn r={r} />
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
