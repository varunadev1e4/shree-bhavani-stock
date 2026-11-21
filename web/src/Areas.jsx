import { useEffect, useMemo, useState } from 'react'
import { fetchAll, rs, num, waLink, SHOP } from './util'
import ExportBar from './Export'
import { exportPdf } from './exporter'

// Sales and dues by area (the Area set on each customer in Profit Maker), to plan sales and collection trips.
const ymNow = () => { const t = new Date(); return t.getFullYear() * 100 + t.getMonth() + 1 }
const addYm = (ym, n) => { const t = Math.floor(ym / 100) * 12 + (ym % 100 - 1) + n; return Math.floor(t / 12) * 100 + (t % 12) + 1 }
const fyStart = () => { const t = new Date(); return (t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1) * 100 + 4 }
const PER = [['m', 'This month'], ['3', 'Last 3 months'], ['fy', 'This year']]
const SORT = [['sales', 'Sales'], ['due', 'Dues'], ['name', 'A to Z']]
const lc = (s) => String(s || '').trim().toLowerCase()

export default function Areas() {
  const [per, setPer] = useState('3')
  const [sort, setSort] = useState('due')
  const [parties, setParties] = useState(null)
  const [sales, setSales] = useState(null)
  const [openA, setOpenA] = useState('')
  const [noArea, setNoArea] = useState(false)

  useEffect(() => {
    (async () => {
      const cols = 'id,name,city,phone,phone2,receivable,age_30,age_60,age_90,age_90p'
      try { setParties(await fetchAll('parties', cols + ',area', undefined, 'areas-p')) }
      catch (e) { setNoArea(true); setParties(await fetchAll('parties', cols, undefined, 'areas-p0').catch(() => [])) }
    })()
  }, [])
  const from = per === 'm' ? ymNow() : per === '3' ? addYm(ymNow(), -2) : fyStart()
  useEffect(() => {
    let stale = false
    setSales(null)
    fetchAll('fy_party_monthly', 'ym,party,amount', (q) => q.gte('ym', from), 'areas-s:' + from).then((d) => { if (!stale) setSales(d) }).catch(() => { if (!stale) setSales([]) })
    return () => { stale = true }
  }, [from])

  const areas = useMemo(() => {
    if (!parties || !sales) return null
    const bySale = new Map()
    sales.forEach((r) => bySale.set(lc(r.party), (bySale.get(lc(r.party)) || 0) + Number(r.amount)))
    const m = new Map()
    parties.forEach((p) => {
      const sale = bySale.get(lc(p.name)) || 0, due = Number(p.receivable) || 0
      if (sale <= 0 && due <= 0.5) return
      const a = (noArea ? p.city : p.area) || 'No area set'
      if (!m.has(a)) m.set(a, { area: a, custs: [], sales: 0, due: 0, over: 0 })
      const x = m.get(a)
      const over = (Number(p.age_90) || 0) + (Number(p.age_90p) || 0)
      x.custs.push({ ...p, sale, due, over }); x.sales += sale; x.due += due; x.over += over
    })
    const out = [...m.values()]
    out.forEach((a) => a.custs.sort((p, q) => q.due - p.due || q.sale - p.sale))
    return out.sort((a, b) => sort === 'sales' ? b.sales - a.sales : sort === 'due' ? b.due - a.due : a.area.localeCompare(b.area))
  }, [parties, sales, sort, noArea])

  const total = (areas || []).reduce((s, a) => ({ sales: s.sales + a.sales, due: s.due + a.due }), { sales: 0, due: 0 })
  const perName = (PER.find((x) => x[0] === per) || [])[1]
  const buildAll = () => ({ title: 'Sales and dues by ' + (noArea ? 'city' : 'area'), subtitle: perName + ' | ' + SHOP, filename: 'areas', columns: [noArea ? 'City' : 'Area', 'Customers', 'Sales', 'Pending', 'Over 60 days'], numCols: [1, 2, 3, 4],
    rows: [...areas.map((a) => [a.area, a.custs.length, Math.round(a.sales), Math.round(a.due), Math.round(a.over)]), ['TOTAL', '', Math.round(total.sales), Math.round(total.due), '']], bold: [areas.length] })
  const tripPdf = (a) => {
    const list = a.custs.filter((c) => c.due > 0.5)
    return exportPdf({ title: 'Collection list: ' + a.area, subtitle: SHOP + ' | customers with pending bills, highest first', filename: 'collect-' + a.area.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), columns: ['Customer', 'City', 'Phone', 'Pending', 'Over 60 days'], numCols: [3, 4],
      rows: [...list.map((c) => [c.name, c.city || '', c.phone || c.phone2 || '', Math.round(c.due), Math.round(c.over)]), ['TOTAL', '', '', Math.round(list.reduce((s, c) => s + c.due, 0)), Math.round(list.reduce((s, c) => s + c.over, 0))]], bold: [list.length] })
  }

  return (
    <div>
      <div className="qchips">{PER.map(([k, l]) => <button key={k} className={'qc' + (per === k ? ' on' : '')} onClick={() => setPer(k)}>{l}</button>)}</div>
      <div className="qchips">{SORT.map(([k, l]) => <button key={k} className={'qc' + (sort === k ? ' on' : '')} onClick={() => setSort(k)}>Sort: {l}</button>)}</div>
      {noArea && <p className="muted small">Areas are not loaded yet, so customers are grouped by city. Run migration-21.sql, then run-sync.bat.</p>}
      {!areas && <p className="muted pad">Loading...</p>}
      {areas && !areas.length && <div className="empty"><b>No sales or dues found</b></div>}
      {areas && areas.length > 0 && (
        <>
          <div className="minis" style={{ marginTop: 12 }}>
            <div className="mini"><span>{noArea ? 'Cities' : 'Areas'}</span><b>{areas.length}</b></div>
            <div className="mini"><span>Sales</span><b>{rs(total.sales)}</b></div>
            <div className="mini"><span>Pending</span><b>{rs(total.due)}</b></div>
          </div>
          <div style={{ margin: '12px 0 4px' }}><ExportBar build={buildAll} /></div>
          {areas.map((a) => {
            const on = openA === a.area
            return (
              <div key={a.area} className="chartcard" style={{ padding: 0, marginBottom: 8, overflowX: 'auto' }}>
                <button className="row" style={{ width: '100%', padding: '10px 12px' }} onClick={() => setOpenA(on ? '' : a.area)}>
                  <div className="info"><div className="name">{a.area}</div><div className="meta"><span>{a.custs.length} customers</span><span>Sales {rs(a.sales)}</span>{a.over > 0.5 && <span className="pill expired">61+ days {rs(a.over)}</span>}</div></div>
                  <div className={'amt' + (a.due > 0.5 ? ' due' : '')}>{rs(a.due)}</div>
                </button>
                {on && (
                  <>
                    <div className="btnrow" style={{ padding: '0 12px' }}><button className="ghost sm" onClick={() => tripPdf(a)}>Collection list PDF</button></div>
                    <table className="rtable">
                      <thead><tr><th style={{ textAlign: 'left' }}>Customer</th><th>Sales</th><th>Pending</th><th>61+ d</th></tr></thead>
                      <tbody>{a.custs.map((c) => {
                        const ph = c.phone || c.phone2
                        return <tr key={c.id}><td style={{ textAlign: 'left', whiteSpace: 'normal' }}><b>{c.name}</b> <span className="muted small">{c.city}</span>{ph && <div className="small"><a href={'tel:' + String(ph).replace(/\D/g, '')}>Call</a> | <a target="_blank" rel="noreferrer" href={waLink(ph, 'Dear ' + c.name + ', greetings from ' + SHOP + '.')}>WhatsApp</a></div>}</td>
                          <td>{num(Math.round(c.sale))}</td><td><b>{num(Math.round(c.due))}</b></td><td>{c.over > 0.5 ? num(Math.round(c.over)) : ''}</td></tr>
                      })}</tbody>
                    </table>
                  </>
                )}
              </div>)
          })}
        </>
      )}
    </div>
  )
}
