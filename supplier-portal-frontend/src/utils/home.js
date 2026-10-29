// Home's rules (pages/HomePage.jsx), kept here so they are tested on their own.
import { formatMoney } from './loans'

// Whole days from today (local midnight) to an ISO date; null when it is not a date.
export const daysFrom = (iso, today = new Date()) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return null
  const start = new Date(today); start.setHours(0, 0, 0, 0)
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`) - start) / 86400000)
}

export const inDays = (n) => (n === null ? '' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'Today' : `In ${n} day${n === 1 ? '' : 's'}`)

// LAS's drawdown statuses (its customer-journey.mjs): requested -> approved -> disbursed -> settled, or not_approved.
// Every status from approved on is an approved drawdown.
const DRAWDOWN_APPROVED = ['approved', 'disbursed', 'settled']

/*
 * Loans at a glance, from My loans (GET /vendors/me/loans) only: approved sanctions, their limits added up when all are
 * in one currency (else `limit` is null: amounts in different currencies are never added), drawdowns by status.
 */
export function loansSummary(journey) {
  const approved = journey.sanctions.filter((s) => s.status === 'approved')
  const currencies = new Set(approved.map((s) => s.currency || 'INR'))
  return {
    approvedSanctions: approved.length,
    limit: approved.length && currencies.size === 1 ? approved.reduce((sum, s) => sum + (Number(s.limit) || 0), 0) : null,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    drawdownsApproved: journey.drawdowns.filter((d) => DRAWDOWN_APPROVED.includes(d.status)).length,
    drawdownsInReview: journey.drawdowns.filter((d) => d.status === 'requested').length,
  }
}

/*
 * What needs the customer's attention, from real dates and counts only: LAS dues not yet past (the three soonest);
 * invoices returned for correction; open change requests. Dated items first, soonest first; at most four. (Agreement
 * reminders are left out while the Agreement section is hidden; the agreement banner still covers a hold or renewal.)
 */
export function upcomingItems(home, loans, today = new Date()) {
  const items = []
  const dues = (loans?.onboarded ? loans.invoices : [])
    .filter((i) => (daysFrom(i.dueDate, today) ?? -1) >= 0)
    .sort((x, y) => x.dueDate.localeCompare(y.dueDate))
    .slice(0, 3)
  for (const i of dues) items.push({ kind: 'dues', title: `${i.title} due`, detail: formatMoney(i.amount, i.currency), date: i.dueDate, to: '/loans' })
  const returned = home?.invoices?.returned || 0
  if (returned) items.push({ kind: 'invoice', title: `${returned} invoice${returned === 1 ? ' needs' : 's need'} correction`, detail: 'Returned to you for correction', to: '/invoices' })
  if (home?.change_requests?.open) items.push({ kind: 'change_request', title: 'Change request in review', detail: `${home.change_requests.open} open`, to: '/update-requests' })
  return items.sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999')).slice(0, 4)
}
