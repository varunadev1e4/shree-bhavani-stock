import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { APP, SHOP, backupAge, latestSync } from './util'
import { nameOf } from './me'
import { askPrompt, showMsg } from './dialog'
import { BUILD } from './version'
import { CHANGELOG } from './changelog'

// Menu > About: who made the app, which version this phone is running, and what changed in each version.
const Row = ({ l, v }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="muted">{l}</span><b style={{ textAlign: 'right' }}>{v}</b></div>

export default function About({ back }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [sync, setSync] = useState(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setEmail((data && data.user && data.user.email) || ''); setName(nameOf(data && data.user)) }).catch(() => {})
    latestSync().then(setSync).catch(() => {})
  }, [])
  const editName = async () => {
    const v = await askPrompt('Your name (shown on the Home screen):', name)
    if (v == null || !v.trim()) return
    const { error } = await supabase.auth.updateUser({ data: { full_name: v.trim() } })
    if (error) return showMsg('Could not save: ' + error.message)
    setName(v.trim())
  }
  const s = sync ? backupAge(sync).text : 'Checking...'
  return (
    <div className="app">
      <header className="top"><div><button className="ghost sm" onClick={back}>Back</button><h1 className="h1" style={{ marginTop: 8 }}>About</h1></div></header>
      <div className="chartcard">
        <h2 className="h2" style={{ margin: '0 0 4px' }}>{APP}</h2>
        <p style={{ margin: '0 0 10px' }}>Developed by <b>Varun</b> for <b>{SHOP}</b>.</p>
        <Row l="Version" v={'v' + BUILD} />
        <Row l="Data" v={s} />
        <Row l="Name" v={<>{name || '-'} <button className="ghost sm" style={{ marginLeft: 8 }} onClick={editName}>Edit</button></>} />
        <Row l="Signed in as" v={email || '-'} />
        <Row l="Access" v="Owner" />
      </div>
      <h2 className="h2">How it works</h2>
      <div className="chartcard small" style={{ display: 'grid', gap: 6 }}>
        <span>Your billing software's backups are read and copied into this app on a schedule. This app only reads them: <b>nothing is ever written back</b> to the billing software's data file or its backups.</span>
        <span>Things you enter here (temporary bills, collections, expenses, staff records, tasks and so on) are saved only in this app's own database.</span>
        <span>Employee logins can open only their own screen. This is enforced by the database, not just hidden in the app.</span>
        <span>Stock, parties and sales figures are as of the last data update shown above, not live.</span>
      </div>
      <h2 className="h2">Version history</h2>
      {CHANGELOG.map((c) => (
        <div key={c.v} className="chartcard" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{c.v ? 'v' + c.v : 'Before v23'}</b><span className="muted small">{c.d}</span></div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{c.t.map((x) => <li key={x} className="small" style={{ marginBottom: 2 }}>{x}</li>)}</ul>
        </div>))}
      <p className="muted small" style={{ textAlign: 'center', marginTop: 14 }}>&copy; {new Date().getFullYear()} Varun. Made for {SHOP}.</p>
    </div>
  )
}
