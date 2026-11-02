import { describe, expect, it } from 'vitest'
import { compactMoney, disbursementsOf, filterRows, instalmentsOf, label, toneOf } from './finance'
import { FINANCE } from '../test/financeFixture'

describe('filterRows', () => {
  const spec = { dateField: 'date', typeField: 'type', searchFields: ['reference', 'paymentReference', 'description', 'type'] }
  it('applies the date range, type, disbursement and status exactly as the statement does', () => {
    const rows = FINANCE.transactions
    expect(filterRows(rows, { from: '2026-10-01' }, spec).map((r) => r.id)).not.toContain('disb-23000068')
    expect(filterRows(rows, { to: '2026-09-30' }, spec).map((r) => r.id)).toEqual(['disb-23000068'])
    expect(filterRows(rows, { type: 'interest_payment' }, spec)).toHaveLength(2)
    expect(filterRows(rows, { disbursement: '23000068', status: 'posted' }, spec)).toHaveLength(3)
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
