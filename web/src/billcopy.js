import { supabase } from './supabase'
import { SHOP, GSTIN, fetchAll } from './util'
import { inWords } from './exporter'

// Bill copy laid out like Profit Maker's GST INVOICE, built from synced data (sales_lines + bill_heads). Read only.
// Shop details printed at the top and bottom. Change here, or set these in Vercel (VITE_...) to override.
const E = import.meta.env
export const SHOP_INFO = {
  addr1: E.VITE_SHOP_ADDR1 || 'HNO 10-3-166/1,GROUND FLOOR,MAMILLAGUDEM',
  addr2: E.VITE_SHOP_ADDR2 || 'KHAMMAM -507001',
  phone: E.VITE_SHOP_PHONE || '9701656107',
  dl: (E.VITE_SHOP_DL || '20B:TG/KMM/2025-129354|21B:TG/KMM/2025-129354').split('|'),
  bank: E.VITE_SHOP_BANK || 'KOTAK MAHINDRA A/C :9701656107, IFSC-KKBK0008362, GANDHI CHOWK BRANCH',
  juris: E.VITE_SHOP_JURIS || 'KHAMMAM',
  note: 'section 18 of the drugs & cosmetics act 1940.',
}
const COLS = 'id,fy,d,bill_no,party,party_code,city,product,pack,batch,qty,free,rate,dis,gst,amount,hsn,mrp,exp,mfg'
const COLS_OLD = 'id,fy,d,bill_no,party,party_code,city,product,pack,batch,qty,free,rate,dis,gst,amount'
const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const mny = (v) => n2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
const dm = (s) => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '')
const clean = (t) => String(t || '').trim().replace(/[%,()*]/g, '')

function group(rows) {
  const m = new Map()
  rows.forEach((r) => { const k = r.fy + '|' + r.bill_no + '|' + r.d; if (!m.has(k)) m.set(k, { key: k, fy: r.fy, bill_no: r.bill_no, d: r.d, party: r.party, city: r.city, code: r.party_code, lines: [] }); m.get(k).lines.push(r) })
  const out = [...m.values()]
  out.forEach((g) => { g.lines.sort((a, b) => a.id - b.id); g.total = totals(g.lines).total })
  return out.sort((a, b) => b.d.localeCompare(a.d))
}

export function totals(lines) {
  let taxable = 0, gst = 0
  lines.forEach((l) => { const a = Number(l.amount) || 0, g = Number(l.gst) || 0; taxable += a; gst += a * g / 100 })
  return { taxable: n2(taxable), gst: n2(gst), total: n2(taxable + gst), qty: lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), free: lines.reduce((s, l) => s + (Number(l.free) || 0), 0) }
}

async function linesFor(nos) {
  let r = await supabase.from('sales_lines').select(COLS).eq('kind', 'S').in('bill_no', nos).order('d', { ascending: false }).limit(2000)
  if (r.error) r = await supabase.from('sales_lines').select(COLS_OLD).eq('kind', 'S').in('bill_no', nos).order('d', { ascending: false }).limit(2000)
  return r.data || []
}

// The number a customer sees on the invoice (InvNo) or the software's own number (FeedNo) both work.
export async function findBills(no, date, party) {
  const t = clean(no)
  if (!t) return []
  let feeds = []
  let h = await supabase.from('bill_heads').select('fy,feed_no,inv_no,d').or('feed_no.eq.' + t + ',inv_no.eq.' + t).limit(50)
  if (!h.error && !(h.data || []).length) h = await supabase.from('bill_heads').select('fy,feed_no,inv_no,d').or('feed_no.ilike.%' + t + '%,inv_no.ilike.%' + t + '%').limit(50)
  if (!h.error) feeds = [...new Set((h.data || []).map((x) => x.feed_no))]
  if (!feeds.length) feeds = [t]
  let rows = await linesFor(feeds)
  if (!rows.length) { const r = await supabase.from('sales_lines').select(COLS_OLD).eq('kind', 'S').ilike('bill_no', '%' + t + '%').order('d', { ascending: false }).limit(1000); rows = r.data || [] }
  let g = group(rows)
  if (date) { const f = g.filter((x) => x.d === String(date).slice(0, 10)); if (f.length) g = f }
  if (party) { const f = g.filter((x) => x.party === party); if (f.length) g = f }
  return g
}

export async function billExtra(g) {
  const [a, b] = await Promise.all([
    supabase.from('bill_heads').select('*').eq('fy', g.fy).eq('feed_no', g.bill_no).limit(5),
    supabase.from('parties').select('phone,phone2').eq('name', g.party).limit(1),
  ])
  const heads = a.data || []
  const hd = heads.find((x) => x.d === g.d) || heads[0] || null
  return { hd, pty: (b.data || [])[0] || null }
}

const slabsOf = (g, hd) => {
  const t = totals(g.lines)
  if (hd) return [[0, hd.gv0, 0], [5, hd.gv1, hd.g1], [12, hd.gv2, hd.g2], [18, hd.gv3, hd.g3], [28, hd.gv4, hd.g4]].map(([r, v, x]) => ({ r, v: n2(v), x: n2(x) }))
  const by = new Map()
  g.lines.forEach((l) => { const r = Number(l.gst) || 0, a = Number(l.amount) || 0; const s = by.get(r) || { r, v: 0, x: 0 }; s.v += a; s.x += a * r / 100; by.set(r, s) })
  return [0, 5, 12, 18, 28].map((r) => { const s = by.get(r); return { r, v: n2(s ? s.v : 0), x: n2(s ? s.x : 0) } })
}

export async function billBlob(g, hd) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), L = 28, R = W - 28
  const t = totals(g.lines), sl = slabsOf(g, hd)
  const sub = hd ? n2(hd.sub_total) : t.taxable
  const gstAmt = hd ? n2(hd.sum_gst) : t.gst
  const net = hd ? n2(hd.net) : Math.round(t.total)
  const inter = !!(hd && hd.inter)
  const F = (s, z = 9) => { doc.setFont('courier', s); doc.setFontSize(z) }
  const hr = (y) => { doc.setDrawColor(60); doc.setLineWidth(0.6); doc.line(L, y, R, y) }

  F('bold', 13); doc.text('GST INVOICE', W / 2, 34, { align: 'center' })
  F('bold', 14); doc.text(SHOP, W / 2, 52, { align: 'center' })
  F('normal', 9)
  doc.text(SHOP_INFO.addr1, L, 70); doc.text(SHOP_INFO.addr2, L, 82); doc.text('Ph : ' + SHOP_INFO.phone, L, 94)
  doc.text('Gst No: ' + GSTIN, R, 70, { align: 'right' })
  SHOP_INFO.dl.forEach((x, i) => doc.text((i === 0 ? 'DL Nos: ' : '      : ') + x, R, 82 + i * 12, { align: 'right' }))
  hr(104)
  const p = hd || {}
  F('bold', 10); doc.text('To :' + (g.party || ''), L, 120)
  F('normal', 9)
  const addr = [p.add1, p.add2, p.add3, p.add4].filter(Boolean)
  let y = 133
  addr.forEach((a) => { doc.text(a, L + 20, y); y += 12 })
  doc.text([p.city, p.pin].filter(Boolean).join('  ') + (p.phone ? '   Ph: ' + p.phone : ''), L + 20, y)
  const yEnd = y
  if (p.gstin) doc.text('GSTIN : ' + p.gstin, 300, 133)
  const dls = [p.dl1, p.dl2].filter(Boolean)
  dls.forEach((x, i) => doc.text((i === 0 ? 'DL No : ' : '      : ') + x, 300, 157 + i * 12))
  doc.text('InvNo : ' + g.bill_no, R, 133, { align: 'right' })
  doc.text('InvDate : ' + dm(g.d), R, 145, { align: 'right' })
  doc.text('Type : ' + ((hd && hd.typ) || ''), R, 157, { align: 'right' })
  hr(Math.max(yEnd, 170) + 10)

  const body = g.lines.map((l) => [l.mfg || '', l.hsn || '0', l.product, l.pack || '', l.batch || '', l.exp || '', n2(l.qty).toFixed(1), n2(l.free).toFixed(1), mny(l.rate), mny(l.amount), l.mrp != null ? mny(l.mrp) : '', String(Number(l.gst) || 0), n2(l.dis).toFixed(1)])
  autoTable(doc, {
    startY: Math.max(yEnd, 170) + 14, theme: 'plain',
    head: [['MFG', 'Hsn', 'Product Name', 'Pack', 'Batch', 'Exp', 'Qty', 'Free', 'Rate', 'Amount', 'M.R.P', 'Gst', 'Dis']], body,
    styles: { font: 'courier', fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', lineWidth: { top: 0.6, bottom: 0.6 }, lineColor: [60, 60, 60] },
    margin: { left: L, right: 28, bottom: 230 },
    columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 44 }, 2: { cellWidth: 100 }, 3: { cellWidth: 30 }, 4: { cellWidth: 62 }, 5: { cellWidth: 30 }, 6: { halign: 'right', cellWidth: 26 }, 7: { halign: 'right', cellWidth: 26 }, 8: { halign: 'right', cellWidth: 42 }, 9: { halign: 'right', cellWidth: 46 }, 10: { halign: 'right', cellWidth: 42 }, 11: { halign: 'right', cellWidth: 18 }, 12: { halign: 'right', cellWidth: 22 } },
    didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 6) d.cell.styles.halign = 'right' },
  })
  let by = doc.lastAutoTable.finalY + 14
  if (by > H - 215) { doc.addPage(); by = 40 }
  F('normal', 8.5)
  doc.text('Bank Details : ' + SHOP_INFO.bank, L + 6, by, { maxWidth: R - L - 12 }); by += 18
  hr(by - 6)
  F('bold', 8.5); doc.text('TAXABLE VALUES', L, by + 8); doc.text(inter ? 'IGST AMT' : 'CGST AMT', 190, by + 8); if (!inter) doc.text('SGST AMT', 255, by + 8)
  F('normal', 8.5)
  sl.filter((s) => s.r > 0).forEach((s, i) => {
    const yy = by + 22 + i * 13
    doc.text(s.r + '%: ' + mny(s.v), L, yy)
    if (inter) doc.text(mny(s.x), 190, yy); else { doc.text(mny(s.x / 2), 190, yy); doc.text(mny(s.x / 2), 255, yy) }
  })
  const rx = 330, vx = R
  const right = [['0% Gst Val :', mny(sl[0].v)], ['No.of Items: ' + g.lines.length, 'SubTotal: ' + mny(sub)], ['No.of Units: ' + t.qty, 'Less Disc: ' + mny(hd ? hd.less_disc : 0)], ['(-/+)Adjust: ' + mny(hd ? hd.adjust : 0), 'Gst Amt: ' + mny(gstAmt)], ['Cr.Note Amt: ' + mny(hd ? hd.cr_note : 0), 'Rounding: ' + mny(hd ? hd.rounding : n2(net - t.total))]]
  right.forEach(([a, b], i) => { const yy = by + 8 + i * 13; if (i === 0) { doc.text(a, 400, yy); doc.text(b, vx, yy, { align: 'right' }) } else { doc.text(a, rx, yy); doc.text(b, vx, yy, { align: 'right' }) } })
  const ny = by + 22 + 5 * 13 + 4
  hr(ny)
  F('normal', 9); doc.text(inWords(net).replace(/ Rupees Only$/, ' Rupees Only').replace(/^Zero$/, 'Zero'), L, ny + 16, { maxWidth: 300 })
  F('bold', 11); doc.text('NET PAYABLE: ' + mny(net), R, ny + 34, { align: 'right' })
  hr(ny + 44)
  F('normal', 8); doc.text(SHOP_INFO.note, L, ny + 60)
  doc.text('E.&O.E          Subject To ' + SHOP_INFO.juris + '     Jurisdiction', L, ny + 82); doc.text('For ' + SHOP, R, ny + 82, { align: 'right' })
  return { blob: doc.output('blob'), filename: ('Bill-' + g.bill_no + '-' + g.d).replace(/[^\w-]+/g, '-') + '.pdf', net }
}

// Recent sales bills (newest first) with the printed net amount, for the quick list.
export async function recentBills(from) {
  let rows
  try { rows = await fetchAll('sales_lines', COLS, (q) => q.eq('kind', 'S').gte('d', from), 'recent:' + from) }
  catch (e) { rows = await fetchAll('sales_lines', COLS_OLD, (q) => q.eq('kind', 'S').gte('d', from), 'recent0:' + from) }
  const g = group(rows)
  try {
    const hs = await fetchAll('bill_heads', 'fy,feed_no,d,net,typ', (q) => q.gte('d', from), 'recent-h:' + from)
    const m = new Map(hs.map((h) => [h.fy + '|' + h.feed_no + '|' + h.d, h]))
    g.forEach((x) => { const h = m.get(x.fy + '|' + x.bill_no + '|' + x.d); if (h) { x.net = Number(h.net); x.typ = h.typ } })
  } catch (e) { /* older database without bill_heads */ }
  g.forEach((x) => { if (x.net == null) x.net = Math.round(x.total) })
  return g.sort((a, b) => b.d.localeCompare(a.d) || b.bill_no.localeCompare(a.bill_no, 'en', { numeric: true }))
}
