import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { DialogHost } from './dialog'
import './styles.css'
import { installBack } from './backstack'

installBack()  // the phone's Back button closes screens inside the app instead of leaving it

// A shop with its own name (set VITE_APP_NAME / VITE_SHOP_NAME in Vercel) gets its own install name.
const NAME = import.meta.env.VITE_APP_NAME
if (NAME) {
  const o = location.origin
  const m = {
    name: import.meta.env.VITE_SHOP_NAME || NAME, short_name: NAME, start_url: o + '/', scope: o + '/', display: 'standalone',
    background_color: '#f5f7fa', theme_color: '#0d9488',
    icons: [
      { src: o + '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: o + '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: o + '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  const link = document.querySelector('link[rel="manifest"]')
  if (link) link.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }))
  document.title = NAME
}

// If something crashes, show the reason on screen instead of a frozen or blank app.
class Boundary extends React.Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    const e = this.state.err
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h2>Something went wrong</h2>
        <p>Please send a screenshot of this message.</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{String((e && (e.stack || e.message)) || e)}</pre>
        <button onClick={() => location.reload()} style={{ padding: '10px 18px', fontSize: 16 }}>Reload</button>
      </div>
    )
  }
}

function showError(msg) {
  if (document.getElementById('sb-err')) return
  const d = document.createElement('div'); d.id = 'sb-err'
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b91c1c;color:#fff;padding:10px 14px;font:13px system-ui;white-space:pre-wrap'
  d.textContent = 'Error: ' + msg + '\n(tap to hide)'; d.onclick = () => d.remove(); document.body.appendChild(d)
}
window.addEventListener('error', (e) => showError(e.message))
window.addEventListener('unhandledrejection', (e) => showError(String((e.reason && e.reason.message) || e.reason)))

ReactDOM.createRoot(document.getElementById('root')).render(<Boundary><App /><DialogHost /></Boundary>)

// After an update, a page that was already open asks for old file names that no longer exist (PDF and Excel tools load on demand).
// Reload once to pick up the new version.
window.addEventListener('vite:preloadError', () => {
  try { if (sessionStorage.getItem('sb-reload')) return; sessionStorage.setItem('sb-reload', '1') } catch (e) { /* ignore */ }
  location.reload()
})
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
