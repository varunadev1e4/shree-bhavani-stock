import { useEffect, useState } from 'react'
import { fetchAll, rs, addYm, waLink, SHOP } from './util'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const AGE = [['0-30', '#16a34a'], ['31-60', '#d97706'], ['61-90', '#ea580c'], ['90+', '#dc2626']]

export default function Customer({ p, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    fetchAll('fy_party_monthly', 'ym,amount', (q) => q.eq('party', p.name), 'cust:' + p.id).then(setRows).catch(() => setRows([]))
  }, [p.id, p.name])

  const m = new Map()
  ;(rows || []).forEach((r) => m.set(r.ym, (m.get(r.ym) || 0) + Number(r.amount)))
  const end = m.size ? Math.max(...m.keys()) : 0
  const months = end ? Array.from({ length: 12 }, (_, i) => addYm(end, i - 11)) : []
  const vals = months.map((ym) => m.get(ym) || 0)
  const mx = Math.max(1, ...vals)
  const ph = p.phone || p.phone2
  const ages = [p.age_30, p.age_60, p.age_90, p.age_90p].map((v) => Number(v) || 0)
  const ageTotal = ages.reduce((s, v) => s + v, 0)
  const last = p.last_sale ? new Date(p.last_sale).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No sale on record'

  return (
    <div className="sheet">
      <button className="ghost sm" onClick={onClose}>Back</button>
      <h1 className="h1" style={{ marginTop: 12 }}>{p.name}</h1>
      <div className="muted small">{[p.city, p.code].filter(Boolean).join(' · ')}</div>
      {ph && (
        <div className="btnrow">
          <a className="ghost sm" href={'tel:' + ph.replace(/\D/g, '')}>Call {ph}</a>
          <a className="ghost sm" target="_blank" rel="noreferrer" href={waLink(ph, 'Hello ' + p.name + ', greetings from ' + SHOP + '.')}>WhatsApp</a>
        </div>
      )}
      <div className="minis" style={{ marginTop: 14 }}>
        <div className="mini"><span>They owe you</span><b>{rs(p.receivable)}</b></div>
        <div className="mini"><span>You owe them</span><b>{rs(p.payable)}</b></div>
        <div className="mini"><span>Last bill</span><b style={{ fontSize: 15 }}>{last}</b></div>
      </div>
      <h2 className="h2">Purchases, last 12 months</h2>
      <div className="chartcard">
        {!rows ? <div className="sk line" /> : !months.length ? <p className="muted pad">No purchase history yet.</p> : (
          <svg viewBox="0 0 300 120" className="chart">
            {vals.map((v, i) => { const h = (v / mx) * 84; return (
              <g key={i}><rect x={i * 25 + 3} y={96 - h} width="19" height={h} rx="5" fill={i === 11 ? '#0d9488' : '#94a3b8'} />
                <text x={i * 25 + 12.5} y="112" textAnchor="middle" className="gt">{MON[(months[i] % 100) - 1]}</text></g>) })}
          </svg>
        )}
        {rows && months.length > 0 && <p className="muted small" style={{ margin: '6px 6px 0' }}>Total {rs(vals.reduce((s, v) => s + v, 0))} · best month {rs(mx)}</p>}
      </div>
      {ageTotal > 0.5 && (
        <>
          <h2 className="h2">Overdue ageing</h2>
          <div className="chartcard">
            <div className="stack">{ages.map((v, i) => v > 0 && <i key={i} style={{ width: (v / ageTotal) * 100 + '%', background: AGE[i][1] }} />)}</div>
            <div className="legend">{ages.map((v, i) => <span key={i}><i style={{ background: AGE[i][1] }} />{AGE[i][0]} days: <b>{rs(v)}</b></span>)}</div>
          </div>
        </>
      )}
    </div>
  )
}
