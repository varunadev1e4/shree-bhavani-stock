// Automatic checks for the money rules. Run before every deploy:   node checks/check.mjs   (from the 2-Website folder)
// It prints PASS or FAIL for each rule and stops with an error if any fails. It does not touch any data.
import { calc, advanceState, leaveBalance, staffCost, cashBalance, daysIn, nextYm } from '../src/staffcalc.js'

let bad = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))) }
const emp = (o) => ({ id: 1, salary: 30000, active: true, ...o })
const e = (kind, d, amount) => ({ emp_id: 1, kind, d, amount })

eq('days in Feb 2028 (leap year)', daysIn(202802), 29)
eq('month after December', nextYm(202612), 202701)

// Salary with one absence and one half day in a 30-day month: 30000/30 = 1000 a day, cut 1500
let c = calc(emp({}), [e('absent', '2026-11-03'), e('half', '2026-11-10')], 202611)
eq('absence and half day cut', c.cut, 1500)
eq('net salary after cut', c.net, 28500)
eq('nothing paid yet = full balance', c.balance, 28500)

// Staff with attendance switched off never lose pay
c = calc(emp({ no_attendance: true }), [e('absent', '2026-11-03')], 202611)
eq('no-attendance employee keeps full salary', c.net, 30000)

// Overtime, bonus, deduction
c = calc(emp({}), [e('overtime', '2026-11-04', 500), e('bonus', '2026-11-05', 1000), e('deduction', '2026-11-06', 200)], 202611)
eq('overtime + bonus - deduction', c.net, 31300)

// Paid in full, then paid again by mistake -> overpaid flag
c = calc(emp({}), [e('salary', '2026-11-30', 30000), e('salary', '2026-11-30', 500)], 202611)
eq('overpaid flag', c.overpaid, true)

// Last working day 15 Nov in a 30-day month = half month
c = calc(emp({ leave_date: '2026-11-15' }), [], 202611)
eq('salary stops at leaving date', c.salary, 15000)
eq('no salary after leaving month', calc(emp({ leave_date: '2026-11-15' }), [], 202612).salary, 0)

// Advance of 6000, automatic cut 2000 a month from Nov: Nov 4000 left, Dec 2000 left, Jan 0
const adv = [e('advance', '2026-11-02', 6000)], em = emp({ adv_cut: 2000, adv_cut_from: '2026-11-01' })
eq('advance left after first cut', advanceState(em, adv, 202611).out, 4000)
eq('advance left after third cut', advanceState(em, adv, 202701).out, 0)
eq('advance never goes below zero', advanceState(em, adv, 202706).out, 0)
// A bigger manual recovery wins over the automatic cut
eq('manual recovery bigger than auto cut', advanceState(em, [...adv, e('recovery', '2026-11-20', 3000)], 202611).cut, 3000)
// Advance carries to next month when nothing is cut
eq('advance carries forward', advanceState(emp({}), adv, 202612).out, 6000)

// Paid leaves counted by financial year (April to March)
const L = [e('paidleave', '2026-03-31'), e('paidleave', '2026-04-01'), e('paidleave', '2026-12-05')]
eq('leaves used this financial year', leaveBalance(emp({ leave_quota: 12 }), L, 202611).used, 2)
eq('leaves left', leaveBalance(emp({ leave_quota: 12 }), L, 202611).left, 10)

eq('cash in hand', cashBalance([{ kind: 'given', amount: 5000 }, { kind: 'returned', amount: 500 }], [{ amount: 1200 }]).balance, 3300)

// Bill number cleaning must be the same everywhere (letter O typed for zero, spaces, small letters)
const norm = (no) => String(no || '').replace(/\s+/g, '').toUpperCase().replace(/O/g, '0')
eq('bill number: ABO1924 = ab 01924', norm('ABO1924'), norm('ab 01924'))
eq('bill number: spaces and case', norm(' ab01924 '), 'AB01924')

console.log(bad ? '\n' + bad + ' CHECK(S) FAILED. Do not deploy.' : '\nAll checks passed.')
process.exit(bad ? 1 : 0)
