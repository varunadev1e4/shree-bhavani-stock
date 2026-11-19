import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { fetchAll, clearMem, num, fmtExp } from './util'
import { exportPdf } from './exporter'

// Temporary bills: for goods sent out before they are billed in Profit Maker.
// They are stored only in this app's own table (temp_bills). Nothing is written to Profit Maker or its backups.
const dmy = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

async function slipPdf(b) {
  const rows = b.lines.map((l, i) => [i + 1, l.name, l.pack || '', l.batch || '', l.exp ? fmtExp(l.exp) : '', num(l.qty)])
  const qty = b.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  rows.push(['', 'TOTAL QTY', '', '', '', num(qty)])
  await exportPdf({ title: 'TEMPORARY BILL ' + b.bill_no + ' (goods sent, final bill to follow)', subtitle: 'To: ' + b.party_name + ' | Date: ' + dmy(b.created_at) + (b.note ? ' | ' + b.note : ''),
    columns: ['#', 'Product', 'Pack', 'Batch', 'Exp', 'Qty'], rows, bold: [rows.length - 1], numCols: [0, 5], filename: b.bill_no })
}

function Picker({ stock, onPick }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return w.length ? stock.filter((s) => w.every((x) => (s.name + ' ' + (s.company || '')).toLowerCase().includes(x))).slice(0, 8) : []
  }, [q, stock])
  return (
    <div>
      <input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} type="search" placeholder="Search product to add..." value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((s) => (
        <button key={s.id} className="more" style={{ marginTop: 6, textAlign: 'left', color: 'inherit', borderStyle: 'solid' }} onClick={() => { onPick(s); setQ('') }}>
          <b>{s.name}</b> <span className="muted small">{s.packing} {s.company ? '| ' + s.company : ''} | stock {num(s.total_qty)}</span>
        </button>))}
    </div>
  )
}

function NewBill({ onSaved }) {
  const [parties, setParties] = useState([])
  const [stock, setStock] = useState([])
  const [pq, setPq] = useState('')
  const [party, setParty] = useState(null)
  const [note, setNote] = useState('')
  const [lines, setLines] = useState([])
  const [choose, setChoose] = useState(null) // { s, batches } while picking a batch
  const [reserved, setReserved] = useState({}) // qty already on pending temporary bills, per product|batch
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    fetchAll('parties', 'id,name,city,deleted').then((p) => setParties(p.filter((x) => !x.deleted))).catch(() => {})
    fetchAll('stock_summary', 'id,name,packing,company,gst,total_qty').then(setStock).catch(() => {})
    supabase.from('temp_bills').select('lines').eq('status', 'pending').then(({ data }) => {
      const m = {}
      ;(data || []).forEach((b) => b.lines.forEach((l) => { const k = l.pid + '|' + l.batch; m[k] = (m[k] || 0) + (Number(l.qty) || 0) + (Number(l.free) || 0) }))
      setReserved(m)
    })
  }, [])
  const phits = useMemo(() => { const w = pq.trim().toLowerCase(); return w && !party ? parties.filter((p) => (p.name + ' ' + (p.city || '')).toLowerCase().includes(w)).slice(0, 6) : [] }, [pq, parties, party])

  // Step 1: show every batch with how many are still free to bill (stock minus what other pending slips already hold)
  const addProduct = async (s) => {
    const { data } = await supabase.from('batches').select('id,batch_no,exp_month,exp_year,qty,bill_price').eq('product_id', s.id).gt('qty', 0).order('exp_year').order('exp_month')
    setChoose({ s, batches: data || [] })
  }
  const avail = (pid, b) => Math.max(0, Number(b.qty) - (reserved[pid + '|' + b.batch_no] || 0) - lines.filter((l) => l.pid === pid && l.batch === b.batch_no).reduce((x, l) => x + (Number(l.qty) || 0) + (Number(l.free) || 0), 0))
  const addBatch = (s, b) => {
    setLines((l) => [...l, { pid: s.id, name: s.name, pack: s.packing, batch: b.batch_no, exp: b.exp_year * 100 + b.exp_month, qty: 1, stock: Number(b.qty) }])
    setChoose(null)
  }
  const edit = (i, k, v) => setLines((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  const save = async () => {
    setErr('')
    const name = party ? party.name : pq.trim()
    if (!name) return setErr('Choose or type the party name.')
    if (!lines.length) return setErr('Add at least one product.')
    setBusy(true)
    try {
      const d = new Date(), ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
      const { count } = await supabase.from('temp_bills').select('id', { count: 'exact', head: true }).gte('created_at', start)
      const bill_no = 'TMP-' + ymd + '-' + String((count || 0) + 1).padStart(2, '0')
      const clean = lines.map((l) => ({ ...l, qty: Number(l.qty) || 0 }))
      const row = { bill_no, party_id: party ? party.id : null, party_name: name, note: note || null, lines: clean, status: 'pending' }
      const { data, error } = await supabase.from('temp_bills').insert(row).select().single()
      if (error) throw error
      clearMem()
      await slipPdf(data).catch(() => {})
      onSaved()
    } catch (e) { setErr('Could not save: ' + e.message) }
    setBusy(false)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        {party
          ? <div className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b>{party.name} <span className="muted small">{party.city}</span></b><button className="ghost sm" onClick={() => { setParty(null); setPq('') }}>Change</button></div>
          : <input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} type="search" placeholder="Party name (search or type a new name)..." value={pq} onChange={(e) => setPq(e.target.value)} />}
        {phits.map((p) => <button key={p.id} className="more" style={{ marginTop: 6, textAlign: 'left', color: 'inherit', borderStyle: 'solid' }} onClick={() => setParty(p)}><b>{p.name}</b> <span className="muted small">{p.city}</span></button>)}
      </div>
      <Picker stock={stock} onPick={addProduct} />
      {choose && (
        <div className="chartcard" style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{choose.s.name} <span className="muted small">{choose.s.packing}</span></b><button className="ghost sm" onClick={() => setChoose(null)}>Cancel</button></div>
          {!choose.batches.length && <span className="muted small">No stock in any batch.</span>}
          {choose.batches.map((b) => { const a = avail(choose.s.id, b), held = reserved[choose.s.id + '|' + b.batch_no] || 0; return (
            <button key={b.id} className="more" style={{ marginTop: 0, textAlign: 'left', color: 'inherit', borderStyle: 'solid', opacity: a > 0 ? 1 : 0.55 }} onClick={() => addBatch(choose.s, b)}>
              <b>{b.batch_no}</b> <span className="muted small">exp {fmtExp(b.exp_year * 100 + b.exp_month)} | in stock {num(b.qty)}{held ? ' | on pending slips ' + num(held) : ''}</span>
              <br /><b style={{ color: a > 0 ? 'var(--good)' : 'var(--bad)' }}>{num(a)} available to bill</b>
            </button>) })}
        </div>)}
      {lines.map((l, i) => { const used = Number(l.qty) || 0, room = l.stock - (reserved[l.pid + '|' + l.batch] || 0); return (
        <div key={i} className="chartcard" style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{l.name} <span className="muted small">{l.pack} | batch {l.batch} | exp {fmtExp(l.exp)}</span></b>
            <button className="ghost sm" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>Remove</button></div>
          <label className="muted small">Qty<input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} type="number" inputMode="numeric" value={l.qty} onChange={(e) => edit(i, 'qty', e.target.value)} /></label>
          <span className="muted small">Available in this batch {num(Math.max(0, room))}</span>
          {used > room && <span className="error small">Only {num(Math.max(0, room))} available in this batch. Reduce the quantity or add another batch of this product.</span>}
        </div>) })}
      <input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="Note (optional, e.g. sent with driver Ravi)" value={note} onChange={(e) => setNote(e.target.value)} />
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
  useEffect(() => {
    supabase.from('temp_bills').select('*').eq('status', show).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setRows(data || []))
  }, [show, refreshKey, n])
  const done = async (b) => {
    const pm = window.prompt('Profit Maker bill number (optional):', '')
    if (pm === null) return
    await supabase.from('temp_bills').update({ status: 'billed', pm_bill_no: pm || null, billed_at: new Date().toISOString() }).eq('id', b.id); setN(n + 1)
  }
  const del = async (b) => { if (window.confirm('Delete ' + b.bill_no + '?')) { await supabase.from('temp_bills').delete().eq('id', b.id); setN(n + 1) } }
  const wa = (b) => {
    const t = b.lines.map((l) => l.name + ' x ' + num(l.qty) + ' (batch ' + (l.batch || '-') + ')').join('\n')
    window.open('https://wa.me/?text=' + encodeURIComponent('Temporary bill ' + b.bill_no + ' (' + dmy(b.created_at) + ')\n' + b.party_name + '\n' + t + '\nGoods sent. Final bill to follow.'), '_blank')
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="seg" style={{ width: 'fit-content' }}>{[['pending', 'To be billed'], ['billed', 'Billed']].map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && <div className="empty"><b>Nothing here</b><span>{show === 'pending' ? 'All temporary bills are billed.' : 'No billed slips yet.'}</span></div>}
      {rows && rows.length > 0 && <p className="muted small" style={{ margin: 0 }}>{rows.length} slip{rows.length > 1 ? 's' : ''}</p>}
      {(rows || []).map((b) => (
        <div key={b.id} className="chartcard" style={{ display: 'grid', gap: 6 }}>
          <b>{b.party_name}</b>
          <span className="muted small">{b.bill_no} | {dmy(b.created_at)} | {b.lines.length} items, qty {num(b.lines.reduce((x, l) => x + (Number(l.qty) || 0), 0))}{b.pm_bill_no ? ' | billed as ' + b.pm_bill_no : ''}{b.note ? ' | ' + b.note : ''}</span>
          <div className="btnrow" style={{ paddingTop: 0 }}>
            <button className="ghost sm" onClick={() => slipPdf(b)}>PDF</button>
            <button className="ghost sm" onClick={() => wa(b)}>WhatsApp</button>
            {show === 'pending' && <button className="ghost sm" onClick={() => done(b)}>Mark billed</button>}
            <button className="ghost sm" onClick={() => del(b)}>Delete</button>
          </div>
        </div>))}
    </div>
  )
}

export default function TempBill({ back }) {
  const [mode, setMode] = useState('new')
  const [k, setK] = useState(0)
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Temporary bill</h1></div></header>
      <div className="seg" style={{ width: 'fit-content', marginBottom: 12 }}>{[['new', 'New'], ['list', 'Pending list']].map(([m, l]) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{l}</button>)}</div>
      {mode === 'new' ? <NewBill key={k} onSaved={() => { setK(k + 1); setMode('list') }} /> : <Pending refreshKey={k} />}
      <p className="muted small" style={{ marginTop: 14 }}>Temporary bills are saved only in this app. Profit Maker and its backups are never changed. When you make the real bill in Profit Maker, tap Mark billed.</p>
    </div>
  )
}