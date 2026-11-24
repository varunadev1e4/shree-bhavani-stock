import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { rs } from './util'
import ExportBar from './Export'
import { showMsg } from './dialog'

// Owner-only history of who changed what. Written by database triggers, so it cannot be skipped or edited from the app.
const TBL = {
  shop_fund: 'Shop fund', expenses: 'Expenses', emp_entries: 'Staff entries', employees: 'Employees',
  app_roles: 'Logins', fund_requests: 'Fund requests', bill_tags: 'Delivery tags', counts: 'Stock counts',
}
const ACT = { INSERT: 'added', UPDATE: 'changed', DELETE: 'deleted' }
const FIELD = { amount: 'amount', category: 'category', note: 'note', d: 'date', salary: 'salary', name: 'name', role: 'role', status: 'status', kind: 'type', adv_cut: 'advance cut', leave_date: 'last day', leave_quota: 'leave quota', active: 'active', email: 'login email', bill_no: 'bill' }
const val = (k, v) => (v == null || v === '' ? 'empty' : ['amount', 'salary', 'adv_cut'].includes(k) ? rs(Number(v)) : String(v))

function describe(r) {
  const d = r.new_data || r.old_data || {}
  const what = TBL[r.tbl] || r.tbl
  if (r.action === 'UPDATE') {
    const ks = Object.keys(r.new_data || {}).filter((k) => !['created_at', 'updated_at'].includes(k))
    return what + ' #' + r.row_id + ': ' + ks.map((k) => (FIELD[k] || k) + ' ' + val(k, (r.old_data || {})[k]) + ' to ' + val(k, r.new_data[k])).join(', ')
  }
  const bits = [d.name, d.category, d.kind, d.email, d.bill_no, d.amount != null ? rs(Number(d.amount)) : null, d.d, d.note].filter((x) => x != null && x !== '')
  return what + ' ' + ACT[r.action] + (bits.length ? ': ' + bits.join(' | ') : '')
}
const stamp = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function ActivityLog() {
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [f, setF] = useState('')
  const [lim, setLim] = useState(100)
  const load = useCallback(async () => {
    setRows(null)
    let q = supabase.from('activity_log').select('*').order('at', { ascending: false }).limit(lim)
    if (f) q = q.eq('tbl', f)
    const [a, r, e] = await Promise.all([q, supabase.from('app_roles').select('email,role,emp_id'), supabase.from('employees').select('id,name')])
    if (a.error) { showMsg(a.error.message + ' (run migration-27.sql in Supabase)'); return setRows([]) }
    const m = {}
    ;(r.data || []).forEach((x) => { const emp = (e.data || []).find((y) => y.id === x.emp_id); m[x.email] = x.role === 'owner' ? 'Owner' : emp ? emp.name : x.email })
    setNames(m); setRows(a.data)
  }, [f, lim])
  useEffect(() => { load() }, [load])
  const who = (r) => (r.actor === 'system' ? 'System (sync or script)' : names[r.actor] || r.actor || '?')
  const build = () => ({ title: 'Activity log', subtitle: f ? TBL[f] : 'All', filename: 'activity-log', columns: ['When', 'Who', 'What'], rows: (rows || []).map((r) => [stamp(r.at), who(r), describe(r)]) })
  return (
    <>
      <div className="tabscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
        <button className={'qc' + (!f ? ' on' : '')} onClick={() => setF('')}>All</button>
        {Object.entries(TBL).map(([k, l]) => <button key={k} className={'qc' + (f === k ? ' on' : '')} style={{ whiteSpace: 'nowrap' }} onClick={() => setF(k)}>{l}</button>)}
      </div>
      {!rows && <p className="muted pad">Loading...</p>}
      {rows && !rows.length && <div className="empty"><b>Nothing recorded yet</b><p className="muted small">Changes made after migration-27.sql was run will appear here.</p></div>}
      {rows && rows.length > 0 && <ExportBar build={build} />}
      {(rows || []).map((r) => (
        <div key={r.id} className="chartcard" style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{who(r)}</b><span className="muted small">{stamp(r.at)}</span></div>
          <div className="small" style={{ marginTop: 2, wordBreak: 'break-word' }}>{describe(r)}</div>
        </div>))}
      {rows && rows.length >= lim && <button className="ghost" onClick={() => setLim(lim + 100)}>Show more</button>}
      <p className="muted small">This log cannot be edited or deleted from the app. It records only this app's own data, never Profit Maker.</p>
    </>)
}
