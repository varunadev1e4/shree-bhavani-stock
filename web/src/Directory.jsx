import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBackLayer } from './backstack'
import { supabase } from './supabase'
import { fetchAll, waLink, SHOP } from './util'
import ExportBar from './Export'
import { askConfirm } from './dialog'

// Directory: companies, customers, suppliers and their contact people.
// Saved only in this app's own tables (directory, directory_people). Nothing is written to Profit Maker.
const KINDS = [['company', 'Companies'], ['customer', 'Customers'], ['supplier', 'Suppliers'], ['other', 'Others']]
const ONE = { company: 'Company', customer: 'Customer', supplier: 'Supplier', other: 'Other' }
const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]))
const tel = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '')
const inp = { className: 'fsel', style: { width: '100%', boxSizing: 'border-box' } }

function Form({ title, fields, init, extra, onSave, onCancel }) {
  const [v, setV] = useState(init)
  const [err, setErr] = useState('')
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }))
  const save = async () => { if (!String(v.name || '').trim()) return setErr('Name is needed.'); const e = await onSave(clean(v)); if (e) setErr(e) }
  return (
    <div className="chartcard" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <b>{title}</b>
      {extra && extra(v, setV)}
      {fields.map(([k, label, type]) => type === 'kind'
        ? <select key={k} {...inp} value={v[k] || 'company'} onChange={(e) => set(k, e.target.value)}>{KINDS.map(([a]) => <option key={a} value={a}>{ONE[a]}</option>)}</select>
        : type === 'area'
          ? <textarea key={k} {...inp} rows={2} placeholder={label} value={v[k] || ''} onChange={(e) => set(k, e.target.value)} />
          : <input key={k} {...inp} type={type || 'text'} inputMode={type === 'tel' ? 'tel' : undefined} placeholder={label} value={v[k] || ''} onChange={(e) => set(k, e.target.value)} />)}
      {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
      <div className="btnrow" style={{ paddingTop: 0 }}><button className="primary" style={{ flex: 1 }} onClick={save}>Save</button><button className="ghost" style={{ margin: 0 }} onClick={onCancel}>Cancel</button></div>
    </div>
  )
}

const ENTITY = [['kind', 'Type', 'kind'], ['name', 'Name'], ['address', 'Address', 'area'], ['city', 'City'], ['phone', 'Phone', 'tel'], ['phone2', 'Second phone', 'tel'], ['email', 'Email', 'email'], ['gstin', 'GSTIN'], ['dl_no', 'Drug licence no.'], ['notes', 'Notes', 'area']]
const PERSON = [['name', 'Name'], ['role', 'Role (e.g. area manager, accountant)'], ['phone', 'Phone', 'tel'], ['phone2', 'Second phone', 'tel'], ['email', 'Email', 'email'], ['notes', 'Notes', 'area']]

export default function Directory() {
  const [kind, setKind] = useState('company')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState([])
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState(null)   // { type: 'entity'|'person', data }
  useBackLayer(!!form, () => setForm(null))
  const [parties, setParties] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from('directory').select('*').order('name'), supabase.from('directory_people').select('*').order('name')])
    if (a.error || b.error) { setErr((a.error || b.error).message + ' (run migration-14.sql in Supabase)'); setRows([]); return }
    setErr(''); setRows(a.data); setPeople(b.data)
  }, [])
  useEffect(() => { load() }, [load])

  const byDir = useMemo(() => { const m = new Map(); people.forEach((p) => { if (!m.has(p.dir_id)) m.set(p.dir_id, []); m.get(p.dir_id).push(p) }); return m }, [people])
  const counts = useMemo(() => { const c = {}; (rows || []).forEach((r) => { c[r.kind] = (c[r.kind] || 0) + 1 }); return c }, [rows])
  const list = useMemo(() => {
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return (rows || []).filter((r) => r.kind === kind && w.every((x) => [r.name, r.city, r.phone, r.phone2, r.address, ...(byDir.get(r.id) || []).flatMap((p) => [p.name, p.phone, p.role])].filter(Boolean).join(' ').toLowerCase().includes(x)))
  }, [rows, kind, q, byDir])

  const openForm = (f) => { setForm(f); window.scrollTo(0, 0) }
  const loadParties = () => { if (!parties) fetchAll('parties', 'id,name,city,phone,phone2,deleted').then((p) => setParties(p.filter((x) => !x.deleted))).catch(() => setParties([])) }
  const saveEntity = async (d) => {
    const row = { kind: d.kind || kind, name: d.name, address: d.address, city: d.city, phone: d.phone, phone2: d.phone2, email: d.email, gstin: d.gstin, dl_no: d.dl_no, notes: d.notes, party_id: d.party_id || null }
    const r = d.id ? await supabase.from('directory').update(row).eq('id', d.id) : await supabase.from('directory').insert(row)
    if (r.error) return 'Could not save: ' + r.error.message
    setForm(null); setKind(row.kind); load()
  }
  const savePerson = async (d) => {
    const row = { dir_id: d.dir_id, name: d.name, role: d.role, phone: d.phone, phone2: d.phone2, email: d.email, notes: d.notes }
    const r = d.id ? await supabase.from('directory_people').update(row).eq('id', d.id) : await supabase.from('directory_people').insert(row)
    if (r.error) return 'Could not save: ' + r.error.message
    setForm(null); load()
  }
  const delEntity = async (r) => { if (await askConfirm('Delete ' + r.name + ' and all its contact people?')) { await supabase.from('directory').delete().eq('id', r.id); setOpen(null); load() } }
  const delPerson = async (p) => { if (await askConfirm('Delete ' + p.name + '?')) { await supabase.from('directory_people').delete().eq('id', p.id); load() } }

  const build = () => ({
    title: 'Directory: ' + KINDS.find((k) => k[0] === kind)[1], subtitle: SHOP + ' | ' + list.length + ' entries', filename: 'directory-' + kind,
    columns: ['Name', 'City', 'Phone', 'Address', 'Contact persons'],
    rows: list.map((r) => [r.name, r.city || '', [r.phone, r.phone2].filter(Boolean).join(', '), r.address || '', (byDir.get(r.id) || []).map((p) => p.name + (p.role ? ' (' + p.role + ')' : '') + (p.phone ? ' ' + p.phone : '')).join('; ')]),
    bold: [], numCols: [],
  })

  const pickParty = (v, setV) => {
    if (v.id || !(v.kind === 'customer' || v.kind === 'supplier')) return null
    const w = (v._pq || '').trim().toLowerCase()
    const hits = w && parties ? parties.filter((p) => (p.name + ' ' + (p.city || '')).toLowerCase().includes(w)).slice(0, 5) : []
    return (
      <div>
        <input {...inp} type="search" placeholder="Fill from my parties: type a name..." value={v._pq || ''} onFocus={loadParties} onChange={(e) => setV((o) => ({ ...o, _pq: e.target.value }))} />
        {hits.map((p) => <button key={p.id} className="more" style={{ marginTop: 6, textAlign: 'left', color: 'inherit', borderStyle: 'solid' }}
          onClick={() => setV((o) => ({ ...o, _pq: '', name: p.name, city: p.city || o.city, phone: p.phone || o.phone, phone2: p.phone2 || o.phone2, party_id: p.id }))}><b>{p.name}</b> <span className="muted small">{p.city}</span></button>)}
      </div>)
  }

  return (
    <>
      <div className="qchips">{KINDS.map(([k, l]) => <button key={k} className={'qc' + (kind === k ? ' on' : '')} onClick={() => { setKind(k); setOpen(null) }}>{l} <b>{counts[k] || 0}</b></button>)}</div>
      <div className="searchbox sp"><input type="search" placeholder="Search name, city, phone or person" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="btnrow" style={{ paddingTop: 0 }}>
        <button className="primary" style={{ flex: 1 }} onClick={() => openForm({ type: 'entity', data: { kind } })}>+ Add {ONE[kind].toLowerCase()}</button>
      </div>
      {err && <p className="error pad">{err}</p>}
      {form && form.type === 'entity' && <Form title={form.data.id ? 'Edit ' + form.data.name : 'New ' + ONE[form.data.kind || kind].toLowerCase()} fields={ENTITY} init={form.data} extra={pickParty} onSave={saveEntity} onCancel={() => setForm(null)} />}
      {form && form.type === 'person' && <Form title={form.data.id ? 'Edit contact person' : 'New contact person'} fields={PERSON} init={form.data} onSave={savePerson} onCancel={() => setForm(null)} />}
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !list.length && !err && <div className="empty"><b>Nothing here yet</b><span>Tap + Add to save the first one.</span></div>}
      {list.length > 0 && <div style={{ margin: '12px 0 4px' }}><ExportBar build={build} /></div>}
      <ul className="list">
        {list.map((r) => {
          const ps = byDir.get(r.id) || [], ph = r.phone || r.phone2
          return (
            <li key={r.id} className="card">
              <button className="row" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <div className="info"><div className="name">{r.name}</div>
                  <div className="meta">{r.city && <span>{r.city}</span>}{ph && <span>{ph}</span>}{ps.length > 0 && <span>{ps.length} contact{ps.length > 1 ? 's' : ''}</span>}</div></div>
              </button>
              {open === r.id && (
                <div className="batches" style={{ display: 'grid', gap: 8 }}>
                  {r.address && <div style={{ whiteSpace: 'pre-wrap' }}>{r.address}</div>}
                  {(r.email || r.gstin || r.dl_no) && <div className="muted small">{[r.email, r.gstin && 'GSTIN ' + r.gstin, r.dl_no && 'DL ' + r.dl_no].filter(Boolean).join(' | ')}</div>}
                  {r.notes && <div className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>}
                  <div className="btnrow" style={{ paddingTop: 0 }}>
                    {ph && <a className="ghost" href={tel(ph)}>Call</a>}
                    {ph && <a className="ghost" target="_blank" rel="noreferrer" href={waLink(ph, '')}>WhatsApp</a>}
                    {(r.address || r.city) && <a className="ghost" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([r.name, r.address, r.city].filter(Boolean).join(' '))}>Map</a>}
                    <button className="ghost" onClick={() => openForm({ type: 'entity', data: r })}>Edit</button>
                    <button className="ghost" onClick={() => delEntity(r)}>Delete</button>
                  </div>
                  <b style={{ marginTop: 4 }}>Contact people</b>
                  {!ps.length && <span className="muted small">None added yet.</span>}
                  {ps.map((p) => (
                    <div key={p.id} className="chartcard" style={{ margin: 0, display: 'grid', gap: 4 }}>
                      <span><b>{p.name}</b>{p.role ? <span className="muted small"> | {p.role}</span> : ''}</span>
                      {(p.phone || p.phone2 || p.email) && <span className="muted small">{[p.phone, p.phone2, p.email].filter(Boolean).join(' | ')}</span>}
                      {p.notes && <span className="muted small">{p.notes}</span>}
                      <div className="btnrow" style={{ paddingTop: 0 }}>
                        {(p.phone || p.phone2) && <a className="ghost sm" href={tel(p.phone || p.phone2)}>Call</a>}
                        {(p.phone || p.phone2) && <a className="ghost sm" target="_blank" rel="noreferrer" href={waLink(p.phone || p.phone2, '')}>WhatsApp</a>}
                        <button className="ghost sm" onClick={() => openForm({ type: 'person', data: p })}>Edit</button>
                        <button className="ghost sm" onClick={() => delPerson(p)}>Delete</button>
                      </div>
                    </div>))}
                  <button className="ghost" style={{ justifySelf: 'start' }} onClick={() => openForm({ type: 'person', data: { dir_id: r.id } })}>+ Add contact person</button>
                </div>)}
            </li>)
        })}
      </ul>
      <p className="muted small" style={{ marginTop: 14 }}>The directory is saved only in this app. Profit Maker and its backups are never changed.</p>
    </>
  )
}
