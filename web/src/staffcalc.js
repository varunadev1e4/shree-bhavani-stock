// Salary arithmetic shared by the Staff screen and the CA & GST profit figures.
export const inMonth = (d, ym) => Number(d.slice(0, 4)) * 100 + Number(d.slice(5, 7)) === ym
export const daysIn = (ym) => new Date(Math.floor(ym / 100), ym % 100, 0).getDate()
export const sum = (l, k) => l.filter((e) => e.kind === k).reduce((s, e) => s + Number(e.amount || 0), 0)
export const cnt = (l, k) => l.filter((e) => e.kind === k).length

// All the money arithmetic for one person and one month
export function calc(emp, all, ym) {
  const mine = all.filter((e) => e.emp_id === emp.id), m = mine.filter((e) => inMonth(e.d, ym))
  const salary = Number(emp.salary) || 0, days = daysIn(ym)
  const unpaid = cnt(m, 'absent') + 0.5 * cnt(m, 'half')
  const cut = Math.round((salary / days) * unpaid)
  const net = salary - cut + sum(m, 'bonus') - sum(m, 'deduction')
  const recovered = sum(m, 'recovery'), paid = sum(m, 'salary')
  return { m, salary, days, unpaid, cut, bonus: sum(m, 'bonus'), other: sum(m, 'deduction'), net, recovered, paid, balance: net - recovered - paid,
    advance: sum(mine, 'advance') - sum(mine, 'recovery'), paidLeave: cnt(m, 'paidleave') }
}

// Salary cost of the whole staff for a month (people who were working then)
export function staffCost(emps, all, ym) {
  const end = ym.toString().slice(0, 4) + '-' + String(ym % 100).padStart(2, '0') + '-' + String(daysIn(ym)).padStart(2, '0')
  return emps.filter((e) => (!e.join_date || e.join_date <= end) && (e.active || all.some((x) => x.emp_id === e.id && inMonth(x.d, ym))))
    .reduce((s, e) => s + calc(e, all, ym).net, 0)
}
