import { useEffect, useRef, useState } from 'react'
import { useBackLayer } from './backstack'
import { findBills, billExtra, billBlob, totals, recentBills } from './billcopy'
import { deliver } from './exporter'
import { rs, num, waLink, SHOP } from './util'

// Share a bill copy (PDF) on WhatsApp. Built from synced bill lines: nothing is written to Profit Maker or Supabase.
const dmy = (s) => String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4)

function Detail({ g, onBack }) {
  const [pdf, setPdf] = useState(null)
  const [ex, setEx] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let stale = false
    setPdf(null); setErr('')
    billExtra(g).then(async (e) => { if (stale) return; setEx(e); const p = await billBlob(g, e.hd); if (!stale) setPdf(p) }).catch((e) => { console.error(e); if (!stale) setErr('Could not build the PDF (' + ((e && e.message) || 'unknown') + '). If the app was just updated, close it and open it again.') })
    return () => { stale = true }
  }, [g])
  const t = totals(g.lines)
  const net = pdf ? pdf.net : (ex && ex.hd && ex.hd.net != null ? Number(ex.hd.net) : Math.round(t.total))
  const ph = ex && ex.pty && (ex.pty.phone || ex.pty.phone2)
  return (
    <div>
      {onBack && <button className="ghost sm" onClick={onBack}>Back to list</button>}
      <h2 className="h2" style={{ margin: '10px 0 2px' }}>Bill {g.bill_no} <span className="muted small">{dmy(g.d)}</span></h2>
      <div className="muted small">{g.party}{g.city ? ' | ' + g.city : ''}</div>
      <div className="minis" style={{ marginTop: 10 }}>
        <div className="mini"><span>Items</span><b>{g.lines.length}</b></div>
        <div className="mini"><span>Before GST</span><b>{rs(t.taxable)}</b></div>
        <div className="mini"><span>Net amount</span><b>{rs(net)}</b></div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="btnrow">
        <button className="primary" style={{ flex: 1 }} disabled={!pdf} onClick={() => deliver(pdf.blob, pdf.filename, 'Bill ' + g.bill_no)}>{pdf ? 'Share bill PDF' : 'Preparing PDF...'}</button>
        {ph && <a className="ghost" target="_blank" rel="noreferrer" href={waLink(ph, 'Dear ' + g.party + ', your bill ' + g.bill_no + ' dated ' + dmy(g.d) + ' for ' + rs(net) + ' from ' + SHOP + '. Thank you.')}>WhatsApp text</a>}
      </div>
      <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="rtable">
          <thead><tr><th style={{ textAlign: 'left' }}>Product</th><th>Qty</th><th>Free</th><th>Rate</th><th>Dis%</th><th>GST</th><th>Amount</th></tr></thead>
          <tbody>{g.lines.map((l) => <tr key={l.id}><td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{l.product} <span className="muted small">{[l.pack, l.batch].filter(Boolean).join(' | ')}</span></td><td>{num(l.qty)}</td><td>{Number(l.free) ? num(l.free) : ''}</td><td>{num(l.rate)}</td><td>{Number(l.dis) ? num(l.dis) : ''}</td><td>{num(l.gst)}%</td><td>{num(l.amount)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="muted small">The PDF follows Profit Maker's GST INVOICE layout, built from the data synced from it. Tap Share and choose the customer in WhatsApp.</p>
    </div>
  )
}


const dayName = (s) => { const t = new Date(); const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); const y = new Date(t); y.setDate(t.getDate() - 1); return s === iso(t) ? 'Today' : s === iso(y) ? 'Yesterday' : dmy(s) }
const sinceIso = (n) => { const t = new Date(); t.setDate(t.getDate() - n + 1); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0') }
const DAYS = [[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days']]

// Newest bills first, each with its own Share PDF button
function RecentBills({ onOpen }) {
  const [days, setDays] = useState(1)
  const [rows, setRows] = useState(null)
  const [state, setState] = useState({})
  const cache = useRef(new Map())
  useEffect(() => {
    let stale = false
    setRows(null)
    recentBills(sinceIso(days)).then((d) => { if (!stale) setRows(d) }).catch(() => { if (!stale) setRows([]) })
    return () => { stale = true }
  }, [days])
  const set = (k, v) => setState((s) => ({ ...s, [k]: v }))
  const share = async (g) => {
    const k = g.key
    let p = cache.current.get(k)
    if (!p) {
      set(k, 'busy')
      try { const e = await billExtra(g); p = await billBlob(g, e.hd); cache.current.set(k, p) } catch (e) { set(k, 'error'); return }
      // the phone only allows sharing right after a tap; if building took too long, ask for one more tap
      if (navigator.userActivation && !navigator.userActivation.isActive) { set(k, 'ready'); return }
    }
    set(k, '')
    await deliver(p.blob, p.filename, 'Bill ' + g.bill_no)
  }
  const byDay = []
  ;(rows || []).forEach((g) => { const l = byDay[byDay.length - 1]; if (l && l.d === g.d) l.list.push(g); else byDay.push({ d: g.d, list: [g] }) })
  return (
    <div style={{ marginTop: 16 }}>
      <div className="qchips">{DAYS.map(([k, l]) => <button key={k} className={'qc' + (days === k ? ' on' : '')} onClick={() => setDays(k)}>{l}</button>)}</div>
      {!rows && <p className="muted pad">Loading bills...</p>}
      {rows && !rows.length && <div className="empty"><b>No sales bills in this period</b><span>Bills appear after the sync.</span></div>}
      {byDay.map((day) => (
        <div key={day.d} style={{ marginTop: 10 }}>
          <div className="muted small" style={{ fontWeight: 700, padding: '0 2px 4px' }}>{dayName(day.d)} | {day.list.length} bill{day.list.length > 1 ? 's' : ''} | {rs(day.list.reduce((s, g) => s + g.net, 0))}</div>
          <ul className="list">
            {day.list.map((g) => {
              const st = state[g.key]
              return (
                <li key={g.key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="row" style={{ flex: 1, minWidth: 0 }} onClick={() => onOpen(g)}>
                    <div className="info"><div className="name">{g.party}</div><div className="meta"><span>Bill {g.bill_no}</span>{g.typ && <span>{g.typ}</span>}{g.city && <span>{g.city}</span>}</div></div>
                    <div className="amt">{rs(g.net)}</div>
                  </button>
                  <button className={st === 'ready' ? 'primary sm' : 'ghost sm'} style={{ margin: 0, flex: 'none' }} disabled={st === 'busy'} onClick={() => share(g)}>{st === 'busy' ? 'Preparing...' : st === 'ready' ? 'Tap to share' : st === 'error' ? 'Retry' : 'Share PDF'}</button>
                </li>)
            })}
          </ul>
        </div>))}
    </div>
  )
}

// no / date / party optional: when given from a bill list, the bill is opened directly
export function BillPanel({ no, date, party, auto }) {
  const [text, setText] = useState(no || '')
  const [groups, setGroups] = useState(null)
  const [pick, setPick] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async (v) => {
    setBusy(true); setPick(null); setGroups(null)
    try { const g = await findBills(v, date, party); setGroups(g); if (g.length === 1) setPick(g[0]) } catch (e) { setGroups([]) }
    setBusy(false)
  }
  useEffect(() => { if (auto && no) run(no) }, [])
  return (
    <div>
      {!auto && (
        <form onSubmit={(e) => { e.preventDefault(); run(text) }} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input className="fsel" style={{ flex: 1, boxSizing: 'border-box' }} inputMode="text" placeholder="Enter bill / invoice number" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <button className="primary" type="submit" disabled={busy || !text.trim()}>Find</button>
        </form>
      )}
      {busy && <p className="muted pad">Looking for the bill...</p>}
      {groups && !groups.length && !busy && <div className="empty"><b>No sales bill found</b><span>Bills appear here after the sync. For an earlier year, load it once with history.ps1.</span></div>}
      {groups && groups.length > 1 && !pick && (
        <div style={{ marginTop: 12 }}>
          <p className="muted small">{groups.length} bills match. Tap the right one.</p>
          <ul className="list">{groups.slice(0, 50).map((g) => (
            <li key={g.key} className="card"><button className="row" onClick={() => setPick(g)}>
              <div className="info"><div className="name">{g.bill_no} <span className="muted small">{dmy(g.d)}</span></div><div className="meta"><span>{g.party}</span></div></div>
              <div className="amt">{rs(g.total)}</div></button></li>))}</ul>
        </div>
      )}
      {pick && <div style={{ marginTop: 12 }}><Detail g={pick} onBack={auto ? (groups && groups.length > 1 ? () => setPick(null) : null) : () => setPick(null)} /></div>}
      {!auto && !pick && !busy && !(groups && groups.length > 1) && <RecentBills onOpen={(g) => setPick(g)} />}
    </div>
  )
}

export default function BillShare({ back }) {
  return (
    <div>
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>Share a bill</h1></div></header>
      <p className="muted small" style={{ marginTop: 6 }}>Type a bill number to get its PDF copy, ready to send on WhatsApp.</p>
      <BillPanel />
    </div>
  )
}

// Small button to put next to any bill number. Opens the bill copy over the current screen.
export function BillBtn({ no, date, party, label = 'Bill copy' }) {
  const [open, setOpen] = useState(false)
  useBackLayer(open, () => setOpen(false))
  if (!no) return null
  return (
    <>
      <button className="ghost sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setOpen(true) }}>{label}</button>
      {open && (
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <button className="ghost sm" onClick={() => setOpen(false)}>Close</button>
          <BillPanel no={no} date={date} party={party} auto />
        </div>
      )}
    </>
  )
}
