import { useEffect, useMemo, useState } from 'react'
import { fetchAll, num, SHOP } from './util'
import { exportPdf } from './exporter'
import ExportBar from './Export'
import FilterSheet, { FilterBar, Sec } from './FilterSheet'
import { PRESETS, range, dmy, m2, r2 } from './dates'

// Free goods given on sales bills: company > customer > bill lines, ready to send to each company every month.
const COLS = ['Customer', 'Date', 'Bill', 'Product', 'Pack', 'Batch', 'Qty', 'Free', 'Rate', 'Free value']
const freeVal = (r) => Number(r.free) * Number(r.rate || 0)

export default function FreeGoods() {
  const [preset, setPreset] = useState('lmonth')
  const [[from, to], setDates] = useState(range('lmonth'))
  const [company, setCompany] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let stale = false
    setRows(null)
    fetchAll('sales_lines', 'd,bill_no,party,city,company,product,pack,batch,qty,free,rate,dis', (q) => q.eq('kind', 'S').gt('free', 0).gte('d', from).lte('d', to), 'free:' + from + ':' + to)
      .then((d) => { if (!stale) setRows(d) }).catch(() => { if (!stale) setRows([]) })
    return () => { stale = true }
  }, [from, to])
  const pick = (p) => { setPreset(p); if (p !== 'custom') setDates(range(p)) }
  const companies = useMemo(() => [...new Set((rows || []).map((r) => r.company || 'Other'))].sort(), [rows])

  const data = useMemo(() => {
    const w = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const comp = new Map()
    ;(rows || []).filter((r) => (!company || (r.company || 'Other') === company) && w.every((x) => (r.party + ' ' + r.product).toLowerCase().includes(x))).forEach((r) => {
      const c = r.company || 'Other'
      if (!comp.has(c)) comp.set(c, new Map())
      const cm = comp.get(c)
      if (!cm.has(r.party)) cm.set(r.party, { party: r.party, city: r.city, lines: [] })
      cm.get(r.party).lines.push(r)
    })
    const tt = (ls) => ls.reduce((s, r) => ({ q: s.q + Number(r.qty), f: s.f + Number(r.free), v: s.v + freeVal(r) }), { q: 0, f: 0, v: 0 })
    const list = [...comp.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, cm]) => {
      const custs = [...cm.values()].sort((a, b) => a.party.localeCompare(b.party)).map((x) => {
        x.lines.sort((a, b) => a.d.localeCompare(b.d) || a.bill_no.localeCompare(b.bill_no, 'en', { numeric: true }))
        return { ...x, t: tt(x.lines) }
      })
      return { company: c, custs, t: tt(custs.flatMap((x) => x.lines)) }
    })
    return { list, g: tt(list.flatMap((c) => c.custs.flatMap((x) => x.lines))) }
  }, [rows, company, text])

  const sub = (c) => 'Period: ' + dmy(from) + ' to ' + dmy(to) + ' | From: ' + SHOP
  const tableFor = (c) => {
    const out = [], bold = []
    c.custs.forEach((x) => {
      x.lines.forEach((r) => out.push([x.party, dmy(r.d), r.bill_no, r.product, r.pack || '', r.batch || '', Number(r.qty), Number(r.free), Number(r.rate), r2(freeVal(r))]))
      out.push([x.party + ' total', '', '', '', '', '', x.t.q, x.t.f, '', r2(x.t.v)]); bold.push(out.length - 1)
    })
    out.push(['TOTAL ' + c.company, '', '', '', '', '', c.t.q, c.t.f, '', r2(c.t.v)]); bold.push(out.length - 1)
    return { out, bold }
  }
  const sharePdf = async (c) => {
    setBusy(c.company)
    try { const { out, bold } = tableFor(c); await exportPdf({ title: 'FREE GOODS GIVEN - ' + c.company, subtitle: sub(c), filename: 'free-goods-' + c.company.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + from, columns: COLS, rows: out, bold, numCols: [6, 7, 8, 9] }) } catch (e) { /* user cancelled */ }
    setBusy('')
  }
  const buildAll = () => {
    const out = [], bold = []
    data.list.forEach((c) => { out.push(['Company : ' + c.company, '', '', '', '', '', '', '', '', '']); bold.push(out.length - 1); const t = tableFor(c); t.bold.forEach((b) => bold.push(out.length + b)); out.push(...t.out) })
    out.push(['GRAND TOTAL', '', '', '', '', '', data.g.q, data.g.f, '', r2(data.g.v)]); bold.push(out.length - 1)
    return { title: 'Free goods given', subtitle: sub(), filename: 'free-goods-' + from, columns: COLS, rows: out, bold, numCols: [6, 7, 8, 9] }
  }

  const nF = (company ? 1 : 0) + (text.trim() ? 1 : 0)
  const presetName = (PRESETS.find((x) => x[0] === preset) || [])[1]
  const summary = [preset === 'custom' ? dmy(from) + ' to ' + dmy(to) : presetName, company || null, text.trim() ? '"' + text.trim() + '"' : null].filter(Boolean).join(' | ')
  const reset = () => { setPreset('lmonth'); setDates(range('lmonth')); setCompany(''); setText('') }

  return (
    <>
      <FilterBar summary={summary} count={nF} onOpen={() => setOpen(true)} />
      <FilterSheet open={open} onClose={() => setOpen(false)} onReset={reset} title="Free goods filters">
        <Sec title="Period">
          <div className="qchips">{PRESETS.map(([k, l]) => <button key={k} className={'qc' + (preset === k ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}</div>
          {preset === 'custom' && <div className="dates"><input type="date" value={from} max={to} onChange={(e) => setDates([e.target.value, to])} /><input type="date" value={to} min={from} onChange={(e) => setDates([from, e.target.value])} /></div>}
        </Sec>
        <Sec title="Narrow down">
          <div className="fgrid" style={{ gridTemplateColumns: '1fr' }}>
            <select value={company} onChange={(e) => setCompany(e.target.value)}><option value="">All companies</option>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input className="fsel" type="search" placeholder="Customer or product..." value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </Sec>
      </FilterSheet>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !data.list.length && <div className="empty"><b>No free goods in these dates</b><span>For an earlier year, load it once with history.ps1.</span></div>}
      {rows && data.list.length > 0 && (
        <>
          <div className="minis" style={{ marginTop: 12 }}>
            <div className="mini"><span>Free units</span><b>{num(data.g.f)}</b></div>
            <div className="mini"><span>Value at rate</span><b>{m2(data.g.v)}</b></div>
            <div className="mini"><span>Companies</span><b>{data.list.length}</b></div>
          </div>
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={buildAll} /></div>
          <p className="muted small" style={{ margin: '0 0 6px' }}>Tap Share PDF on a company to send its own list. Value = free units x selling rate.</p>
          {data.list.map((c) => (
            <div key={c.company} style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h3 className="h2" style={{ margin: 0 }}>{c.company} <span className="muted small">{num(c.t.f)} free | {m2(c.t.v)}</span></h3>
                <button className="ghost sm" disabled={!!busy} onClick={() => sharePdf(c)}>{busy === c.company ? 'Making...' : 'Share PDF'}</button>
              </div>
              {c.custs.map((x) => (
                <div key={x.party} className="chartcard" style={{ padding: 0, overflowX: 'auto', margin: '8px 0 0' }}>
                  <div style={{ padding: '8px 10px', fontWeight: 700 }}>{x.party} <span className="muted small">{x.city}</span></div>
                  <table className="rtable">
                    <thead><tr><th style={{ textAlign: 'left' }}>Date</th><th style={{ textAlign: 'left' }}>Bill</th><th style={{ textAlign: 'left' }}>Product</th><th>Batch</th><th>Qty</th><th>Free</th><th>Rate</th><th>Value</th></tr></thead>
                    <tbody>
                      {x.lines.map((r, i) => <tr key={i}><td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{dmy(r.d).slice(0, 5)}</td><td style={{ textAlign: 'left' }}>{r.bill_no}</td><td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.product} <span className="muted small">{r.pack}</span></td><td>{r.batch}</td><td>{num(r.qty)}</td><td><b>{num(r.free)}</b></td><td>{m2(r.rate)}</td><td>{m2(freeVal(r))}</td></tr>)}
                      <tr className="t"><td colSpan={4} style={{ textAlign: 'left' }}>Total</td><td>{num(x.t.q)}</td><td>{num(x.t.f)}</td><td></td><td>{m2(x.t.v)}</td></tr>
                    </tbody>
                  </table>
                </div>))}
            </div>))}
        </>
      )}
    </>
  )
}
