import { SHOP } from './util'

const cell = (v) => (v == null ? '' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v))
const stamp = () => new Date().toISOString().slice(0, 10)

// Opens the phone's share sheet with the file (WhatsApp, email...). Falls back to a normal download.
async function deliver(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return } catch (e) { if (e && e.name === 'AbortError') return }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export async function exportPdf({ title, subtitle, columns, rows, filename, numCols = [], bold = [] }) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  doc.setFontSize(14); doc.text(SHOP, 40, 40)
  doc.setFontSize(11); doc.text(title, 40, 58)
  doc.setFontSize(8); doc.setTextColor(110)
  doc.text([subtitle, 'Generated ' + new Date().toLocaleString('en-IN')].filter(Boolean).join('   |   '), 40, 72)
  doc.setTextColor(0)
  const bs = new Set(bold)
  autoTable(doc, {
    startY: 82, head: [columns], body: rows.map((r) => r.map(cell)),
    styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [13, 148, 136] },
    columnStyles: Object.fromEntries(numCols.map((i) => [i, { halign: 'right' }])),
    didParseCell: (d) => { if (d.section === 'body' && bs.has(d.row.index)) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 244, 241] } },
    didDrawPage: () => { doc.setFontSize(8); doc.text('Page ' + doc.internal.getNumberOfPages(), doc.internal.pageSize.getWidth() - 70, doc.internal.pageSize.getHeight() - 20) },
  })
  await deliver(doc.output('blob'), filename + '-' + stamp() + '.pdf', title)
}

export async function exportXlsx({ title, columns, rows, filename }) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows])
  ws['!cols'] = columns.map((c, i) => ({ wch: Math.min(40, Math.max(String(c).length, ...rows.slice(0, 200).map((r) => String(r[i] == null ? '' : r[i]).length)) + 2) }))
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  await deliver(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename + '-' + stamp() + '.xlsx', title)
}
