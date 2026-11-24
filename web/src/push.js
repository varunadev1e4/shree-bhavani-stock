import { supabase } from './supabase'

// Push notifications (optional). Needs the one-time setup in Push-Notifications-Setup.md.
// Without VITE_VAPID_PUBLIC_KEY the buttons simply do not appear.
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
export const pushSupported = () => !!KEY && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const toBytes = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...s].map((c) => c.charCodeAt(0))) }

export async function pushOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try { const reg = await navigator.serviceWorker.ready; return !!(await reg.pushManager.getSubscription()) } catch (e) { return false }
}

// Returns true when on, or a message to show the user
export async function enablePush(role, empId) {
  if (!pushSupported()) return 'Notifications are not available on this phone or browser. On iPhone, add the app to the Home Screen first.'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Notifications were not allowed. You can allow them in the phone settings for this app.'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) })
    const j = sub.toJSON(), { data } = await supabase.auth.getUser()
    const { error } = await supabase.from('push_subs').upsert({ email: String((data.user && data.user.email) || '').toLowerCase(), role, emp_id: empId || null, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
    if (error) return 'Could not save: ' + error.message + ' (owner: run migration-25.sql)'
    return true
  } catch (e) { return 'Could not turn on notifications: ' + (e.message || e) }
}
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription()
    if (sub) { await supabase.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
  } catch (e) { /* ignore */ }
}