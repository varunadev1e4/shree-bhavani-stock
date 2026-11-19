// Builds the same four files you send your CA every month (sales register, purchase register, HSN-wise sales, HSN-wise purchases)
// from the bills stored in Supabase. Pure functions: no imports, so they are easy to test.
const r2 = (v) => Math.round((Number(v) || 0) * 100 + (v >= 0 ? 1e-7 : -1e-7)) / 100
const n = (v) => Number(v) || 0
export const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
const asDate = (iso) => (iso ? new Date(iso + 'T00:00:00') : null)
const asCode = (c) => { const s = String(c == null ? '' : c).trim(); return /^\d+$/.test(s) ? Number(s) : s }

// One bill -> the tax columns shared by both registers
function taxCols(b) {
  const taxable = r2(n(b.v0) + n(b.v5) + n(b.v12) + n(b.v18) + n(b.v28))
  const half = r2(n(b.sum_gst) / 2)
  return b.inter
    ? { intra: 0, cg: 0, sg: 0, tot: 0, iTax: taxable, iGst: r2(b.sum_gst) }
    : { intra: taxable, cg: half, sg: half, tot: r2(b.sum_gst), iTax: 0, iGst: 0 }
}
const rawHalf = (bills) => r2(bills.filter((b) => !b.inter).reduce((x, b) => x + n(b.sum_gst) / 2, 0)) // Profit Maker totals the unrounded halves
const sumCols = (rows, from) => rows[0].slice(from).map((_, j) => r2(rows.reduce((s, r) => s + n(r[from + j]), 0)))
const head = (shop, gstin, title, from, to) => [[shop], gstin ? ['GSTIN : ' + gstin] : null, [title], ['From ' + dmy(from) + ' To ' + dmy(to)]].filter(Boolean)

export function salesRegister(bills, { shop, gstin, from, to }) {
  const cols = ['Type', 'FeedNo', 'FeedDate', 'Code', 'Name', 'GstInNo', 'GstValue0', 'GstValue5', 'Gst5', 'GstValue12', 'Gst12', 'GstValue18', 'Gst18', 'GstValue28', 'Gst28', 'TotTax', 'CGst', 'SGst', 'TotGst', 'TotITax', 'TotIGst', 'NetAmt']
  const rows = bills.filter((b) => b.kind === 'S').sort((a, b) => a.feed_no.localeCompare(b.feed_no, 'en', { numeric: true }) || 0)
    .sort((a, b) => (a.typ === b.typ ? 0 : a.typ === 'Cash' ? -1 : 1) || 0)
    .map((b) => { const t = taxCols(b); return [b.typ, b.feed_no, asDate(b.feed_date), asCode(b.code), b.name, b.gstin || null, r2(b.v0), r2(b.v5), r2(b.g5), r2(b.v12), r2(b.g12), r2(b.v18), r2(b.g18), r2(b.v28), r2(b.g28), t.intra, t.cg, t.sg, t.tot, t.iTax, t.iGst, r2(b.net)] })
  const total = rows.length ? ['Grand Total :', '', '', '', '', '', ...sumCols(rows, 6)] : []
  if (rows.length) total[16] = total[17] = rawHalf(bills.filter((b) => b.kind === 'S'))
  return { aoa: [...head(shop, gstin, 'Sales Register With Percentages', from, to), cols, ...rows, ...(rows.length ? [total] : [])], dateCols: [2], widths: [8, 10, 12, 7, 34, 18, ...Array(16).fill(12)] }
}

export function purchaseRegister(bills, { shop, gstin, from, to }) {
  const cols = ['Type', 'FeedNo', 'FeedDate', 'InvNo', 'InvDate', 'Code', 'Name', 'GstInNo', 'GstValue0', 'GstValue5', 'Gst5', 'GstValue12', 'Gst12', 'GstValue18', 'Gst18', 'GstValue28', 'Gst28', 'TotalTaxable', 'CGst', 'SGst', 'TotalGst', 'TotalITaxable', 'TotalIGst', 'NetAmt']
  const rows = bills.filter((b) => b.kind === 'P').sort((a, b) => a.feed_no.localeCompare(b.feed_no, 'en', { numeric: true }) || 0)
    .map((b) => { const t = taxCols(b); return [b.typ, b.feed_no, asDate(b.feed_date), b.inv_no || '', asDate(b.inv_date), asCode(b.code), b.name, b.gstin || null, r2(b.v0), r2(b.v5), r2(b.g5), r2(b.v12), r2(b.g12), r2(b.v18), r2(b.g18), r2(b.v28), r2(b.g28), t.intra, t.cg, t.sg, t.tot, t.iTax, t.iGst, r2(b.net)] })
  const total = rows.length ? ['Grand Total :', '', '', '', '', '', '', '', ...sumCols(rows, 8)] : []
  if (rows.length) total[18] = total[19] = rawHalf(bills.filter((b) => b.kind === 'P'))
  return { aoa: [...head(shop, gstin, 'Purchase Register With Percentages', from, to), cols, ...rows, ...(rows.length ? [total] : [])], dateCols: [2, 4], widths: [8, 10, 12, 16, 12, 7, 34, 18, ...Array(16).fill(12)] }
}

// lines: hsn_monthly rows for the chosen months (already filtered by kind)
export function hsnReport(kind, lines, { shop, from, to }) {
  const m = new Map()
  lines.filter((l) => l.kind === kind).forEach((l) => {
    const k = String(l.hsn || '').trim() + '|' + n(l.gst)
    const a = m.get(k) || { hsn: String(l.hsn || '').trim(), gst: n(l.gst), qty: 0, taxable: 0, igst: 0, half: 0 }
    a.qty += n(l.qty); a.taxable += n(l.taxable)
    if (l.inter) a.igst += n(l.tax); else a.half += n(l.tax) / 2
    m.set(k, a)
  })
  const rows = [...m.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.gst - b.gst)
    .map((a) => [/^\d+$/.test(a.hsn) ? Number(a.hsn) : a.hsn, 'PAC-PACKS', a.gst, r2(a.qty), r2(a.taxable + a.igst + a.half * 2), r2(a.taxable), r2(a.igst), r2(a.half), r2(a.half), 0])
  const total = rows.length ? ['Grand Total :', '', '', ...sumCols(rows, 3)] : []
  if (rows.length) total[7] = total[8] = r2([...m.values()].reduce((x, a) => x + a.half, 0))
  const title = kind === 'S' ? 'HsnCode Wise Sale Report' : 'HsnCode Wise Purchase  Report'
  return { aoa: [[shop], [title], ['From ' + dmy(from) + ' To ' + dmy(to)], ['HSNCode', 'UQC', 'GstPer', 'TotalQuantity', 'TotalValue', 'TaxableValue', 'IntegratedTaxAmount', 'TotalCentralTax', 'StateUTTaxAmount', 'CessAmount'], ...rows, ...(rows.length ? [total] : [])], dateCols: [], widths: [12, 12, 8, 14, 14, 14, 18, 16, 16, 12] }
}

// GSTR-3B style summary for the month (sales = outward supplies, purchases = input tax credit)
export function gstSummary(bills) {
  const z = () => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0, bills: 0, net: 0 })
  const out = {}
  ;['S', 'P'].forEach((k) => {
    const o = z(); const slab = { 5: 0, 12: 0, 18: 0, 28: 0, 0: 0 }
    bills.filter((b) => b.kind === k).forEach((b) => {
      const t = taxCols(b), tax = n(b.sum_gst)
      o.taxable += n(b.v0) + n(b.v5) + n(b.v12) + n(b.v18) + n(b.v28); o.bills++; o.net += n(b.net)
      if (b.inter) o.igst += tax; else { o.cgst += tax / 2; o.sgst += tax / 2 }
      slab[0] += n(b.v0); slab[5] += n(b.v5); slab[12] += n(b.v12); slab[18] += n(b.v18); slab[28] += n(b.v28)
    })
    o.slab = slab; o.tax = o.cgst + o.sgst + o.igst; out[k] = o
  })
  return out
}