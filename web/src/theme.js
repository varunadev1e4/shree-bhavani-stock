// Theme choice: 'auto' (follow the phone), 'light' or 'dark'. Saved on this device only.
const KEY = 'sb-theme'
export const getTheme = () => { try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'auto' } catch { return 'auto' } }
export function setTheme(t) {
  try { t === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t) } catch { /* private mode */ }
  const el = document.documentElement
  t === 'auto' ? el.removeAttribute('data-theme') : el.setAttribute('data-theme', t)
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#0b0f14' : '#0d9488')
}
export const nextTheme = (t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto')
