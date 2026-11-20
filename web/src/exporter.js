import { SHOP } from './util'

const cell = (v) => (v == null ? '' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v))
const stamp = () => new Date().toISOString().slice(0, 10)

// Opens the phone's share sheet with the file (WhatsApp, email...). Falls back to a normal download.
export async function deliver(blob, filename, title) {
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
  const ns = new Set(numCols)
  autoTable(doc, {
    startY: 82, head: [columns], body: rows.map((r) => r.map(cell)),
    styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [13, 148, 136] },
    columnStyles: Object.fromEntries(numCols.map((i) => [i, { halign: 'right' }])),
    didParseCell: (d) => {
      // Headers line up with their columns: numbers columns are right-aligned in the header too
      if (d.section === 'head' && ns.has(d.column.index)) d.cell.styles.halign = 'right'
      if (d.section === 'body' && bs.has(d.row.index)) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 244, 241] } },
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

// Excel file with title lines on top, like Profit Maker's own exports. Returns a Blob.
export async function xlsxBlob({ aoa, dateCols = [], widths = [] }) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
  Object.keys(ws).forEach((a) => { if (a[0] !== '!' && ws[a].t === 'd') { ws[a].z = 'dd/mm/yyyy' } })
  ws['!cols'] = widths.map((w) => ({ wch: w }))
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// Shares several files in one go (one WhatsApp or email message). Falls back to separate downloads.
export async function deliverMany(items, title) {
  const files = items.map((x) => new File([x.blob], x.filename, { type: x.blob.type }))
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title }); return } catch (e) { if (e && e.name === 'AbortError') return; console.warn('share failed, downloading instead', e) }
  }
  for (const f of files) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name
    document.body.appendChild(a); a.click(); a.remove()
    await new Promise((r) => setTimeout(r, 400))
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
}

// ---- Payment receipt (one page, shareable PDF) ----
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''))
const below1000 = (n) => (n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + below100(n % 100) : '') : below100(n))
export function inWords(v) {
  const total = Math.round((Number(v) || 0) * 100), rs = Math.floor(total / 100), ps = total % 100
  if (!rs && !ps) return 'Zero'
  const parts = []
  const cr = Math.floor(rs / 1e7), lk = Math.floor((rs % 1e7) / 1e5), th = Math.floor((rs % 1e5) / 1e3), rest = rs % 1e3
  if (cr) parts.push(below1000(cr) + ' Crore'); if (lk) parts.push(below100(lk) + ' Lakh'); if (th) parts.push(below100(th) + ' Thousand'); if (rest) parts.push(below1000(rest))
  return (rs ? parts.join(' ') + ' Rupees' : '') + (ps ? (rs ? ' and ' : '') + below100(ps) + ' Paise' : '') + ' Only'
}
const dm = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '')
const mny = (v) => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Builds the receipt and returns { blob, filename } WITHOUT sharing, so the Share button can open the share sheet instantly.
export async function receiptBlob(r) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'pt', format: 'a5' })
  const W = doc.internal.pageSize.getWidth(), L = 32, R = W - 32
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(SHOP, W / 2, 40, { align: 'center' })
  doc.setFontSize(11); doc.text('PAYMENT RECEIPT', W / 2, 58, { align: 'center' })
  doc.setDrawColor(13, 148, 136); doc.setLineWidth(1.2); doc.line(L, 66, R, 66)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Receipt no: ' + (r.rec_no || ''), L, 84); doc.text('Date: ' + dm(r.d), R, 84, { align: 'right' })
  doc.setFontSize(9); doc.setTextColor(110); doc.text('Received with thanks from', L, 106); doc.setTextColor(0)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(String(r.party_name || ''), L, 122, { maxWidth: R - L })
  doc.setFontSize(18); doc.text('Rs. ' + mny(r.amount), L, 150)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  const words = doc.splitTextToSize('(' + inWords(r.amount) + ')', R - L); doc.text(words, L, 166)
  let y = 166 + words.length * 11 + 6
  doc.setFontSize(9); doc.text('Mode: ' + r.mode + (r.ref ? '  |  ' + r.ref : ''), L, y); y += 14
  const bills = Array.isArray(r.bills) ? r.bills : []
  if (bills.length) {
    const paid = bills.reduce((s, b) => s + Number(b.paid || 0), 0)
    autoTable(doc, {
      startY: y + 4, head: [['Against bill', 'Bill date', 'Bill amount', 'Pending before', 'Paid now', 'Pending after']],
      body: [...bills.map((b) => [b.bill_no, dm(b.date), mny(b.total), mny(b.before), mny(b.paid), mny(Math.max(0, Number(b.before) - Number(b.paid)))]),
        ['Total against bills', '', '', '', mny(paid), '']],
      styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [13, 148, 136] }, margin: { left: L, right: 32 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 2) d.cell.styles.halign = 'right'
        if (d.section === 'body' && d.row.index === bills.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [226, 244, 241] } },
    })
    y = doc.lastAutoTable.finalY + 12
    const extra = Math.round((Number(r.amount) - paid) * 100) / 100
    if (extra > 0.5) { doc.setFontSize(9); doc.text('On account / advance: Rs. ' + mny(extra), L, y); y += 14 }
  } else { doc.setFontSize(9); doc.text('Received on account (not against a particular bill).', L, y); y += 14 }
  if (r.note) { doc.setFontSize(8.5); doc.setTextColor(90); const n = doc.splitTextToSize('Note: ' + r.note, R - L); doc.text(n, L, y); y += n.length * 11 + 4; doc.setTextColor(0) }
  if (r.mode === 'Cheque') { doc.setFontSize(8); doc.setTextColor(90); doc.text('Cheque payments are subject to realisation.', L, y + 4); doc.setTextColor(0) }
  const H = doc.internal.pageSize.getHeight()
  doc.setFontSize(9); doc.line(R - 150, H - 62, R, H - 62); doc.text('For ' + SHOP, R, H - 50, { align: 'right' }); doc.setFontSize(7.5); doc.setTextColor(120)
  doc.text('Computer generated receipt.', L, H - 28); doc.setTextColor(0)
  return { blob: doc.output('blob'), filename: String(r.rec_no || 'receipt').replace(/[^\w-]+/g, '-') + '.pdf' }
}
