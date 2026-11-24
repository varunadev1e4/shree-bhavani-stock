import { useEffect, useRef, useState } from 'react'
import { useBackLayer } from './backstack'

// In-app replacements for the browser's confirm / prompt / alert boxes.
//   if (await askConfirm('Delete this?', { ok: 'Delete', danger: true })) ...
//   const v = await askPrompt('Bill number (optional):', '')   // null when cancelled
//   showMsg('Could not save')
let push = null
const queue = []
const open = (d) => new Promise((resolve) => { const item = { ...d, resolve }; push ? push(item) : queue.push(item) })
export const askConfirm = (message, o = {}) => open({ kind: 'confirm', message, ...o })
export const askPrompt = (message, value = '', o = {}) => open({ kind: 'prompt', message, value, ...o })
export const showMsg = (message, o = {}) => open({ kind: 'alert', message, ...o })

export function DialogHost() {
  const [cur, setCur] = useState(null)
  const [val, setVal] = useState('')
  const pending = useRef([])
  const next = () => { const n = pending.current.shift() || null; setCur(n); setVal(n && n.value != null ? n.value : '') }
  useEffect(() => {
    push = (item) => { if (cur) pending.current.push(item); else { setCur(item); setVal(item.value != null ? item.value : '') } }
    return () => { push = null }
  })
  useEffect(() => { while (queue.length) pending.current.push(queue.shift()); if (!cur && pending.current.length) next() }, [cur])
  // Phone Back = Cancel
  useBackLayer(!!cur, () => { if (!cur) return; cur.resolve(cur.kind === 'prompt' ? null : cur.kind === 'alert' ? undefined : false); next() })
  if (!cur) return null
  const done = (v) => { cur.resolve(v); next() }
  const isP = cur.kind === 'prompt', isA = cur.kind === 'alert'
  const ok = () => done(isP ? val : isA ? undefined : true)
  const cancel = () => done(isP ? null : isA ? undefined : false)
  return (
    <div className="dlg-back" onClick={cancel} role="presentation">
      <div className="dlg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p className="dlg-msg">{cur.message}</p>
        {isP && <input className="fsel" style={{ width: '100%', boxSizing: 'border-box' }} autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok() }} />}
        <div className="dlg-btns">
          {!isA && <button className="ghost" style={{ margin: 0 }} onClick={cancel}>{cur.cancel || 'Cancel'}</button>}
          <button className={cur.danger ? 'primary dlg-danger' : 'primary'} style={{ minWidth: 90 }} autoFocus={!isP} onClick={ok}>{cur.ok || (isA ? 'OK' : isP ? 'Save' : 'Yes')}</button>
        </div>
      </div>
    </div>
  )
}
