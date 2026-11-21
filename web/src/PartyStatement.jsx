import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, SHOP } from './util'
import { exportPdf } from './exporter'
import { BillBtn } from './BillShare'
import { statement, KIND_TEXT } from './ledger'

// Party statement: every bill and payment between two dates with a running balance.
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
const money = (v) => (v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fyStart = () => { const t = new Date(); return iso(new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1)) }
const PRESETS = [['fy', 'This year'], ['month', 'This month'], ['lmonth', 'Last month'], ['custom', 'Choose dates']]
function range(p) {
  const t = new Date()
  if (p === 'month') return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)]
  if (p === 'lmonth') return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))]
  return [fyStart(), iso(t)]
}

export default function PartyStatement({ p, side, current, initFrom, initTo, onClose }) {
  const [preset, setPreset] = useState(initFrom || initTo ? 'custom' : 'fy')
  const [[from, to], setDates] = useState(initFrom || initTo ? [initFrom || fyStart(), initTo || iso(new Date())] : range('fy'))
  const [entries, setEntries] = useState(null)
  const [openings, setOpenings] = useState([])
  const [err, setErr] = useState('')
  useEffect(() => {
    Promise.all([
      fetchAll('ledger_entries', 'fy,d,kind,vno,ref,amount', (q) => q.eq('acc_id', p.id), 'led:' + p.id),
      fetchAll('party_opening', 'fy,op', (q) => q.eq('acc_id', p.id), 'open:' + p.id),
    ]).then(([e, o]) => { setEntries(e); setOpenings(o) }).catch((x) => { setErr(x.message + ' (run migration-12.sql and load the year once)'); setEntries([]) })
  }, [p.id])

  const st = useMemo(() => (entries ? statement(entries, openings, side, from, to) : null), [entries, openings, side, from, to])
  const pick = (k) => { setPreset(k); if (k !== 'custom') setDates(range(k)) }
  const recv = side === 'recv'
  const heads = ['Date', 'Voucher', 'Details', recv ? 'Bills' : 'Bills', recv ? 'Received' : 'Paid', recv ? 'To receive' : 'To pay']
  const text = (r) => KIND_TEXT[r.kind] + (r.ref ? (r.kind === 'RS' || r.kind === 'PA' ? ' / Chq ' : ' / Inv ') + r.ref : '')
  // The statement only ties to today's pending bills when it runs up to today
  const reachesToday = to >= iso(new Date())
  const diff = st && reachesToday && current != null ? Math.round((st.closing - current) * 100) / 100 : 0

  const pdf = () => {
    const rows = [['', '', 'Opening balance', '', '', money(st.open)],
      ...st.rows.map((r) => [dmy(r.d), r.vno || '', text(r), r.bill ? money(r.bill) : '', r.paid ? money(r.paid) : '', money(r.bal)]),
      ['', '', 'TOTAL / CLOSING', money(st.billed), money(st.paid), money(st.closing)]]
    exportPdf({ title: 'Statement of account: ' + p.name, subtitle: SHOP + (p.city ? ' | ' + p.city : '') + ' | ' + dmy(from) + ' to ' + dmy(to) + ' | credit bills only (cash bills are settled at billing)',
      columns: heads, rows, bold: [0, rows.length - 1], numCols: [3, 4, 5], filename: 'statement-' + p.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 30) })
  }

  return (
    <div className="sheet">
      <button className="ghost sm" onClick={onClose}>Back</button>
      <h2 className="h1" style={{ margin: '8px 0 2px' }}>{p.name}</h2>
      <span className="muted small">{recv ? 'Statement: to receive' : 'Statement: to pay'}{p.city ? ' | ' + p.city : ''}</span>
      <div className="qchips" style={{ marginTop: 10 }}>{PRESETS.map(([k, l]) => <button key={k} className={'qc' + (preset === k ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}</div>
      {preset === 'custom' && <div className="dates"><input type="date" value={from} max={to} onChange={(e) => setDates([e.target.value, to])} /><input type="date" value={to} min={from} onChange={(e) => setDates([from, e.target.value])} /></div>}
      {err && <p className="error pad">{err}</p>}
      {!entries && <p className="muted pad">Loading...</p>}
      {st && (
        <>
          <div className="minis" style={{ marginTop: 12 }}>
            <div className="mini"><span>Opening</span><b>{rs(st.open)}</b></div>
            <div className="mini"><span>Bills</span><b>{rs(st.billed)}</b></div>
            <div className="mini"><span>{recv ? 'Received' : 'Paid'}</span><b>{rs(st.paid)}</b></div>
            <div className="mini"><span>Closing</span><b>{rs(st.closing)}</b></div>
          </div>
          {Math.abs(diff) > 1 && <p className="muted small" style={{ margin: '8px 0 0' }}>Pending bills total today is {rs(current)}, which is {rs(Math.abs(diff))} {diff > 0 ? 'less' : 'more'} than this statement. This usually means a payment on account or an adjustment that is not tied to a bill.</p>}
          <div className="btnrow"><button className="primary" style={{ flex: 1 }} onClick={pdf}>Share statement PDF</button></div>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th style={{ textAlign: 'left' }}>Date</th><th style={{ textAlign: 'left' }}>Details</th><th>Bills</th><th>{recv ? 'Received' : 'Paid'}</th><th>Balance</th></tr></thead>
              <tbody>
                <tr className="g"><td colSpan={4} style={{ textAlign: 'left' }}>Opening balance</td><td>{money(st.open)}</td></tr>
                {st.rows.map((r, i) => (
                  <tr key={i}><td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{dmy(r.d).slice(0, 5)}</td><td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{r.vno} <span className="muted small">{text(r)}</span>{recv && r.bill ? <div><BillBtn no={r.vno} date={r.d} party={p.name} /></div> : null}</td>
                    <td>{r.bill ? money(r.bill) : ''}</td><td>{r.paid ? money(r.paid) : ''}</td><td>{money(r.bal)}</td></tr>))}
                <tr className="t"><td colSpan={2} style={{ textAlign: 'left' }}>Closing</td><td>{money(st.billed)}</td><td>{money(st.paid)}</td><td>{money(st.closing)}</td></tr>
              </tbody>
            </table>
          </div>
          {!st.rows.length && <div className="empty"><b>No bills or payments in this period</b></div>}
        </>
      )}
    </div>
  )
}
