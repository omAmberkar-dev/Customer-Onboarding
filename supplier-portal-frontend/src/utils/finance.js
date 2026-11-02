// Money with LAS: how the finance LAS sends (GET /vendors/me/finance, LAS customer-finance.mjs) reads on the screens.
// Every amount is LAS's; nothing here adds up a figure the summary does not already carry, except the per-row filters.
import { useCallback, useEffect, useState } from 'react'
import { getMyFinance } from '../api/vendorApi'

export { formatLoanDate as formatDate, formatMoney } from './loans'

// Chart colours, validated for the white surface (dataviz validate_palette: blue/orange and blue/aqua pass; aqua is
// under 3:1, so its values are always written next to it). Text never takes a series colour.
export const CHART_COLORS = { inflow: '#0046dc', outflow: '#eb6834', utilised: '#0046dc', available: '#1baf7a', track: '#e5eaf1', grid: '#eef1f5' }

// ₹ in lakh / crore for chart axes and tight tiles, e.g. ₹12.5 L, ₹3.2 Cr. Tooltips and tables use the full figure.
export const compactMoney = (value) => {
  const n = Number(value)
  if (value === null || value === undefined || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e9 ? 0 : 2).replace(/\.?0+$/, '')} Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export const monthLabel = (ym) => {
  const d = /^\d{4}-\d{2}$/.test(ym || '') ? new Date(`${ym}-01T00:00:00`) : null
  return d ? d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : ym || '—'
}

// The words for LAS's codes, as the statements use them too (customer_finance.py LABELS).
export const LABELS = {
  disbursement: 'Loan disbursement', principal_repayment: 'Principal repayment', interest_payment: 'Interest payment',
  fee_payment: 'Fees and charges', payment: 'Payment', reversal: 'Reversal',
  posted: 'Posted', scheduled: 'Scheduled', pending: 'Pending verification', rejected: 'Not accepted', cancelled: 'Cancelled',
  confirmed: 'Confirmed', allocated: 'Applied to dues',
  principal: 'Principal', interest: 'Interest', fee: 'Fees and charges', tax: 'GST',
  paid: 'Paid', overdue: 'Overdue', due: 'Due', partially_paid: 'Partially paid', upcoming: 'Upcoming',
  submitted: 'Submitted', pending_approval: 'Pending approval', approved: 'Approved', disbursed: 'Disbursed',
  active: 'Active', expired: 'Expired',
}
export const label = (code) => LABELS[code] || code || '—'

// Status pill colours: green done, blue in progress, amber needs attention soon, red overdue/refused, grey otherwise.
const TONE = {
  posted: 'green', confirmed: 'green', allocated: 'green', paid: 'green', disbursed: 'green', approved: 'green', active: 'green',
  scheduled: 'blue', pending: 'blue', pending_approval: 'blue', submitted: 'blue', upcoming: 'blue', partially_paid: 'blue',
  due: 'amber',
  overdue: 'red', rejected: 'red',
  cancelled: 'grey', expired: 'grey',
}
export const toneOf = (code) => TONE[code] || 'grey'

// The filters every money table shares, the same rules the statement uses on the server (customer_finance.filtered):
// a date range on the row's own date, and exact matches on disbursement, type and status; `search` matches text.
export function filterRows(rows, { from = '', to = '', disbursement = '', type = '', status = '', search = '' } = {}, { dateField, typeField, searchFields = [] }) {
  const needle = search.trim().toLowerCase()
  return (rows || []).filter((row) => {
    const on = String(row[dateField] || '')
    if ((from && on < from) || (to && on > to)) return false
    if (disbursement && String(row.disbursementNo || '') !== disbursement) return false
    if (type && typeField && row[typeField] !== type) return false
    if (status && row.status !== status) return false
    if (needle && !searchFields.some((f) => [String(row[f] ?? ''), label(row[f])].some((text) => text.toLowerCase().includes(needle)))) return false
    return true
  })
}

// The distinct disbursement numbers in some rows, for the filter.
export const disbursementsOf = (rows) => [...new Set((rows || []).map((r) => r.disbursementNo).filter(Boolean))].sort()

// One shared request for every money screen in a visit: opening the next page reuses it for a minute.
const CACHE_MS = 60_000
let cached = null // { at, promise }
export function loadFinance({ fresh = false } = {}) {
  if (fresh || !cached || Date.now() - cached.at > CACHE_MS) {
    const promise = getMyFinance()
    cached = { at: Date.now(), promise }
    promise.catch(() => { if (cached?.promise === promise) cached = null })
  }
  return cached.promise
}
export const clearFinanceCache = () => { cached = null }

// { data, error, loading, reload } for a screen.
export function useFinance() {
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const run = useCallback((fresh) => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    loadFinance({ fresh })
      .then((data) => setState({ data, error: '', loading: false }))
      .catch((err) => setState({ data: null, error: err.message || 'Unable to load your loan figures.', loading: false }))
  }, [])
  useEffect(() => { run(false) }, [run])
  return { ...state, reload: () => run(true) }
}

// The schedule as instalments: one row per disbursement and due date, its principal, interest and charges (fees and
// GST) side by side, and the status the customer most needs to see (overdue, due, partially paid, upcoming, paid).
const RANK = ['overdue', 'due', 'partially_paid', 'upcoming', 'paid']
const cents = (v) => Math.round((Number(v) || 0) * 100)
export function instalmentsOf(schedule) {
  const groups = new Map()
  for (const line of schedule || []) {
    const key = `${line.disbursementNo}|${line.dueDate}`
    const g = groups.get(key) || { id: key, disbursementNo: line.disbursementNo, sanctionNo: line.sanctionNo, instalment: line.instalment, dueDate: line.dueDate, currency: line.currency || 'INR', principal: 0, interest: 0, charges: 0, total: 0, paid: 0, outstanding: 0, statuses: [], lines: [] }
    const part = line.kind === 'principal' ? 'principal' : line.kind === 'interest' ? 'interest' : 'charges'
    g[part] += cents(line.amount)
    g.total += cents(line.amount)
    g.paid += cents(line.paid)
    g.outstanding += cents(line.outstanding)
    g.statuses.push(line.status)
    g.lines.push(line)
    groups.set(key, g)
  }
  return [...groups.values()].map(({ statuses, ...g }) => {
    let status = RANK.find((r) => statuses.includes(r)) || 'upcoming'
    // Some of it paid, the rest not yet due: partially paid, whatever each line says.
    if (status === 'upcoming' && g.paid > 0 && g.outstanding > 0) status = 'partially_paid'
    return { ...g, principal: g.principal / 100, interest: g.interest / 100, charges: g.charges / 100, total: g.total / 100, paid: g.paid / 100, outstanding: g.outstanding / 100, status }
  })
}
