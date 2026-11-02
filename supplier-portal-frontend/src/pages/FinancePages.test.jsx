// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../routes/AppRoutes'
import * as api from '../api/vendorApi'
import { clearFinanceCache } from '../utils/finance'
import { FINANCE, NOTIFICATIONS } from '../test/financeFixture'

/*
 * The money screens (Cashflow & Transactions, Drawdown History, Repayment Schedule, Payments & Receipts) and the header
 * bell, through the real routes, on finance shaped as LAS's customer finance API answers, stubbed at the API module as
 * isolated test data. Covers: LAS's figures as sent, pending apart from posted, filters, details, statements with the
 * screen's filters, unavailable sections, an empty customer, and read marks.
 */
vi.mock('../api/vendorApi', async (importOriginal) => ({
  ...(await importOriginal()),
  getVendorProfile: vi.fn(async () => ({ vendor_id: 84, name: 'Neekhat A', stage: 'active' })),
  getMyFinance: vi.fn(),
  getMyNotifications: vi.fn(),
  markNotificationsRead: vi.fn(async () => ({ marked: 1 })),
  downloadStatement: vi.fn(async () => {}),
  getRenewal: vi.fn(async () => null),
  getMyAgreements: vi.fn(async () => []),
}))

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}
async function renderAt(path) {
  localStorage.setItem('vendor-onboarding-auth', JSON.stringify({ email: 'n@x.test', vendor_id: 84, token: 't' }))
  await act(async () => { render(<MemoryRouter initialEntries={[path]}><AppRoutes /><Where /></MemoryRouter>) })
}
const kpi = (name) => screen.getByRole('heading', { name }).closest('article')
const table = (name) => screen.getByRole('table', { name })

beforeEach(() => {
  api.getMyFinance.mockResolvedValue(FINANCE)
  api.getMyNotifications.mockResolvedValue(NOTIFICATIONS)
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); clearFinanceCache() })

describe('Cashflow & Transactions', () => {
  it('shows LAS’s totals, and only posted money in the actual view', async () => {
    await renderAt('/cashflow')
    expect(within(kpi('Total inflows')).getByText('₹10,00,000.00')).toBeTruthy()
    expect(within(kpi('Total outflows')).getByText('₹12,000.00')).toBeTruthy()
    expect(within(kpi('Total outflows')).getByText('₹5,000.00 more being verified')).toBeTruthy()
    expect(within(kpi('Net cashflow')).getByText('₹9,88,000.00')).toBeTruthy()
    expect(within(kpi('Current outstanding')).getByText('₹10,04,857.53')).toBeTruthy()
    const rows = within(table('Transaction history')).getAllByRole('row')
    expect(rows).toHaveLength(5) // header + 4 posted
    expect(within(table('Transaction history')).queryByText('UTR7002')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Pending & scheduled' })) })
    expect(within(table('Transaction history')).getByText('UTR7002')).toBeTruthy()
    expect(within(table('Transaction history')).getByText('Pending verification')).toBeTruthy()
  })

  it('filters by type, opens a transaction, and asks for a statement with the screen’s filters', async () => {
    await renderAt('/cashflow')
    await act(async () => { fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'disbursement' } }) })
    const rows = within(table('Transaction history')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    await act(async () => { fireEvent.click(rows[0]) })
    const dialog = screen.getByRole('dialog', { name: 'Transaction details' })
    expect(within(dialog).getByText('Loan amount paid out to you')).toBeTruthy()
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Close' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Excel/ })) })
    expect(api.downloadStatement).toHaveBeenCalledWith('transactions', 'xlsx', { from: '', to: '', type: 'disbursement', disbursement: '', status: 'posted' })
  })

  it('a customer with no transactions sees an empty state, not zeros invented', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, transactions: [], summary: { ...FINANCE.summary, inflows: 0, outflows: 0, net: 0, monthly: [] } })
    await renderAt('/cashflow')
    expect(screen.getByText(/No transactions yet/)).toBeTruthy()
    expect(screen.getByText('No posted money movements yet.')).toBeTruthy()
  })

  it('says when the loan figures cannot be loaded, and offers to try again', async () => {
    api.getMyFinance.mockRejectedValueOnce(new Error('Your loan details can’t be loaded right now.'))
    await renderAt('/cashflow')
    expect(screen.getByRole('alert').textContent).toMatch(/can’t be loaded/)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Try again/ })) })
    expect(within(kpi('Total inflows')).getByText('₹10,00,000.00')).toBeTruthy()
  })

  it('before the loan account exists there is nothing to show', async () => {
    api.getMyFinance.mockResolvedValue({ onboarded: false })
    await renderAt('/cashflow')
    expect(screen.getByText(/Your loan account is being set up/)).toBeTruthy()
  })
})

describe('Drawdown History', () => {
  it('lists every application with its status, and filters by status', async () => {
    await renderAt('/drawdowns')
    expect(within(kpi('Applications')).getByText('3')).toBeTruthy()
    expect(within(kpi('Pending approval')).getByText('1')).toBeTruthy()
    const t = table('Drawdown applications')
    expect(within(t).getByText('Disbursed', { selector: 'span' })).toBeTruthy()
    expect(within(t).getByText('Not accepted')).toBeTruthy()
    await act(async () => { fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending_approval' } }) })
    expect(within(table('Drawdown applications')).getAllByRole('row')).toHaveLength(2)
  })
})

describe('Repayment Schedule', () => {
  it('shows instalments with principal, interest and charges apart, and the next payment', async () => {
    await renderAt('/repayments')
    expect(within(kpi('Overdue amount')).getByText('₹4,857.53')).toBeTruthy()
    expect(within(kpi('Next payment')).getByText('₹8,300.00')).toBeTruthy()
    const t = table('Instalments')
    expect(within(t).getAllByRole('row')).toHaveLength(5) // header + 4 instalments
    expect(within(t).getByText('Overdue')).toBeTruthy()
    expect(within(t).getAllByText('₹8,300.00')).toHaveLength(2) // total and outstanding: interest 7,800 + fee 500
    expect(screen.getByRole('region', { name: 'Upcoming payment' }).textContent).toMatch(/Other charges₹500\.00/)
  })

  it('says the schedule cannot be shown when LAS could not read it', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, schedule: null, available: { ...FINANCE.available, schedule: false } })
    await renderAt('/repayments')
    expect(screen.getByText(/Your repayment schedule can’t be shown right now/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('Payments & Receipts', () => {
  it('counts a payment as confirmed only after the bank verified it, and shows how it was applied', async () => {
    await renderAt('/payments')
    expect(within(kpi('Confirmed payments')).getByText('₹12,000.00')).toBeTruthy()
    expect(within(kpi('Being verified')).getByText('₹5,000.00')).toBeTruthy()
    expect(within(kpi('Not yet applied')).getByText('₹1,397.26')).toBeTruthy()
    await act(async () => { fireEvent.click(within(table('Payment history')).getByText('7001')) })
    const dialog = screen.getByRole('dialog', { name: 'Receipt 7001' })
    expect(within(dialog).getAllByText('Interest')).toHaveLength(2)
    expect(within(dialog).getByText('₹7,602.74')).toBeTruthy()
  })
})

describe('Notification bell', () => {
  it('counts unread items, opens one at its record and marks it read', async () => {
    await renderAt('/cashflow')
    const bell = screen.getByRole('button', { name: 'Notifications: 1 unread' })
    await act(async () => { fireEvent.click(bell) })
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    expect(within(panel).getByText('Needs your attention')).toBeTruthy()
    await act(async () => { fireEvent.click(within(panel).getByText('₹4,857.53 is overdue')) })
    expect(screen.getByTestId('where').textContent).toBe('/repayments')
    expect(api.markNotificationsRead).toHaveBeenCalledWith(['overdue-2026-10-31'])
  })

  it('marks everything read at once', async () => {
    await renderAt('/drawdowns')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Notifications/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Mark all read' })) })
    expect(api.markNotificationsRead).toHaveBeenCalledWith('all')
  })
})
