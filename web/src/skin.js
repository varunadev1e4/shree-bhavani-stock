// Look of the app: 'blister' (new) or 'classic' (the earlier look). Saved on this device only. Change it from the top-bar menu.
const KEY = 'sb-skin'
export const getSkin = () => { try { return localStorage.getItem(KEY) === 'classic' ? 'classic' : 'blister' } catch { return 'blister' } }
export function applySkin(s = getSkin()) {
  try { s === 'blister' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, s) } catch { /* private mode */ }
  document.documentElement.setAttribute('data-skin', s)
  // The Blister look uses the DM Sans typeface. If it cannot load (offline), the phone's normal font is used instead.
  if (s === 'blister' && !document.getElementById('sb-font')) {
    const l = document.createElement('link'); l.id = 'sb-font'; l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'
    document.head.appendChild(l)
  }
}
export const nextSkin = (s) => (s === 'blister' ? 'classic' : 'blister')
