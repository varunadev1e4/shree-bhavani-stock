const C = 'sb-v2'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => clients.claim())
))
self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return
  // Pages are always fetched fresh so a new deploy is picked up (old cached pages point to files that no longer exist)
  const req = r.mode === 'navigate' ? new Request(r, { cache: 'no-store' }) : r
  e.respondWith(
    fetch(req).then((res) => { if (res.ok) { const c = res.clone(); caches.open(C).then((x) => x.put(r, c)) } return res })
      .catch(() => caches.match(r).then((m) => m || caches.match('/')))
  )
})

// Push notifications (optional, see Push-Notifications-Setup.md)
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (x) { d = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Shop app', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag || undefined, data: { url: d.url || '/' },
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus()
    return clients.openWindow(url)
  }))
})