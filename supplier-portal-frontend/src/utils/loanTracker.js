/*
 * The loan tracker on Loans & Sanctions: LAS's Lifecycle view (its LifecyclePage: four numbered phases, each with an
 * owner and its steps) for one customer, built only from what LAS's customer journey API sends (GET /vendors/me/loans):
 * sanctions (under_review, approved, not_approved), drawdowns (requested, approved, disbursed, settled, not_approved)
 * and posted invoices.
 *
 * A step is shown done only when that data proves it. LAS's own lifecycle has steps the API does not expose (fees,
 * KYC and agreement checks, pledge confirmation, receipts and allocation, closure), so they are not shown as steps
 * here rather than guessed.
 *
 * Step and phase states: done, current, upcoming, stopped (not approved), unknown (could not be read).
 */

const PAID = ['disbursed', 'settled']
const APPROVED_ON = ['approved', 'disbursed', 'settled']

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10) : '')
const earliest = (values) => values.map(day).filter(Boolean).sort()[0] || ''
const latest = (values) => values.map(day).filter(Boolean).sort().at(-1) || ''
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Amounts added up only when they share one currency; else null (never a sum across currencies).
export function sumOf(items, amountKey) {
  const currencies = new Set(items.map((i) => i.currency || 'INR'))
  if (!items.length) return { amount: 0, currency: 'INR' }
  if (currencies.size !== 1) return { amount: null, currency: null }
  return { amount: items.reduce((s, i) => s + (Number(i[amountKey]) || 0), 0), currency: [...currencies][0] }
}

// A Sanction No. without SAP's leading zeros: LAS sends a sanction's number as SAP holds it, but its invoices' unpadded.
const sanctionKey = (no) => String(no ?? '').trim().replace(/^0+(?=\d)/, '')
export const sameSanction = (a, b) => Boolean(sanctionKey(a)) && sanctionKey(a) === sanctionKey(b)

// The part of the journey one application covers: the sanction, its drawdowns and their invoices (by Sanction No.).
export function scopeOf(journey, sanctionId) {
  if (!sanctionId || sanctionId === 'all') return { sanctions: journey.sanctions, drawdowns: journey.drawdowns, invoices: journey.invoices }
  const s = journey.sanctions.find((x) => x.id === sanctionId)
  if (!s) return { sanctions: [], drawdowns: [], invoices: [] }
  const mine = (x) => sameSanction(s.sanctionNo, x.sanctionNo)
  return { sanctions: [s], drawdowns: journey.drawdowns.filter(mine), invoices: journey.invoices.filter(mine) }
}

const step = (label, state, note = '', date = '') => ({ label, state, note, date })

function phaseState(steps) {
  if (steps.every((s) => s.state === 'done')) return 'done'
  if (steps.some((s) => s.state === 'stopped')) return 'stopped'
  if (steps.some((s) => s.state === 'current' || s.state === 'unknown') || steps.some((s) => s.state === 'done')) return 'current'
  return 'upcoming'
}

export const PHASE_IDS = ['origination', 'sanction', 'disbursement', 'servicing']

export function trackerOf(journey, { sanctionId = 'all', today = new Date() } = {}) {
  const now = isoDay(today)
  const { sanctions, drawdowns, invoices } = scopeOf(journey, sanctionId)
  const one = sanctions.length === 1 ? sanctions[0] : null
  const approved = sanctions.filter((s) => s.status === 'approved')
  const reviewing = sanctions.filter((s) => s.status === 'under_review')
  const decided = sanctions.filter((s) => s.status !== 'under_review')
  const allRefused = sanctions.length > 0 && sanctions.every((s) => s.status === 'not_approved')
  const dApproved = drawdowns.filter((d) => APPROVED_ON.includes(d.status))
  const dRequested = drawdowns.filter((d) => d.status === 'requested')
  const dPaid = drawdowns.filter((d) => PAID.includes(d.status))
  const dSettled = drawdowns.filter((d) => d.status === 'settled')
  const dRefusedAll = drawdowns.length > 0 && drawdowns.every((d) => d.status === 'not_approved')
  const live = approved.filter((s) => (!day(s.startDate) || day(s.startDate) <= now) && (!day(s.endDate) || now <= day(s.endDate)))
  const disbursed = sumOf(dPaid, 'amount')

  const origination = [
    step('Customer onboarding & KYC', 'done', 'Your customer account is approved.'),
    sanctions.length
      ? step('Loan application raised', 'done', one ? `Sanction Request No. ${one.requestNo}` : `${plural(sanctions.length, 'application')} raised`, earliest(sanctions.map((s) => s.appliedOn)))
      : step('Loan application raised', 'current', 'Your relationship manager raises it for you.'),
    decided.length
      ? step('Credit assessment', 'done', 'Assessment completed.', latest(decided.map((s) => s.decidedOn)))
      : reviewing.length ? step('Credit assessment', 'current', 'Your application is with the credit team.') : step('Credit assessment', 'upcoming'),
  ]

  const facility = (() => {
    if (!approved.length) return step('Facility active', 'upcoming')
    if (live.length) return step('Facility active', 'done', `Valid until ${latest(live.map((s) => s.endDate)) || '—'}`, earliest(live.map((s) => s.startDate)))
    const starts = earliest(approved.map((s) => s.startDate).filter((d) => day(d) > now))
    if (starts) return step('Facility active', 'current', `Starts ${starts}`)
    return step('Facility active', 'done', `Validity ended ${latest(approved.map((s) => s.endDate))}`)
  })()
  const sanction = [
    approved.length
      ? step('Sanction approval', 'done', one ? `Sanction No. ${one.sanctionNo}` : plural(approved.length, 'sanction approved', 'sanctions approved'), latest(approved.map((s) => s.decidedOn)))
      : allRefused ? step('Sanction approval', 'stopped', 'Your application was not approved.', latest(decided.map((s) => s.decidedOn)))
        : reviewing.length ? step('Sanction approval', 'current', 'Waiting for the checker’s approval.') : step('Sanction approval', 'upcoming'),
    approved.some((s) => s.hasDocument) ? step('Sanction memo issued', 'done', 'Download it from your sanction below.') : step('Sanction memo issued', 'upcoming'),
    facility,
  ]

  const disbursement = [
    drawdowns.length
      ? step('Drawdown requested', 'done', plural(drawdowns.length, 'drawdown request'), earliest(drawdowns.map((d) => d.requestedOn)))
      : approved.length ? step('Drawdown requested', 'current', 'You can now request a drawdown against your sanction.') : step('Drawdown requested', 'upcoming'),
    dApproved.length
      ? step('Approval & loan deal', 'done', dApproved.length === 1 && dApproved[0].drawdownNo ? `Drawdown No. ${dApproved[0].drawdownNo}` : plural(dApproved.length, 'drawdown approved', 'drawdowns approved'))
      : dRefusedAll ? step('Approval & loan deal', 'stopped', 'Your drawdown request was not approved.')
        : dRequested.length ? step('Approval & loan deal', 'current', 'Waiting for the checker’s approval.') : step('Approval & loan deal', 'upcoming'),
    dPaid.length
      // The amount paid out (the UI formats it), or a count when the drawdowns are in several currencies.
      ? { ...step('Amount disbursed', 'done', disbursed.amount === null ? plural(dPaid.length, 'drawdown paid out') : ''), amount: disbursed.amount === null ? null : disbursed }
      : dApproved.length ? step('Amount disbursed', 'current', 'The amount is being paid out to you.') : step('Amount disbursed', 'upcoming'),
  ]

  const invoicesKnown = journey.invoicesAvailable !== false
  const servicing = [
    !invoicesKnown ? step('Dues invoiced', 'unknown', 'Your invoices can’t be shown right now.')
      : invoices.length ? step('Dues invoiced', 'done', plural(invoices.length, 'invoice') + ' issued', latest(invoices.map((i) => i.dueDate)))
        : dPaid.length ? step('Dues invoiced', 'current', 'Invoices appear as your dues are raised.') : step('Dues invoiced', 'upcoming'),
    dPaid.length && dSettled.length === dPaid.length
      ? step('Repaid & settled', 'done', plural(dSettled.length, 'drawdown settled', 'drawdowns settled'))
      : dPaid.length ? step('Repaid & settled', 'current', `Repay by ${latest(dPaid.filter((d) => d.status !== 'settled').map((d) => d.endDate)) || 'the drawdown end date'}`) : step('Repaid & settled', 'upcoming'),
  ]

  const phases = [
    { id: 'origination', title: 'Origination', description: 'Your account and your loan application.', owner: 'You & your relationship manager', steps: origination },
    { id: 'sanction', title: 'Sanction', description: 'Approval of your limit and your sanction memo.', owner: 'Bank’s credit team (maker & checker)', steps: sanction },
    { id: 'disbursement', title: 'Disbursement', description: 'Drawing funds against your sanction.', owner: 'You request; the bank approves and pays out', steps: disbursement },
    { id: 'servicing', title: 'Servicing & closure', description: 'Your dues, invoices and repayment.', owner: 'Bank operations', steps: servicing },
  ].map((p) => ({ ...p, state: phaseState(p.steps) }))

  const currentIndex = phases.findIndex((p) => p.state !== 'done')
  return {
    phases,
    current: phases[currentIndex === -1 ? phases.length - 1 : currentIndex].id,
    totals: {
      applications: sanctions.length,
      activeFacilities: live.length,
      sanctionedLimit: sumOf(approved, 'limit'),
      disbursed,
    },
  }
}

// One application's current phase, for the register: the first phase not done, by the same rules.
export const currentPhaseOf = (journey, sanctionId, today) => {
  const t = trackerOf(journey, { sanctionId, today })
  return t.phases.find((p) => p.id === t.current)
}
