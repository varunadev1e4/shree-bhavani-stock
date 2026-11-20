import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, num } from './util'
import ExportBar from './Export'
import FullReport from './FullReport'
import FilterSheet, { FilterBar, Sec } from './FilterSheet'

const DIMS = { company: 'Company', party: 'Customer', product: 'Product', city: 'City', month: 'Month', day: 'Day', bill: 'Bill' }
const QUICK = [['Customer-wise', ['party']], ['Company-wise', ['company']], ['Product-wise', ['product']], ['Company, then customer', ['company', 'party']], ['Customer, then company', ['party', 'company']], ['Company, then product', ['company', 'product']], ['City, then customer', ['city', 'party']], ['Day-wise', ['day']], ['Month-wise', ['month']]]
const PRESETS = [['today', 'Today'], ['yday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom']]
const KEY = { company: (r) => r.company || 'Other', party: (r) => r.party, product: (r) => r.product, city: (r) => r.city || '-', month: (r) => r.d.slice(0, 7), day: (r) => r.d, bill: (r) => r.bill_no + ' / ' + r.party }
const fmtDay = (s) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const LABEL = { month: (k) => new Date(k + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), day: fmtDay }
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

function range(p) {
  const t = new Date(), y = new Date(t); y.setDate(t.getDate() - 1)
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  const m1 = new Date(t.getFullYear(), t.getMonth(), 1)
  const l1 = new Date(t.getFullYear(), t.getMonth() - 1, 1), l2 = new Date(t.getFullYear(), t.getMonth(), 0)
  const fy = new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1)
  return ({ today: [t, t], yday: [y, y], week: [mon, t], month: [m1, t], lmonth: [l1, l2], year: [fy, t] })[p].map(iso)
}

function aggregate(rows, dims, val) {
  const mk = (key) => ({ key, value: 0, qty: 0, free: 0, bills: new Set(), kids: new Map() })
  const root = mk('')
  rows.forEach((r) => {
    let n = root; const path = [root]
    dims.forEach((d) => { const k = KEY[d](r); if (!n.kids.has(k)) n.kids.set(k, mk(k)); n = n.kids.get(k); path.push(n) })
    path.forEach((x) => { x.value += val(r); x.qty += Number(r.qty); x.free += Number(r.free) || 0; x.bills.add(r.bill_no + '|' + r.party) })
  })
  return root
}
function flatten(node, dims, depth = 0, out = [], prefix = []) {
  const asc = dims[depth] === 'month' || dims[depth] === 'day'
  ;[...node.kids.values()].sort(asc ? (a, b) => a.key.localeCompare(b.key) : (a, b) => b.value - a.value).forEach((k) => {
    const label = (LABEL[dims[depth]] || ((x) => x))(k.key), path = [...prefix, label]
    out.push({ depth, label, path, value: k.value, qty: k.qty, free: k.free, bills: k.bills.size, leaf: depth === dims.length - 1 })
    flatten(k, dims, depth + 1, out, path)
  })
  return out
}

export default function Reports() {
  const [mode, setMode] = useState('sum')
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('S')
  const [preset, setPreset] = useState('month')
  const [[from, to], setDates] = useState(range('month'))
  const [dims, setDims] = useState(['party'])
  const [company, setCompany] = useState('')
  const [text, setText] = useState('')
  const [terms, setTerms] = useState('all')
  const [exGst, setExGst] = useState(false)
  const [rows, setRows] = useState(null)
  const [limit, setLimit] = useState(150)

  useEffect(() => {
    let stale = false
    setRows(null)
    fetchAll('sales_lines', 'd,bill_no,party,city,company,product,qty,free,amount,gst,terms', (q) => q.eq('kind', kind).gte('d', from).lte('d', to))
      .then((d) => { if (!stale) setRows(d) }).catch(() => { if (!stale) setRows([]) })
    return () => { stale = true }
  }, [kind, from, to])
  useEffect(() => { setLimit(150) }, [dims, company, text, terms, rows])

  const pick = (p) => { setPreset(p); if (p !== 'custom') setDates(range(p)) }
  const companies = useMemo(() => [...new Set((rows || []).map((r) => r.company || 'Other'))].sort(), [rows])
  // amount is the value after discount and before GST; with GST it matches the bill totals
  const val = (r) => (exGst ? Number(r.amount) : Number(r.amount) * (1 + (Number(r.gst) || 0) / 100))

  const filtered = useMemo(() => {
    const w = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return (rows || []).filter((r) => (!company || (r.company || 'Other') === company) && (terms === 'all' || kind === 'P' || Number(r.terms) === Number(terms))
      && w.every((x) => (r.party + ' ' + r.product + ' ' + r.company + ' ' + r.city).toLowerCase().includes(x)))
  }, [rows, company, text, terms, kind])

  const tree = useMemo(() => aggregate(filtered, dims, val), [filtered, dims, exGst])
  const flat = useMemo(() => flatten(tree, dims), [tree, dims])
  const tot = { value: tree.value, qty: tree.qty, free: tree.free, bills: tree.bills.size }
  const name = kind === 'S' ? 'Sales' : 'Purchases'
  const dimNames = dims.map((d) => DIMS[d])
  const title = name + ' report: ' + (dimNames.join(' > ') || 'Total')
  const sub = fmtDay(from) + ' to ' + fmtDay(to) + (company ? ' | ' + company : '') + (text ? ' | "' + text + '"' : '') + (exGst ? ' | before GST' : ' | incl. GST') + (terms !== 'all' && kind === 'S' ? (Number(terms) === 1 ? ' | credit bills' : ' | cash bills') : '')

  const build = () => {
    const pdf = flat.map((f) => ['   '.repeat(f.depth) + f.label, f.value, f.qty, f.free, f.bills, tot.value ? Math.round((f.value / tot.value) * 1000) / 10 + '%' : ''])
    const bold = flat.map((f, i) => (f.leaf ? -1 : i)).filter((i) => i >= 0)
    pdf.push(['TOTAL', tot.value, tot.qty, tot.free, tot.bills, '']); bold.push(pdf.length - 1)
    const leaves = flat.filter((f) => f.leaf)
    return {
      title, subtitle: sub, filename: name.toLowerCase() + '-report', columns: ['Name', 'Value (Rs)', 'Qty', 'Free', 'Bills', 'Share'], rows: pdf, bold, numCols: [1, 2, 3, 4, 5],
      xlsx: { columns: [...dimNames, 'Value (Rs)', 'Qty', 'Free', 'Bills'], rows: [...leaves.map((f) => [...f.path, f.value, f.qty, f.free, f.bills]), [...dimNames.map((_, i) => (i === 0 ? 'TOTAL' : '')), tot.value, tot.qty, tot.free, tot.bills]] },
    }
  }
  const setDim = (i, v) => setDims((d) => { const n = [...d]; if (v) n[i] = v; else n.splice(i); return n.filter((x, j) => n.indexOf(x) === j) })

  const modeSeg = <div className="seg" style={{ width: 'fit-content', marginBottom: 10 }}>{[['sum', 'Summary'], ['full', 'Full lines']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
  if (mode === 'full') return <>{modeSeg}<FullReport /></>

  const nFilters = (company ? 1 : 0) + (text.trim() ? 1 : 0) + (terms !== 'all' ? 1 : 0)
  const presetName = (PRESETS.find((x) => x[0] === preset) || [])[1]
  const summary = [preset === 'custom' ? fmtDay(from) + ' to ' + fmtDay(to) : presetName, dimNames.length ? 'by ' + dimNames.join(' > ') : null, company || null, text.trim() ? '"' + text.trim() + '"' : null,
    exGst ? 'before GST' : 'with GST', kind === 'S' && terms === '1' ? 'credit only' : kind === 'S' && terms === '0' ? 'cash only' : null].filter(Boolean).join(' | ')
  const reset = () => { setPreset('month'); setDates(range('month')); setCompany(''); setText(''); setTerms('all'); setExGst(false) }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {modeSeg}
        <div className="seg" style={{ marginBottom: 10 }}>{[['S', 'Sales'], ['P', 'Purchases']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      </div>
      <FilterBar summary={summary} count={nFilters} onOpen={() => setOpen(true)} />
      <FilterSheet open={open} onClose={() => setOpen(false)} onReset={reset} title="Report filters">
        <Sec title="Period">
          <div className="qchips">{PRESETS.map(([k, l]) => <button key={k} className={'qc' + (preset === k ? ' on' : '')} onClick={() => pick(k)}>{l}</button>)}</div>
          {preset === 'custom' && <div className="dates"><input type="date" value={from} max={to} onChange={(e) => setDates([e.target.value, to])} /><input type="date" value={to} min={from} onChange={(e) => setDates([from, e.target.value])} /></div>}
        </Sec>
        <Sec title="Group the report by">
          <div className="qchips">{QUICK.map(([l, d]) => <button key={l} className={'qc' + (dims.join() === d.join() ? ' on' : '')} onClick={() => setDims(d)}>{l}</button>)}</div>
          <div className="fgrid">{[0, 1, 2].map((i) => (
            <select key={i} value={dims[i] || ''} disabled={i > dims.length} onChange={(e) => setDim(i, e.target.value)}>
              <option value="">{i === 0 ? 'Group by...' : 'Then by...'}</option>{Object.entries(DIMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>))}</div>
        </Sec>
        <Sec title="Narrow down">
          <div className="fgrid" style={{ gridTemplateColumns: '1fr' }}>
            <select value={company} onChange={(e) => setCompany(e.target.value)}><option value="">All companies</option>{companies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input className="fsel" type="search" placeholder="Filter by name..." value={text} onChange={(e) => setText(e.target.value)} />
            {kind === 'S' && <select value={terms} onChange={(e) => setTerms(e.target.value)}><option value="all">Cash + credit</option><option value="1">Credit only</option><option value="0">Cash only</option></select>}
          </div>
        </Sec>
        <Sec title="Show values">
          <div className="seg" style={{ width: 'fit-content' }}>{[[false, 'With GST'], [true, 'Before GST']].map(([k, l]) => <button key={l} className={exGst === k ? 'on' : ''} onClick={() => setExGst(k)}>{l}</button>)}</div>
        </Sec>
      </FilterSheet>

      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !filtered.length && <div className="empty"><b>No data for these dates</b><span>For an earlier year, load it once with history.ps1.</span></div>}
      {rows && filtered.length > 0 && (
        <>
          <div className="minis" style={{ marginTop: 12 }}>
            <div className="mini"><span>{name} value</span><b>{rs(tot.value)}</b></div>
            <div className="mini"><span>Qty + free</span><b>{num(tot.qty)} + {num(tot.free)}</b></div>
            <div className="mini"><span>Bills</span><b>{tot.bills}</b></div>
          </div>
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>
          <div className="chartcard" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rtable">
              <thead><tr><th>{dimNames.join(' > ') || 'Total'}</th><th>Value</th><th>Qty</th><th>Free</th><th>Bills</th></tr></thead>
              <tbody>
                {flat.slice(0, limit).map((f, i) => (
                  <tr key={i} className={f.depth === 0 && dims.length > 1 ? 'g' : ''}>
                    <td style={{ paddingLeft: 10 + f.depth * 16 }}>{f.label}</td><td>{Math.round(f.value).toLocaleString('en-IN')}</td><td>{num(f.qty)}</td><td>{num(f.free)}</td><td>{f.bills}</td>
                  </tr>))}
                <tr className="t"><td>Total</td><td>{Math.round(tot.value).toLocaleString('en-IN')}</td><td>{num(tot.qty)}</td><td>{num(tot.free)}</td><td>{tot.bills}</td></tr>
              </tbody>
            </table>
          </div>
          {flat.length > limit && <button className="more" onClick={() => setLimit(limit + 150)}>Show more ({flat.length - limit} rows left). The PDF and Excel include everything.</button>}
        </>
      )}
    </>
  )
}
