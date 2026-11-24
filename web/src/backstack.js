import { useEffect, useRef } from 'react'

// Makes the phone's own Back button behave like the app's Back button.
// The app keeps one spare history entry ahead of the page. Pressing Back lands on the page before it, we close the top-most screen,
// dialog or sheet ourselves, and put the spare entry back. When nothing is open (Home), the first Back shows
// "Press back again to exit" and the second one leaves the app.
const layers = []
let last = 0
let installed = false

function toast(text) {
  const d = document.createElement('div')
  d.textContent = text
  d.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#0B1F2A;color:#fff;padding:10px 18px;border-radius:99px;font:600 14px system-ui,sans-serif;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.3)'
  document.body.appendChild(d)
  setTimeout(() => d.remove(), 1800)
}

export function installBack() {
  if (installed || typeof window === 'undefined') return
  installed = true
  try { history.replaceState({ sb: 'base' }, ''); history.pushState({ sb: 'trap' }, '') } catch (e) { return }
  window.addEventListener('popstate', () => {
    const top = layers.pop()
    if (top) { try { top.close() } catch (e) { /* ignore */ } history.pushState({ sb: 'trap' }, ''); return }
    if (Date.now() - last < 2200) { history.back(); return }   // second press: leave the app
    last = Date.now(); toast('Press back again to exit'); history.pushState({ sb: 'trap' }, '')
  })
}

// Registers a screen that Back should close. Returns a function that unregisters it.
export function pushLayer(close) {
  const entry = { close }
  layers.push(entry)
  return () => { const i = layers.indexOf(entry); if (i >= 0) layers.splice(i, 1) }
}

// While `active` is true, the phone's Back button calls onBack instead of leaving the page.
export function useBackLayer(active, onBack) {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return undefined
    return pushLayer(() => ref.current && ref.current())
  }, [active])
}
