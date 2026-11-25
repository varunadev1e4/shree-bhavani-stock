import { createClient } from '@supabase/supabase-js'

// Never more than 4 requests at once, and none can hang forever (a stuck request used to block the rest).
let active = 0
const queue = []
const pump = () => { while (active < 4 && queue.length) { active++; queue.shift()() } }
const limitedFetch = (url, opts = {}) => new Promise((resolve, reject) => {
  queue.push(() => {
    // Sign-in / token-refresh calls are never cut short: if the answer to a refresh is thrown away, the phone keeps
    // an old refresh token and the next refresh signs the user out ("logs out randomly").
    const isAuth = String(url).includes('/auth/v1/')
    const ctl = new AbortController()
    const timer = isAuth ? 0 : setTimeout(() => ctl.abort(), 30000)
    if (opts.signal) opts.signal.addEventListener('abort', () => ctl.abort())
    fetch(url, isAuth ? opts : { ...opts, signal: ctl.signal })
      .then(resolve, reject)
      .finally(() => { if (timer) clearTimeout(timer); active--; pump() })
  })
  pump()
})

// One token refresh at a time across all open windows of the app (two at once is what logs people out).
// If another window holds the lock for more than 5 seconds we carry on rather than hang.
export async function authLock(name, acquireTimeout, fn) {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn()
  const ctl = new AbortController()
  let got = false
  const t = setTimeout(() => ctl.abort(), acquireTimeout > 0 ? Math.min(acquireTimeout, 5000) : 5000)
  try {
    return await navigator.locks.request(name, { signal: ctl.signal }, async () => { got = true; clearTimeout(t); return await fn() })
  } catch (e) {
    if (!got && e && e.name === 'AbortError') return fn()
    throw e
  } finally { clearTimeout(t) }
}

// The app keeps a copy of recent lists in the phone's storage (keys starting "sb:") so it can show them offline. That copy can grow
// until the storage is full, and then the phone cannot save the LOGIN either, so every reload asks for the password again.
// So: the copies are limited in size, trimmed when the app starts, and emptied (never the login) whenever storage runs out.
export function purgeCache() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('sb:')) keys.push(k) }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch (e) { /* ignore */ }
}
try {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('sb:')) total += (localStorage.getItem(k) || '').length }
  if (total > 1500000) purgeCache()
} catch (e) { /* ignore */ }
// Where the login is kept. If storage is full, free the offline copies and try again, so the login is always saved.
const authStorage = typeof localStorage === 'undefined' ? undefined : {
  getItem: (k) => localStorage.getItem(k),
  removeItem: (k) => localStorage.removeItem(k),
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch (e) { purgeCache(); localStorage.setItem(k, v) } },
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { global: { fetch: limitedFetch }, auth: { lock: authLock, storage: authStorage } }
)

// When the app is back in front, make sure the login is refreshed right away.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') supabase.auth.startAutoRefresh() })
