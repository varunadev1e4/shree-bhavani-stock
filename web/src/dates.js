// Shared date helpers for the report screens
export const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
export const dmy = (s) => String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4)
export const PRESETS = [['month', 'This month'], ['lmonth', 'Last month'], ['3m', 'Last 3 months'], ['year', 'This year'], ['custom', 'Choose dates']]
export function range(p) {
  const t = new Date()
  const fy = new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1)
  return ({ month: [new Date(t.getFullYear(), t.getMonth(), 1), t], lmonth: [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)], '3m': [new Date(t.getFullYear(), t.getMonth() - 2, 1), t], year: [fy, t] })[p].map(iso)
}
export const m2 = (v) => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
