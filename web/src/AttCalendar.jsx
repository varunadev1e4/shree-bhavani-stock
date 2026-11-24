import { supabase } from './supabase'
import { daysIn, inMonth } from './staffcalc'
import { iso } from './expcommon'

// Month calendar of one employee: plain days = present, red absent, amber half day, blue paid leave.
// Pass onPick(dateIso) to let the owner tap a day to change it.
export const ATT = ['absent', 'half', 'paidleave']
const COLOR = { absent: 'var(--bad)', half: 'var(--warn)', paidleave: 'var(--accent)' }

export async function setAttendance(empId, d, kind) {
  const del = await supabase.from('emp_entries').delete().eq('emp_id', empId).eq('d', d).in('kind', ATT)
  if (del.error) return del.error
  if (!kind) return null
  const { error } = await supabase.from('emp_entries').insert({ emp_id: empId, d, kind, amount: kind === 'half' ? 0.5 : 1 })
  return error || null
}

export default function AttCalendar({ ym, entries, onPick, picked }) {
  const days = daysIn(ym), y = Math.floor(ym / 100), m = ym % 100
  const mine = entries.filter((e) => ATT.includes(e.kind) && inMonth(e.d, ym))
  const dateOf = (day) => y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0')
  const lead = new Date(y, m - 1, 1).getDay(), today = iso(new Date())
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(<i key={'b' + i} />)
  for (let day = 1; day <= days; day++) {
    const d = dateOf(day), k = (mine.find((e) => e.d === d) || {}).kind || '', fut = d > today
    const Tag = onPick ? 'button' : 'div'
    cells.push(
      <Tag key={day} onClick={onPick ? () => onPick(d) : undefined}
        style={{ textAlign: 'center', padding: '8px 0', borderRadius: 8, background: k ? COLOR[k] : 'transparent', color: k ? '#fff' : fut ? 'var(--muted)' : 'inherit', border: picked === d ? '2px solid var(--text, currentColor)' : k ? 0 : '1px solid var(--line)', fontWeight: 600, font: 'inherit', cursor: onPick ? 'pointer' : 'default' }}>{day}</Tag>)
  }
  return (
    <div className="chartcard">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8, textAlign: 'center' }} className="muted small">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i}>{x}</span>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>{cells}</div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>Plain days = present. <b style={{ color: 'var(--bad)' }}>Red</b> absent, <b style={{ color: 'var(--warn)' }}>amber</b> half day, <b style={{ color: 'var(--accent)' }}>blue</b> paid leave.{onPick ? ' Tap a day to change it.' : ''}</p>
    </div>
  )
}
