import { useState } from 'react'
import { supabase } from './supabase'
import { useBackLayer } from './backstack'
import { showMsg } from './dialog'

// Change password: for owners (Menu > Change password) and employees (button beside Sign out).
// The current password is checked first, then the new one is saved. It changes only this person's own login.
export default function ChangePassword({ onClose }) {
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useBackLayer(true, onClose)
  const save = async (e) => {
    e && e.preventDefault()
    setErr('')
    if (!cur) return setErr('Type your current password.')
    if (pw.length < 6) return setErr('The new password needs at least 6 characters.')
    if (pw !== pw2) return setErr('The two new passwords are not the same.')
    if (pw === cur) return setErr('The new password must be different from the current one.')
    setBusy(true)
    try {
      const { data } = await supabase.auth.getUser()
      const email = data && data.user && data.user.email
      if (!email) throw new Error('Please sign in again, then try once more.')
      const chk = await supabase.auth.signInWithPassword({ email, password: cur })
      if (chk.error) throw new Error('The current password is not correct.')
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      onClose()
      showMsg('Password changed. Use the new password the next time you sign in.')
    } catch (x) { setErr(x.message || 'Could not change the password.') }
    setBusy(false)
  }
  const inp = { width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--bg)', fontSize: 16 }
  const t = show ? 'text' : 'password'
  return (
    <div className="dlg-back" onClick={onClose} role="presentation">
      <form className="dlg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <b style={{ fontSize: 18 }}>Change password</b>
        <input style={inp} type={t} autoComplete="current-password" placeholder="Current password" value={cur} onChange={(x) => setCur(x.target.value)} autoFocus />
        <input style={inp} type={t} autoComplete="new-password" placeholder="New password (6 or more characters)" value={pw} onChange={(x) => setPw(x.target.value)} />
        <input style={inp} type={t} autoComplete="new-password" placeholder="Type the new password again" value={pw2} onChange={(x) => setPw2(x.target.value)} />
        <label className="muted small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={show} onChange={(x) => setShow(x.target.checked)} /> Show passwords</label>
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
        <div className="dlg-btns">
          <button type="button" className="ghost" style={{ margin: 0 }} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" style={{ minWidth: 90 }} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
