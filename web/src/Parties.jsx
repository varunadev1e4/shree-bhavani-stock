import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, waLink, SHOP } from './util'
import Customer from './Customer'
import PartyStatement from './PartyStatement'
import Directory from './Directory'
import ExportBar from './Export'
import { exportPdf } from './exporter'

const dayAge = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d)) / 864e5)) : '')
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '')
const label = (b) => b.bill_no + (b.kind === 'P' && b.ref_no ? ' / Inv ' + b.ref_no : '')
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
const PRESETS = [['all', 'All dates'], ['month', 'This month'], ['lmonth', 'Last month'], ['custom', 'Choose dates']]
function presetRange(p) {
  const t = new Date()
  if (p === 'month') return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)]
  if (p === 'lmonth') return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))]
  return ['', '']
}
const COLS = ['Bill no', 'Date', 'Total (Rs)', 'Paid (Rs)', 'Balance (Rs)', 'Days']

export default function Parties({ side: sideProp }) {
  const [rows, setRows] = useState([])
  const [allBills, setAllBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [side, setSide] = useState(sideProp || 'recv')
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState('bal')
  const [open, setOpen] = useState(null)
  const [sel, setSel] = useState(null)
  const [stm, setStm] = useState(null)
  const [view, setView] = useState('dues')
  const [preset, setPreset] = useState('all')
  const [[from, to], setDates] = useState(['', ''])
  const rangeOn = !!(from || to)
  const pick = (p) => { setPreset(p); if (p !== 'custom') setDates(presetRange(p)) }
  const inRange = (b) => { const d = String(b.bill_date || '').slice(0, 10); return !!d && (!from || d >= from) && (!to || d <= to) }
  useEffect(() => { if (sideProp) setSide(sideProp) }, [sideProp])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const d = await fetchAll('parties', 'id,code,name,city,phone,phone2,receivable,payable,last_sale,age_30,age_60,age_90,age_90p,deleted')
      setRows(d.filter((p) => !p.deleted).map((p) => ({ ...p, _s: [p.name, p.code, p.city].filter(Boolean).join(' ').toLowerCase() })))
      setAllBills(await fetchAll('pending_bills', 'id,party_id,kind,bill_no,ref_no,bill_date,total,paid,balance').catch(() => []))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const rec = (p) => Number(p.receivable) || 0
  const pay = (p) => Number(p.payable) || 0
  const kindKey = side === 'recv' ? 'R' : 'P'
  // With a date range chosen, the amount is only the unpaid balance of bills dated inside the range
  const rangeBal = (p) => (bills.get(p.id) || []).reduce((s, b) => s + (Number(b.balance) || 0), 0)
  const owed = (p) => (rangeOn ? rangeBal(p) : side === 'recv' ? rec(p) : pay(p))
  const other = (p) => (rangeOn ? 0 : side === 'recv' ? pay(p) : rec(p))

  const sums = useMemo(() => {
    const s = { r: 0, a: 0, nr: 0, na: 0 }
    if (rangeOn) {
      const pr = { R: new Map(), P: new Map() }
      allBills.filter(inRange).forEach((b) => pr[b.kind] && pr[b.kind].set(b.party_id, (pr[b.kind].get(b.party_id) || 0) + (Number(b.balance) || 0)))
      pr.R.forEach((v) => { if (v > 0.5) { s.r += v; s.nr++ } }); pr.P.forEach((v) => { if (v > 0.5) { s.a += v; s.na++ } })
      return s
    }
    rows.forEach((p) => { if (rec(p) > 0.5) { s.r += rec(p); s.nr++ } if (pay(p) > 0.5) { s.a += pay(p); s.na++ } })
    return s
  }, [rows, allBills, from, to])

  const bills = useMemo(() => {
    const m = new Map(), k = side === 'recv' ? 'R' : 'P'
    allBills.filter((b) => b.kind === k && (!rangeOn || inRange(b))).forEach((b) => { if (!m.has(b.party_id)) m.set(b.party_id, []); m.get(b.party_id).push(b) })
    m.forEach((l) => l.sort((a, b) => String(a.bill_date).localeCompare(String(b.bill_date))))
    return m
  }, [allBills, side, from, to])

  const list = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const l = rows.filter((p) => w.every((x) => p._s.includes(x)) && (showAll || owed(p) > 0.5))
    return l.sort(sort === 'bal' ? (a, b) => owed(b) - owed(a) : (a, b) => a.name.localeCompare(b.name))
  }, [rows, q, side, showAll, sort, bills, from, to])

  const billRows = (p) => (bills.get(p.id) || []).map((b) => [label(b), fmtD(b.bill_date), Number(b.total), Number(b.paid), Number(b.balance), dayAge(b.bill_date)])
  const kindName = side === 'recv' ? 'Receivables' : 'Payables'
  const rangeText = rangeOn ? 'bills dated ' + (from ? dmy(from) : 'start') + ' to ' + (to ? dmy(to) : 'today') : ''

  const buildAll = () => {
    const out = [], bold = []
    let total = 0
    list.filter((p) => owed(p) > 0.5).forEach((p) => {
      bold.push(out.length); total += owed(p)
      out.push([p.name + (p.city ? ' (' + p.city + ')' : ''), '', '', '', owed(p), ''])
      billRows(p).forEach((r) => out.push(['   ' + r[0], ...r.slice(1)]))
    })
    bold.push(out.length); out.push(['TOTAL', '', '', '', total, ''])
    return { title: kindName + ' with pending bills', subtitle: 'Credit bills only' + (rangeOn ? ' | ' + rangeText : ''), filename: kindName.toLowerCase(), columns: ['Party / Bill no', ...COLS.slice(1)], rows: out, bold, numCols: [2, 3, 4, 5] }
  }
  const partyPdf = (p) => {
    const r = billRows(p)
    exportPdf({ title: p.name + ' - pending bills', subtitle: kindName + (p.city ? ' | ' + p.city : '') + (rangeOn ? ' | ' + rangeText : ''), columns: COLS, rows: [...r, ['TOTAL', '', '', '', owed(p), '']], bold: [r.length], numCols: [2, 3, 4, 5], filename: p.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 30) })
  }

  if (view === 'dir') return (
    <div className="app">
      <header className="top"><h1 className="h1">Parties</h1></header>
      <div className="seg" style={{ width: 'fit-content', marginBottom: 12 }}>{[['dues', 'Dues'], ['dir', 'Directory']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
      <Directory />
    </div>
  )

  return (
    <div className="app">
      <header className="top"><h1 className="h1">Parties</h1>
        <div className="actions"><button className="icon" onClick={load} aria-label="Refresh"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg></button></div>
      </header>
      <div className="seg" style={{ width: 'fit-content', marginBottom: 12 }}>{[['dues', 'Dues'], ['dir', 'Directory']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
      <div className="stats">
        <button className={'stat' + (side === 'recv' ? ' on' : '')} onClick={() => setSide('recv')}><span>To receive</span><b>{rs(sums.r)}</b><span>{sums.nr} parties</span></button>
        <button className={'stat' + (side === 'pay' ? ' on' : '')} onClick={() => setSide('pay')}><span>To pay</span><b>{rs(sums.a)}</b><span>{sums.na} parties</span></button>
      </div>
      <div className="qchips" style={{ marginTop: 10 }}>{PRESETS.map(([k, l]) => <button key={k} className={'qc' + (preset === k ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}</div>
      {preset === 'custom' && <div className="dates"><input type="date" value={from} max={to || undefined} onChange={(e) => setDates([e.target.value, to])} /><input type="date" value={to} min={from || undefined} onChange={(e) => setDates([from, e.target.value])} /></div>}
      {rangeOn && <p className="muted small" style={{ margin: '8px 0 0' }}>Showing only unpaid balance of {rangeText}. {side === 'recv' ? 'To receive' : 'To pay'}: <b>{rs(side === 'recv' ? sums.r : sums.a)}</b> from {side === 'recv' ? sums.nr : sums.na} parties.</p>}
      <div className="searchbox sp"><input type="search" placeholder="Search name, code or city" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="filters">
        <button className={'toggle' + (showAll ? ' on' : '')} onClick={() => setShowAll(!showAll)}>Show all parties</button>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="bal">Highest balance first</option><option value="name">A to Z</option></select>
      </div>
      {error && <p className="error pad">{error}</p>}
      {loading && <p className="muted pad">Loading...</p>}
      {!loading && !list.length && <div className="empty"><b>No parties found</b></div>}
      {!loading && list.length > 0 && <div style={{ marginTop: 12 }}><ExportBar build={buildAll} /></div>}
      <ul className="list">
        {list.map((p) => {
          const amt = owed(p), ph = p.phone || p.phone2, bl = bills.get(p.id) || []
          return (
            <li key={p.id} className="card">
              <button className="row" onClick={() => setOpen(open === p.id ? null : p.id)}>
                <div className="info"><div className="name">{p.name}</div>
                  <div className="meta"><span>{[p.city, p.code].filter(Boolean).join(' · ')}</span>{bl.length > 0 && <span>{bl.length} pending bills</span>}
                    {other(p) > 0.5 && <span className="pill soon">{side === 'recv' ? 'Also to pay ' : 'Also to receive '}{rs(other(p))}</span>}</div></div>
                <div className={'amt' + (amt > 0.5 && side === 'recv' ? ' due' : '')}>{rs(Math.max(amt, 0))}</div>
              </button>
              {open === p.id && (
                <div className="batches">
                  {bl.length > 0 ? (
                    <table>
                      <thead><tr><th>Bill</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Days</th></tr></thead>
                      <tbody>{bl.map((b) => (
                        <tr key={b.id}><td>{label(b)}</td><td>{fmtD(b.bill_date)}</td><td>{Number(b.total).toLocaleString('en-IN')}</td><td>{Number(b.paid).toLocaleString('en-IN')}</td><td><b>{Number(b.balance).toLocaleString('en-IN')}</b></td><td>{dayAge(b.bill_date)}</td></tr>
                      ))}</tbody>
                    </table>
                  ) : amt > 0.5 ? <p className="muted small">Bill details appear after the next sync.</p> : null}
                  <div className="btnrow">
                    {bl.length > 0 && <button className="ghost" onClick={() => partyPdf(p)}>Share PDF</button>}
                    <button className="ghost" onClick={() => setStm(p)}>Statement</button>
                    <button className="ghost" onClick={() => setSel(p)}>Details</button>
                    {ph ? <a className="ghost" href={'tel:' + ph.replace(/\D/g, '')}>Call {ph}</a> : <span className="muted">No phone saved</span>}
                    {ph && side === 'recv' && amt > 0.5 && (
                      <a className="ghost" target="_blank" rel="noreferrer"
                        href={waLink(ph, 'Dear ' + p.name + ', this is a gentle reminder from ' + SHOP + '. Your outstanding balance' + (rangeOn ? ' for ' + rangeText : '') + ' is ' + rs(amt) + (bl.length ? ' (pending bills: ' + bl.map((b) => b.bill_no).join(', ') + ')' : '') + '. Kindly arrange the payment. Thank you.')}>WhatsApp reminder</a>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {sel && <Customer p={sel} onClose={() => setSel(null)} />}
      {stm && <PartyStatement p={stm} side={side} current={side === 'recv' ? rec(stm) : pay(stm)} initFrom={from} initTo={to} onClose={() => setStm(null)} />}
    </div>
  )
}
