import { useState } from 'react'
import { useBackLayer } from './backstack'

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const curYm = () => { const t = new Date(); return t.getFullYear() * 100 + t.getMonth() + 1 }
export const ymName = (ym) => FULL[(ym % 100) - 1] + ' ' + Math.floor(ym / 100)
const step = (ym, n) => { const t = Math.floor(ym / 100) * 12 + (ym % 100 - 1) + n; return Math.floor(t / 12) * 100 + (t % 12) + 1 }

// Month chooser: arrows for next/previous month, tap the name to jump to any month of any year.
export default function MonthPick({ ym, onChange }) {
  const [open, setOpen] = useState(false)
  useBackLayer(open, () => setOpen(false))
  const [yr, setYr] = useState(Math.floor(ym / 100))
  const now = curYm(), nowY = Math.floor(now / 100)
  const arrow = { width: 40, height: 40, border: 0, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 22, fontWeight: 700 }
  return (
    <div style={{ margin: '0 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: 6 }}>
        <button style={arrow} aria-label="Previous month" onClick={() => onChange(step(ym, -1))}>&#8249;</button>
        <button style={{ flex: 1, border: 0, background: 'none', fontWeight: 700, fontSize: 16 }} onClick={() => { setYr(Math.floor(ym / 100)); setOpen(!open) }}>{ymName(ym)} <span className="muted small">&#9662;</span></button>
        <button style={{ ...arrow, opacity: ym >= now ? 0.35 : 1 }} disabled={ym >= now} aria-label="Next month" onClick={() => onChange(step(ym, 1))}>&#8250;</button>
      </div>
      {open && (
        <div style={{ background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button style={arrow} onClick={() => setYr(yr - 1)}>&#8249;</button><b>{yr}</b>
            <button style={{ ...arrow, opacity: yr >= nowY ? 0.35 : 1 }} disabled={yr >= nowY} onClick={() => setYr(yr + 1)}>&#8250;</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {NAMES.map((m, i) => { const v = yr * 100 + i + 1, on = v === ym, off = v > now
              return <button key={m} disabled={off} onClick={() => { onChange(v); setOpen(false) }}
                style={{ padding: '10px 0', borderRadius: 12, border: 0, fontWeight: 600, background: on ? 'var(--accent)' : 'var(--bg)', color: on ? '#fff' : 'inherit', opacity: off ? 0.35 : 1 }}>{m}</button> })}
          </div>
        </div>)}
    </div>
  )
}
