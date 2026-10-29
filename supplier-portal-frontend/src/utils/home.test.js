import { describe, expect, it } from 'vitest'
import { daysFrom, inDays, loansSummary, upcomingItems } from './home'

const TODAY = new Date('2026-10-28T15:30:00')

describe('daysFrom / inDays', () => {
  it('counts whole days from local midnight, and is null for anything that is not a date', () => {
    expect(daysFrom('2026-10-28', TODAY)).toBe(0)
    expect(daysFrom('2026-11-02T10:00:00', TODAY)).toBe(5)
    expect(daysFrom('2026-10-27', TODAY)).toBe(-1)
    expect(daysFrom('', TODAY)).toBeNull()
    expect(daysFrom(null, TODAY)).toBeNull()
    expect([inDays(0), inDays(1), inDays(5), inDays(-1), inDays(-3), inDays(null)]).toEqual(['Today', 'In 1 day', 'In 5 days', '1 day ago', '3 days ago', ''])
  })
})

describe('loansSummary', () => {
  const journey = (sanctions, drawdowns = []) => ({ onboarded: true, sanctions, drawdowns, invoices: [] })
  it('adds approved limits only, counts drawdowns by status', () => {
    const s = loansSummary(journey(
      [{ status: 'approved', limit: 5000000, currency: 'INR' }, { status: 'approved', limit: '2500000', currency: 'INR' }, { status: 'under_review', limit: 9e9 }, { status: 'not_approved', limit: 1 }],
      [{ status: 'approved' }, { status: 'disbursed' }, { status: 'settled' }, { status: 'requested' }, { status: 'not_approved' }],
    ))
    // Disbursed and settled drawdowns were approved first (LAS's statuses), so they count as approved.
    expect(s).toEqual({ approvedSanctions: 2, limit: 7500000, currency: 'INR', drawdownsApproved: 3, drawdownsInReview: 1 })
  })
  it('never adds amounts in different currencies', () => {
    const s = loansSummary(journey([{ status: 'approved', limit: 1, currency: 'INR' }, { status: 'approved', limit: 1, currency: 'USD' }]))
    expect(s.limit).toBeNull()
    expect(s.approvedSanctions).toBe(2)
  })
  it('has no limit (not zero) when nothing is approved', () => {
    expect(loansSummary(journey([{ status: 'under_review', limit: 5 }])).limit).toBeNull()
  })
})

describe('upcomingItems', () => {
  const home = (over = {}) => ({ agreement: null, invoices: { returned: 0 }, change_requests: { open: 0 }, ...over })

  it('is empty when nothing needs attention', () => {
    expect(upcomingItems(home(), { onboarded: true, invoices: [] }, TODAY)).toEqual([])
  })

  it('never links to the hidden Agreement section', () => {
    const agreements = [
      { agreement_no: 'AGR-9', status: 'sent', awaiting_signature: true, signing_link_expires_at: '2026-11-01T00:00:00' },
      { agreement_no: 'AGR-2', status: 'signed', valid_until: '2027-01-15' },
    ]
    for (const agreement of agreements) expect(upcomingItems(home({ agreement }), null, TODAY)).toEqual([])
  })

  it('lists the three soonest LAS dues that are not past, soonest first, then undated items; at most four', () => {
    const invoices = ['2026-12-31', '2026-09-30', '2026-11-30', '2027-01-31', '2026-10-31'].map((dueDate, n) => ({ id: n, title: `Dues ${n}`, amount: 100, currency: 'INR', dueDate }))
    const items = upcomingItems(home({ invoices: { returned: 2 }, change_requests: { open: 1 } }), { onboarded: true, invoices }, TODAY)
    expect(items.map((i) => [i.kind, i.date || null])).toEqual([
      ['dues', '2026-10-31'], ['dues', '2026-11-30'], ['dues', '2026-12-31'], ['invoice', null],
    ])
    expect(items[3].title).toBe('2 invoices need correction')
  })

  it('ignores dues while loans are not onboarded, and words one returned invoice in the singular', () => {
    const items = upcomingItems(home({ invoices: { returned: 1 } }), { onboarded: false, invoices: [{ dueDate: '2026-11-30' }] }, TODAY)
    expect(items.map((i) => i.title)).toEqual(['1 invoice needs correction'])
  })
})
