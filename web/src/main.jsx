import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

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

ReactDOM.createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}