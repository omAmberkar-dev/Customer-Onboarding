import { describe, expect, it } from 'vitest'
import { approvalSteps, compactMoney, disbursementsOf, filterRows, instalmentsOf, label, scheduleBySanction, toneOf } from './finance'
import { FINANCE } from '../test/financeFixture'

describe('filterRows', () => {
  const spec = { dateField: 'date', typeField: 'type', searchFields: ['reference', 'paymentReference', 'description', 'type'] }
  it('applies the date range, type, disbursement and status exactly as the statement does', () => {
    const rows = FINANCE.transactions
    expect(filterRows(rows, { from: '2026-10-01' }, spec).map((r) => r.id)).not.toContain('disb-23000068')
    expect(filterRows(rows, { to: '2026-09-30' }, spec).map((r) => r.id)).toEqual(['disb-23000068', 'chg-1000-23000068-1'])
    expect(filterRows(rows, { type: 'interest_payment' }, spec)).toHaveLength(2)
    expect(filterRows(rows, { disbursement: '23000068', status: 'posted' }, spec)).toHaveLength(4) // payout, a charge, 2 interest payments
    expect(filterRows(rows, { status: 'pending' }, spec).map((r) => r.reference)).toEqual(['7002'])
  })
  it('searches references, UTRs, descriptions and the type in words', () => {
    const rows = FINANCE.transactions
    expect(filterRows(rows, { search: 'utr7002' }, spec)).toHaveLength(1)
    expect(filterRows(rows, { search: 'loan disbursement' }, spec).map((r) => r.id)).toEqual(['disb-23000068'])
    expect(filterRows(null, {}, spec)).toEqual([])
  })
})

describe('instalmentsOf', () => {
  it('puts one disbursement and due date on one row, principal, interest and charges apart', () => {
    const rows = instalmentsOf(FINANCE.schedule)
    expect(rows).toHaveLength(4)
    const jan = rows.find((r) => r.dueDate === '2099-01-31')
    expect([jan.interest, jan.charges, jan.principal, jan.total, jan.outstanding, jan.status]).toEqual([7800, 500, 0, 8300, 8300, 'upcoming'])
    expect(rows.find((r) => r.dueDate === '2026-10-31').status).toBe('overdue')
    expect(rows.find((r) => r.dueDate === '2026-09-30').status).toBe('paid')
  })
  it('adds in paise, so a sum never drifts, and calls a part-paid future instalment partially paid', () => {
    const rows = instalmentsOf([
      { disbursementNo: '1', dueDate: '2099-01-01', kind: 'interest', amount: 0.1, paid: 0.1, outstanding: 0, status: 'paid' },
      { disbursementNo: '1', dueDate: '2099-01-01', kind: 'fee', amount: 0.2, paid: 0, outstanding: 0.2, status: 'upcoming' },
    ])
    expect(rows[0].total).toBe(0.3)
    expect(rows[0].status).toBe('partially_paid')
  })
})

describe('words and amounts', () => {
  it('writes lakh and crore for tight places, and never a number for nothing', () => {
    expect(compactMoney(1000000)).toBe('₹10 L')
    expect(compactMoney(12500000)).toBe('₹1.25 Cr')
    expect(compactMoney(4857.53)).toBe('₹4,858')
    expect(compactMoney(-12000)).toBe('−₹12,000')
    expect(compactMoney(null)).toBe('—')
  })
  it('labels and tones every status LAS sends', () => {
    for (const code of ['posted', 'pending', 'scheduled', 'overdue', 'due', 'partially_paid', 'paid', 'upcoming', 'confirmed', 'allocated', 'disbursed', 'pending_approval', 'rejected']) {
      expect(label(code)).not.toBe(code)
      expect(['green', 'blue', 'amber', 'red', 'grey']).toContain(toneOf(code))
    }
    expect(toneOf('overdue')).toBe('red')
    expect(disbursementsOf(FINANCE.transactions)).toEqual(['23000068'])
  })
})

describe('scheduleBySanction', () => {
  it('groups instalments by sanction, then drawdown, with due, paid and remaining at each level', () => {
    const rows = instalmentsOf([
      ...FINANCE.schedule,
      { id: 'x', disbursementNo: '23000070', sanctionNo: '100413', instalment: 1, dueDate: '2099-03-31', kind: 'interest', amount: 0.1, paid: 0, outstanding: 0.1, status: 'upcoming' },
      { id: 'y', disbursementNo: '23000070', sanctionNo: '100413', instalment: 1, dueDate: '2099-03-31', kind: 'fee', amount: 0.2, paid: 0, outstanding: 0.2, status: 'upcoming' },
    ])
    const loans = scheduleBySanction(rows)
    expect(loans.map((l) => [l.sanctionNo, l.drawdowns.map((d) => d.disbursementNo)])).toEqual([['100411', ['23000068']], ['100413', ['23000070']]])
    const main = loans[0]
    expect([main.total, main.paid, main.outstanding]).toEqual([1023760.27, 10602.74, 1013157.53])
    expect(main.drawdowns[0].instalments.map((r) => r.dueDate)).toEqual(['2026-09-30', '2026-10-31', '2099-01-31', '2099-02-28'])
    expect(loans[1].outstanding).toBe(0.3) // in paise, never 0.30000000000000004
    expect(scheduleBySanction(null)).toEqual([])
  })
})

describe('approvalSteps', () => {
  it('follows maker, checker, approved; a rejection stops it; LAS has no authorizer step', () => {
    expect(approvalSteps('maker').map(([, , st]) => st)).toEqual(['current', 'upcoming', 'upcoming'])
    expect(approvalSteps('checker').map(([, , st]) => st)).toEqual(['done', 'current', 'upcoming'])
    expect(approvalSteps('approved').map(([, , st]) => st)).toEqual(['done', 'done', 'done'])
    expect(approvalSteps('rejected').map(([key, , st]) => [key, st])).toEqual([['maker', 'done'], ['checker', 'done'], ['rejected', 'stopped']])
    expect(approvalSteps(undefined)).toEqual([])
    expect(approvalSteps('approved').some(([key]) => key === 'authorizer')).toBe(false)
  })
  it('words the new codes and colours them', () => {
    expect([label('interest_charge'), label('partially_allocated'), toneOf('unallocated'), toneOf('maker')]).toEqual(['Interest charged', 'Partially allocated', 'amber', 'amber'])
  })
})
