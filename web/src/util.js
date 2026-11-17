import { supabase } from './supabase'

export const num = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }))
export const rs = (v) => '\u20B9' + Math.round(Number(v) || 0).toLocaleString('en-IN')
export const fmtExp = (k) => (k ? String(k % 100).padStart(2, '0') + '/' + Math.floor(k / 100) : '-')
export const mk = (off = 0) => { const d = new Date(); d.setMonth(d.getMonth() + off); return d.getFullYear() * 100 + d.getMonth() + 1 }
export const expState = (k) => (!k ? '' : k < mk(0) ? 'expired' : k <= mk(3) ? 'soon' : '')
export const waLink = (phone, text) => {
  let d = (phone || '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10) d = '91' + d
  return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text)
}

export async function fetchAll(table, cols, filter) {
  let all = [], from = 0
  for (;;) {
    let q = supabase.from(table).select(cols).order('id').range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

export const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
export const ini = (s) => String(s).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

export function backupAge(row) {
  if (!row) return { text: 'No data yet', cls: 'bad' }
  const m = /_(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{2})/.exec(row.source || '')
  const d = m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) : new Date(row.ran_at)
  const h = (Date.now() - d) / 36e5
  const t = d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return { text: 'Data as of ' + t, cls: h <= 26 ? 'good' : h <= 50 ? 'warn' : 'bad' }
}