// Party statement: bills, payments and a running balance, built from ledger_entries and party_opening (pure functions).
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const SIDE = {
  recv: { bill: 'S', paid: ['RS', 'SR', 'D'] },   // customers: bills raise the balance, receipts / returns / discounts reduce it
  pay: { bill: 'P', paid: ['PA'] },               // suppliers: purchase bills raise the balance, payments reduce it
}
export const KIND_TEXT = { S: 'Credit bill', P: 'Purchase bill', RS: 'Receipt', PA: 'Payment', SR: 'Sales return', D: 'Discount allowed' }

// An account's opening balance belongs to the receivable side if positive, to the payable side if negative
export const openingFor = (side, op) => (side === 'recv' ? Math.max(Number(op) || 0, 0) : Math.max(-(Number(op) || 0), 0))

// entries: ledger_entries rows of ONE account; openings: [{fy, op}] of the same account. Returns rows with a running balance.
export function statement(entries, openings, side, from, to) {
  const sd = SIDE[side], opByFy = new Map(openings.map((o) => [o.fy, openingFor(side, o.op)]))
  const mine = entries.filter((e) => e.kind === sd.bill || sd.paid.includes(e.kind))
  const fys = [...new Set([...opByFy.keys(), ...mine.map((e) => e.fy)])].sort()
  const all = []
  fys.forEach((fy) => {
    let bal = opByFy.get(fy) || 0
    all.push({ kind: 'OPEN', fy, d: fy.slice(0, 4) + '-04-01', bal: r2(bal) })
    mine.filter((e) => e.fy === fy).sort((a, b) => a.d.localeCompare(b.d) || String(a.vno).localeCompare(String(b.vno), 'en', { numeric: true })).forEach((e) => {
      const bill = e.kind === sd.bill
      bal += bill ? Number(e.amount) : -Number(e.amount)
      all.push({ kind: e.kind, fy, d: e.d, vno: e.vno, ref: e.ref, bill: bill ? r2(e.amount) : 0, paid: bill ? 0 : r2(e.amount), bal: r2(bal) })
    })
  })
  // opening for the window = balance after the last row before "from"
  const rows = []
  let last = all.find((r) => r.kind === 'OPEN') || null
  if (from) all.forEach((r) => { if (r.d < from) last = r })
  const open = last ? last.bal : 0
  all.forEach((r) => { if (r.kind !== 'OPEN' && (!from || r.d >= from) && (!to || r.d <= to)) rows.push(r) })
  const closing = rows.length ? rows[rows.length - 1].bal : open
  return { open, rows, closing, billed: r2(rows.reduce((s, r) => s + r.bill, 0)), paid: r2(rows.reduce((s, r) => s + r.paid, 0)) }
}
