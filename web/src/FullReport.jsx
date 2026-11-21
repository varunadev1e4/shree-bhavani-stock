import { useEffect, useMemo, useState } from 'react'
import { fetchAll, num } from './util'
import { BillBtn } from './BillShare'
import ExportBar from './Export'
import FilterSheet, { FilterBar, Sec } from './FilterSheet'

// Same layout as Profit Maker's "Company Wise Customer Product Sales": company > customer > every bill line,
// with quantity and free kept apart, the rate, the discount %, the rate after discount (with or without GST) and totals.
const PRESETS = [['month', 'This month'], ['lmonth', 'Last month'], ['week', 'This week'], ['today', 'Today'], ['year', 'This year'], ['custom', 'Choose dates']]
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
const m2 = (v) => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
function range(p) {
  const t = new Date(), mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  const fy = new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1)
  return ({ today: [t, t], week: [mon, t], month: [new Date(t.getFullYear(), t.getMonth(), 1), t], lmonth: [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)], year: [fy, t] })[p].map(iso)
}

export default function FullReport() {
  const [preset, setPreset] = useState('month')
  const [[from, to], setDates] = useState(range('month'))
  const [company, setCompany] = useState('')
  const [text, setText] = useState('')
  const [withGst, setWithGst] = useState(false)
  const [rows, setRows] = useState(null)
  const [limit, setLimit] = useState(200)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let stale = false
    setRows(null)
    fetchAll('sales_lines', 'd,bill_no,party,party_code,city,company,product,pack,batch,qty,free,rate,dis,gst,amount', (q) => q.eq('kind', 'S').gte('d', from).lte('d', to), 'full:' + from + ':' + to)
      .then((d) => { if (!stale) setRows(d) }).catch(() => { if (!stale) setRows([]) })
    return () => { stale = true }
  }, [from, to])
  useEffect(() => { setLimit(200) }, [company, text, withGst, rows])
  const pick = (p) => { setPreset(p); if (p !== 'custom') setDates(range(p)) }
  const companies = useMemo(() => [...new Set((rows || []).map((r) => r.company || 'Other'))].sort(), [rows])

  // value of one line: quantity x rate after discount (free goods are not charged); with GST adds the line's GST
  const lineVal = (r) => (withGst ? Number(r.amount) * (1 + (Number(r.gst) || 0) / 100) : Number(r.amount))
  const unit = (r) => { const w = Number(r.rate) * (1 - (Number(r.dis) || 0) / 100); return withGst ? w * (1 + (Number(r.gst) || 0) / 100) : w }

  const data = useMemo(() => {
    const w = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const comp = new Map()
    ;(rows || []).filter((r) => (!company || (r.company || 'Other') === company) && w.every((x) => (r.party + ' ' + r.product).toLowerCase().includes(x))).forEach((r) => {
      const c = r.company || 'Other', k = r.party + '|' + (r.party_code || '')
      if (!comp.has(c)) comp.set(c, new Map())
      const cm = comp.get(c)
      if (!cm.has(k)) cm.set(k, { party: r.party, city: r.city, code: r.party_code, lines: [] })
      cm.get(k).lines.push(r)
    })
    const tt = (lines) => lines.reduce((s, r) => ({ q: s.q + Number(r.qty), f: s.f + (Number(r.free) || 0), v: s.v + lineVal(r) }), { q: 0, f: 0, v: 0 })
    const out = [...comp.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, cm]) => {
      const custs = [...cm.values()].sort((a, b) => a.party.localeCompare(b.party)).map((x) => {
        x.lines.sort((a, b) => a.d.localeCompare(b.d) || a.bill_no.localeCompare(b.bill_no, 'en', { numeric: true }))
        return { ...x, t: tt(x.lines) }
      })
      return { company: c, custs, t: tt(custs.flatMap((x) => x.lines)) }
    })
    return { list: out, g: tt(out.flatMap((c) => c.custs.flatMap((x) => x.lines))) }
  }, [rows, company, text, withGst])

  const build = () => {
    const cols = ['Inv.No', 'Date', 'Product', 'Pack', 'Batch', 'Qty', 'Free', 'Rate', 'Dis%', withGst ? 'WVRate' : 'WVORate', 'Value']
    const out = [], bold = []
    data.list.forEach((c) => {
      out.push(['Company : ' + c.company, '', '', '', '', '', '', '', '', '', '']); bold.push(out.length - 1)
      c.custs.forEach((x) => {
        out.push(['Customer : ' + x.party + (x.city ? '  *' + x.city : '') + (x.code ? '  *' + x.code : ''), '', '', '', '', '', '', '', '', '', '']); bold.push(out.length - 1)
        x.lines.forEach((r) => out.push([r.bill_no, dmy(r.d), r.product, r.pack || '', r.batch || '', r.qty, r.free, r.rate, r.dis, r2(unit(r)), r2(lineVal(r))]))
        out.push(['Total:', '', '', '', '', x.t.q, x.t.f, '', '', '', r2(x.t.v)]); bold.push(out.length - 1)
      })
      out.push(['Company total:', '', '', '', '', c.t.q, c.t.f, '', '', '', r2(c.t.v)]); bold.push(out.length - 1)
    })
    out.push(['Grand Total :', '', '', '', '', data.g.q, data.g.f, '', '', '', r2(data.g.v)]); bold.push(out.length - 1)
    return { title: 'Company Wise Customer Product Sales', subtitle: 'From ' + dmy(from) + ' To ' + dmy(to) + (company ? ' | ' + company : '') + (withGst ? ' | with GST' : ' | without GST'),
      filename: 'company-customer-sales', columns: cols, rows: out, bold, numCols: [5, 6, 7, 8, 9, 10] }
  }
  let shown = 0

  const nFilters = (company ? 1 : 0) + (text.trim() ? 1 : 0)
  const presetName = (PRESETS.find((x) => x[0] === preset) || [])[1]
  const summary = [preset === 'custom' ? dmy(from) + ' to ' + dmy(to) : presetName, company || null, text.trim() ? '"' + text.trim() + '"' : null, withGst ? 'with GST' : 'without GST'].filter(Boolean).join(' | ')
  const reset = () => { setPreset('month'); setDates(range('month')); setCompany(''); setText(''); setWithGst(false) }

  return (
    <>
      <FilterBar summary={summary} count={nFilters} onOpen={() => setOpen(true)} />
      <FilterSheet open={open} onClose={() => setOpen(false)} onReset={reset} title="Report filters">
        <Sec title="Period">
          <div className="qchips">{PRESETS.map(([k, l]) => <button key={k} className={'qc' + (preset === k ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}</div>
          {preset === 'custom' && <div className="dates"><input type="date" value={from} max={to} onChange={(e) => setDates([e.target.value, to])} /><input type="date" value={to} min={from} onChange={(e) => setDates([from, e.target.value])} /></div>}
        </Sec>
        <Sec title="Narrow down">
          <div className="fgrid" style={{ gridTemplateColumns: '1fr' }}>
            <select value={company} onChange={(e) => setCompany(e.target.value)}><option value="">All companies</option>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input className="fsel" type="search" placeholder="Filter by customer or product..." value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </Sec>
        <Sec title="Show values">
          <div className="seg" style={{ width: 'fit-content' }}>{[[false, 'Without GST'], [true, 'With GST']].map(([k, l]) => <button key={l} className={withGst === k ? 'on' : ''} onClick={() => setWithGst(k)}>{l}</button>)}</div>
        </Sec>
      </FilterSheet>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !data.list.length && <div className="empty"><b>No sales for these dates</b><span>For an earlier year, load it once with history.ps1.</span></div>}
      {rows && data.list.length > 0 && (
        <>
          <div className="minis" style={{ marginTop: 12 }}>
            <div className="mini"><span>Qty</span><b>{num(data.g.q)}</b></div>
            <div className="mini"><span>Free</span><b>{num(data.g.f)}</b></div>
            <div className="mini"><span>Value {withGst ? 'with' : 'without'} GST</span><b>{m2(data.g.v)}</b></div>
          </div>
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
          {data.list.map((c) => (
            <div key={c.company} style={{ marginTop: 14 }}>
              <h3 className="h2" style={{ margin: '0 0 6px' }}>Company : {c.company}</h3>
              {c.custs.map((x) => {
                if (shown >= limit) return null
                shown += x.lines.length + 1
                return (
                  <div key={x.party + x.code} className="chartcard" style={{ padding: 0, overflowX: 'auto', marginBottom: 10 }}>
                    <div style={{ padding: '8px 10px', fontWeight: 700 }}>{x.party} <span className="muted small">{x.city}{x.code ? ' | ' + x.code : ''}</span></div>
                    <table className="rtable">
                      <thead><tr><th style={{ textAlign: 'left' }}>Inv.No</th><th>Date</th><th style={{ textAlign: 'left' }}>Product</th><th>Pack</th><th>Batch</th><th>Qty</th><th>Free</th><th>Rate</th><th>Dis%</th><th>{withGst ? 'WVRate' : 'WVORate'}</th><th>Value</th></tr></thead>
                      <tbody>
                        {x.lines.map((r, i) => (
                          <tr key={i}><td style={{ textAlign: 'left' }}>{r.bill_no} <BillBtn no={r.bill_no} date={r.d} party={r.party} label="Copy" /></td><td style={{ whiteSpace: 'nowrap' }}>{dmy(r.d).slice(0, 5)}</td><td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.product}</td><td>{r.pack}</td><td>{r.batch}</td>
                            <td>{num(r.qty)}</td><td>{num(r.free)}</td><td>{m2(r.rate)}</td><td>{num(r.dis)}</td><td>{m2(unit(r))}</td><td>{m2(lineVal(r))}</td></tr>))}
                        <tr className="t"><td colSpan={5} style={{ textAlign: 'left' }}>Total:</td><td>{num(x.t.q)}</td><td>{num(x.t.f)}</td><td colSpan={3}></td><td>{m2(x.t.v)}</td></tr>
                      </tbody>
                    </table>
                  </div>)
              })}
              <div className="chartcard" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Total {c.company}</span><span>{num(c.t.q)} + {num(c.t.f)} free | {m2(c.t.v)}</span></div>
            </div>))}
          {shown >= limit && <button className="more" onClick={() => setLimit(limit + 200)}>Show more customers. The PDF and Excel include everything.</button>}
          <div className="chartcard" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Grand Total</span><span>{num(data.g.q)} + {num(data.g.f)} free | {m2(data.g.v)}</span></div>
        </>
      )}
    </>
  )
}
