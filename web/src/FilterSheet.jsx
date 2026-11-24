import { useEffect } from 'react'
import { useBackLayer } from './backstack'

// Filters live in a slide-up sheet so the report itself gets the screen.
// <FilterBar summary="This month | by Customer" count={2} onOpen={...} /> sits above the results; <FilterSheet> holds the controls.
export function FilterBar({ summary, count, onOpen }) {
  return (
    <div className="fbar">
      <button className="fbtn" onClick={onOpen}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        Filters{count > 0 && <b>{count}</b>}
      </button>
      <span className="fsum" onClick={onOpen}>{summary}</span>
    </div>
  )
}

export function Sec({ title, children }) { return <><div className="fsec">{title}</div>{children}</> }

export default function FilterSheet({ open, onClose, onReset, title = 'Filters', children }) {
  useBackLayer(open, onClose)
  useEffect(() => {
    if (!open) return
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fsheet-back" onClick={onClose} role="presentation">
      <div className="fsheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="fsheet-head"><b>{title}</b><button className="ghost sm" onClick={onClose}>Close</button></div>
        <div className="fsheet-body">{children}</div>
        <div className="fsheet-foot">
          {onReset && <button className="ghost" style={{ margin: 0 }} onClick={onReset}>Reset</button>}
          <button className="primary" style={{ flex: 1 }} onClick={onClose}>Show results</button>
        </div>
      </div>
    </div>
  )
}
