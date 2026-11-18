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

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
