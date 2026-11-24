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

async function rawFetchAll(table, cols, filter) {
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

// Reads EVERY row of a table, 1000 at a time. The server never returns more than 1000 rows in one request, so a plain .select() or .limit(5000) quietly stops at 1000. Use this for anything that can grow.
export const fetchPaged = rawFetchAll

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

// Offline support: remember the last good answer and use it when the network fails.
export async function cached(key, fn) {
  try {
    const d = await fn()
    try { localStorage.setItem('sb:' + key, JSON.stringify(d)) } catch (e) { /* storage full */ }
    return d
  } catch (e) {
    const s = localStorage.getItem('sb:' + key)
    if (s) { window.dispatchEvent(new Event('sb-stale')); return JSON.parse(s) }
    throw e
  }
}
const mem = new Map()
export const clearMem = () => mem.clear()
// Screens asking for the same data within 2 minutes share one request (fewer requests, faster tab switching).
export const fetchAll = (table, cols, filter, key) => {
  const k = key || (filter ? null : table + ':' + cols)
  if (!k) return rawFetchAll(table, cols, filter)
  const hit = mem.get(k)
  if (hit && Date.now() - hit.t < 120000) return hit.p
  const p = cached(k, () => rawFetchAll(table, cols, filter))
  mem.set(k, { t: Date.now(), p })
  p.catch(() => mem.delete(k))
  return p
}
export const latestSync = () => cached('sync', async () => {
  const { data, error } = await supabase.from('sync_log').select('ran_at,source').order('ran_at', { ascending: false }).limit(1)
  if (error) throw error
  return data && data[0]
})
export const L = (v) => (v < 0 ? '-' + L(-v) : v >= 1e7 ? '\u20B9' + (v / 1e7).toFixed(2) + ' Cr' : v >= 1e5 ? '\u20B9' + (v / 1e5).toFixed(1) + ' L' : '\u20B9' + Math.round(v).toLocaleString('en-IN'))
export const addYm = (ym, n) => { const t = Math.floor(ym / 100) * 12 + (ym % 100 - 1) + n; return Math.floor(t / 12) * 100 + (t % 12) + 1 }

// Shop branding. Other shops set VITE_APP_NAME and VITE_SHOP_NAME in Vercel.
export const APP = import.meta.env.VITE_APP_NAME || 'SBMA'
export const SHOP = import.meta.env.VITE_SHOP_NAME || 'Shree Bhavani Medical Agency'
export const GSTIN = import.meta.env.VITE_GSTIN || '36AFNFS4139N1Z9'
