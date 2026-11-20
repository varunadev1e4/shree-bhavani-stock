import { useState } from 'react'
import { exportPdf, exportXlsx } from './exporter'
import { showMsg } from './dialog'

// build() returns { title, subtitle, columns, rows, filename, numCols, bold }
export default function ExportBar({ build }) {
  const [busy, setBusy] = useState('')
  const run = async (kind) => {
    setBusy(kind)
    try { const d = build(); await (kind === 'pdf' ? exportPdf(d) : exportXlsx(d.xlsx ? { ...d, ...d.xlsx } : d)) } catch (e) { showMsg('Could not make the file: ' + e.message) }
    setBusy('')
  }
  return (
    <div className="btnrow" style={{ margin: '0 0 8px' }}>
      <button className="ghost sm" disabled={!!busy} onClick={() => run('pdf')}>{busy === 'pdf' ? 'Making PDF...' : 'Share PDF'}</button>
      <button className="ghost sm" disabled={!!busy} onClick={() => run('xlsx')}>{busy === 'xlsx' ? 'Making Excel...' : 'Excel'}</button>
    </div>
  )
}
