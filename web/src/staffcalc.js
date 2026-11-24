// Salary arithmetic shared by the Staff screen and the CA & GST profit figures.
export const inMonth = (d, ym) => Number(d.slice(0, 4)) * 100 + Number(d.slice(5, 7)) === ym
export const ymOf = (d) => Number(d.slice(0, 4)) * 100 + Number(d.slice(5, 7))
export const nextYm = (ym) => (ym % 100 === 12 ? (Math.floor(ym / 100) + 1) * 100 + 1 : ym + 1)
export const daysIn = (ym) => new Date(Math.floor(ym / 100), ym % 100, 0).getDate()
export const sum = (l, k) => l.filter((e) => e.kind === k).reduce((s, e) => s + Number(e.amount || 0), 0)
export const cnt = (l, k) => l.filter((e) => e.kind === k).length

// Advance balance month by month. If the employee has an automatic monthly cut (employees.adv_cut),
// that amount is cut every month from adv_cut_from until the advance is finished, unless you
// recorded a bigger cut yourself. Nothing is written to the database for the automatic part.
export function advanceState(emp, mine, ym) {
  const adv = mine.filter((e) => e.kind === 'advance'), rec = mine.filter((e) => e.kind === 'recovery')
  const all = [...adv, ...rec]
  const res = { out: 0, cut: 0, auto: false, actual: 0 }
  if (!all.length) return res
  const first = Math.min(...all.map((e) => ymOf(e.d)))
  const planCut = Number(emp.adv_cut) || 0, from = emp.adv_cut_from ? ymOf(emp.adv_cut_from) : null
  let out = 0
  for (let k = first, n = 0; k <= ym && n < 600; k = nextYm(k), n++) {
    const a = adv.filter((e) => inMonth(e.d, k)).reduce((s, e) => s + Number(e.amount || 0), 0)
    const actual = rec.filter((e) => inMonth(e.d, k)).reduce((s, e) => s + Number(e.amount || 0), 0)
    out += a
    const planned = planCut > 0 && from != null && k >= from ? Math.min(planCut, Math.max(0, out)) : 0
    const cut = Math.max(actual, planned)
    out -= cut
    if (k === ym) { res.cut = cut; res.actual = actual; res.auto = planned > actual }
  }
  res.out = out
  return res
}

// Paid leaves used in the financial year (April to March) that contains this month
export function leaveBalance(emp, all, ym) {
  const y = Math.floor(ym / 100), m = ym % 100, start = (m >= 4 ? y : y - 1) * 100 + 4
  const end = (m >= 4 ? y + 1 : y) * 100 + 3
  const used = all.filter((e) => e.emp_id === emp.id && e.kind === 'paidleave' && ymOf(e.d) >= start && ymOf(e.d) <= end).length
  const quota = Number(emp.leave_quota) || 0
  return { quota, used, left: quota - used, fy: start }
}

// All the money arithmetic for one person and one month
export function calc(emp, all, ym) {
  const mine = all.filter((e) => e.emp_id === emp.id), m = mine.filter((e) => inMonth(e.d, ym))
  const full = Number(emp.salary) || 0, days = daysIn(ym)
  // After the last working day the salary stops; in that month it is paid up to that day
  let salary = full
  if (emp.leave_date) { const lm = ymOf(emp.leave_date); if (ym > lm) salary = 0; else if (ym === lm) salary = Math.round((full * Number(emp.leave_date.slice(8, 10))) / days) }
  const unpaid = emp.no_attendance ? 0 : cnt(m, 'absent') + 0.5 * cnt(m, 'half')
  const cut = salary > 0 ? Math.round((full / days) * unpaid) : 0
  const overtime = sum(m, 'overtime')
  const net = salary - cut + sum(m, 'bonus') + overtime - sum(m, 'deduction')
  const adv = advanceState(emp, mine, ym)
  const recovered = adv.cut, paid = sum(m, 'salary')
  return { m, salary, days, unpaid, cut, bonus: sum(m, 'bonus'), overtime, other: sum(m, 'deduction'), net, recovered, autoCut: adv.auto, paid,
    balance: net - recovered - paid, advance: adv.out, paidLeave: cnt(m, 'paidleave'), overpaid: net - recovered - paid < -0.5 }
}

// Salary cost of the whole staff for a month (people who were working then)
export function staffCost(emps, all, ym) {
  const end = ym.toString().slice(0, 4) + '-' + String(ym % 100).padStart(2, '0') + '-' + String(daysIn(ym)).padStart(2, '0')
  return emps.filter((e) => (!e.join_date || e.join_date <= end) && (e.active || all.some((x) => x.emp_id === e.id && inMonth(x.d, ym))))
    .reduce((s, e) => s + calc(e, all, ym).net, 0)
}

// Cash in hand with an employee: cash given - cash returned - what they spent for the shop
export function cashBalance(cash, exps) {
  const given = cash.filter((c) => c.kind === 'given').reduce((s, c) => s + Number(c.amount), 0)
  const back = cash.filter((c) => c.kind === 'returned').reduce((s, c) => s + Number(c.amount), 0)
  const spent = exps.reduce((s, x) => s + Number(x.amount), 0)
  return { given, back, spent, balance: given - back - spent }   // negative = the shop owes the employee
}
