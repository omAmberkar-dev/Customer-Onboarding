import { describe, expect, it } from 'vitest'
import { currentPhaseOf, scopeOf, sumOf, trackerOf } from './loanTracker'

const TODAY = new Date('2026-10-28T12:00:00')
const journey = (over = {}) => ({ onboarded: true, sanctions: [], drawdowns: [], invoices: [], invoicesAvailable: true, ...over })
const sanction = (over = {}) => ({ id: '1000-11', requestNo: '11', sanctionNo: '', status: 'under_review', limit: 5000000, currency: 'INR', appliedOn: '2026-10-01', decidedOn: '', startDate: '', endDate: '', hasDocument: false, ...over })
const approved = (over = {}) => sanction({ sanctionNo: '100411', status: 'approved', decidedOn: '2026-10-05', startDate: '2026-10-06', endDate: '2027-10-05', hasDocument: true, ...over })
const drawdown = (over = {}) => ({ id: '1000-5', requestNo: '5', drawdownNo: '', sanctionNo: '100411', status: 'requested', amount: 1000000, currency: 'INR', requestedOn: '2026-10-10', endDate: '2027-04-10', ...over })
const states = (t) => Object.fromEntries(t.phases.map((p) => [p.id, [p.state, p.steps.map((s) => s.state).join(',')]]))

describe('trackerOf', () => {
  it('a new customer: only onboarding done, the application is the current step', () => {
    const t = trackerOf(journey(), { today: TODAY })
    expect(states(t)).toEqual({
      origination: ['current', 'done,current,upcoming'],
      sanction: ['upcoming', 'upcoming,upcoming,upcoming'],
      disbursement: ['upcoming', 'upcoming,upcoming,upcoming'],
      servicing: ['upcoming', 'upcoming,upcoming'],
    })
    expect(t.current).toBe('origination')
    expect(t.phases[0].steps[1].note).toBe('Your relationship manager raises it for you.')
  })

  it('an application under review: assessment and approval are in progress', () => {
    const t = trackerOf(journey({ sanctions: [sanction()] }), { today: TODAY })
    expect(states(t).origination).toEqual(['current', 'done,done,current'])
    expect(states(t).sanction).toEqual(['current', 'current,upcoming,upcoming'])
    expect(t.phases[0].steps[1]).toMatchObject({ note: 'Sanction Request No. 11', date: '2026-10-01' })
    expect(t.current).toBe('origination')
  })

  it('an approved sanction: memo issued, facility active, a drawdown can be requested', () => {
    const t = trackerOf(journey({ sanctions: [approved()] }), { today: TODAY })
    expect(states(t).sanction).toEqual(['done', 'done,done,done'])
    expect(t.phases[1].steps[0]).toMatchObject({ note: 'Sanction No. 100411', date: '2026-10-05' })
    expect(t.phases[1].steps[2].note).toBe('Valid until 2027-10-05')
    expect(states(t).disbursement).toEqual(['current', 'current,upcoming,upcoming'])
    expect(t.current).toBe('disbursement')
    expect(t.totals).toMatchObject({ applications: 1, activeFacilities: 1, sanctionedLimit: { amount: 5000000, currency: 'INR' } })
  })

  it('a sanction approved for a later start is not yet active', () => {
    const t = trackerOf(journey({ sanctions: [approved({ startDate: '2026-11-01' })] }), { today: TODAY })
    expect(t.phases[1].steps[2]).toMatchObject({ state: 'current', note: 'Starts 2026-11-01' })
    expect(t.totals.activeFacilities).toBe(0)
  })

  it('a refused application stops the journey at the sanction', () => {
    const t = trackerOf(journey({ sanctions: [sanction({ status: 'not_approved', decidedOn: '2026-10-04' })] }), { today: TODAY })
    expect(states(t).sanction[0]).toBe('stopped')
    expect(t.phases[1].steps[0]).toMatchObject({ state: 'stopped', note: 'Your application was not approved.' })
    expect(t.current).toBe('sanction')
  })

  it('drawdowns move through approval, disbursement and settlement', () => {
    const at = (status, extra = {}) => trackerOf(journey({ sanctions: [approved()], drawdowns: [drawdown({ status, ...extra })] }), { today: TODAY })
    expect(states(at('requested')).disbursement).toEqual(['current', 'done,current,upcoming'])
    expect(states(at('approved', { drawdownNo: '23000068' })).disbursement).toEqual(['current', 'done,done,current'])
    expect(at('approved', { drawdownNo: '23000068' }).phases[2].steps[1].note).toBe('Drawdown No. 23000068')
    const paid = at('disbursed', { drawdownNo: '23000068' })
    expect(states(paid).disbursement).toEqual(['done', 'done,done,done'])
    expect(paid.phases[2].steps[2].amount).toEqual({ amount: 1000000, currency: 'INR' })
    expect(states(paid).servicing).toEqual(['current', 'current,current'])
    expect(paid.phases[3].steps[1].note).toBe('Repay by 2027-04-10')
    expect(paid.current).toBe('servicing')
    expect(states(at('settled')).servicing).toEqual(['current', 'current,done'])
    expect(states(at('not_approved')).disbursement).toEqual(['stopped', 'done,stopped,upcoming'])
  })

  it('posted invoices complete invoicing; unreadable invoices are unknown, not missing', () => {
    const base = { sanctions: [approved()], drawdowns: [drawdown({ status: 'settled' })] }
    const t = trackerOf(journey({ ...base, invoices: [{ id: 'a', sanctionNo: '100411', dueDate: '2026-10-31' }] }), { today: TODAY })
    expect(states(t).servicing).toEqual(['done', 'done,done'])
    expect(t.current).toBe('servicing') // all done: the last phase
    const unknown = trackerOf(journey({ ...base, invoicesAvailable: false }), { today: TODAY })
    expect(unknown.phases[3].steps[0]).toMatchObject({ state: 'unknown', note: 'Your invoices can’t be shown right now.' })
  })
})

describe('one application at a time', () => {
  const two = journey({
    sanctions: [approved(), sanction({ id: '1000-12', requestNo: '12', appliedOn: '2026-10-20' })],
    drawdowns: [drawdown({ status: 'disbursed' }), drawdown({ id: '1000-9', sanctionNo: '100499', status: 'requested' })],
    invoices: [{ id: 'a', sanctionNo: '100411' }, { id: 'b', sanctionNo: '100499' }],
  })

  it('keeps only that sanction’s drawdowns and invoices', () => {
    expect(scopeOf(two, '1000-11')).toMatchObject({ sanctions: [{ id: '1000-11' }], drawdowns: [{ id: '1000-5' }], invoices: [{ id: 'a' }] })
    // An application without a Sanction No. has no drawdowns or invoices yet.
    expect(scopeOf(two, '1000-12')).toMatchObject({ drawdowns: [], invoices: [] })
    expect(scopeOf(two, 'nope')).toEqual({ sanctions: [], drawdowns: [], invoices: [] })
  })

  it('matches a sanction to its invoices whether or not SAP padded the number', () => {
    const padded = journey({ sanctions: [approved({ sanctionNo: '0000100411' })], drawdowns: [drawdown()], invoices: [{ id: 'a', sanctionNo: '100411' }] })
    expect(scopeOf(padded, '1000-11')).toMatchObject({ drawdowns: [{ id: '1000-5' }], invoices: [{ id: 'a' }] })
  })

  it('gives each application its own current phase', () => {
    expect(currentPhaseOf(two, '1000-11', TODAY).id).toBe('servicing')
    expect(currentPhaseOf(two, '1000-12', TODAY).id).toBe('origination')
  })
})

describe('sumOf', () => {
  it('adds amounts in one currency only', () => {
    expect(sumOf([{ limit: 1, currency: 'INR' }, { limit: '2' }], 'limit')).toEqual({ amount: 3, currency: 'INR' })
    expect(sumOf([{ limit: 1, currency: 'INR' }, { limit: 2, currency: 'USD' }], 'limit')).toEqual({ amount: null, currency: null })
    expect(sumOf([], 'limit')).toEqual({ amount: 0, currency: 'INR' })
  })
})
