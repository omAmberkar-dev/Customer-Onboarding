// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../routes/AppRoutes'
import * as api from '../api/vendorApi'
import { clearFinanceCache } from '../utils/finance'
import { FINANCE, NOTIFICATIONS } from '../test/financeFixture'

/*
 * The LAS modules (Transactions, Drawdown History, Cashflows, Receipts) and the header bell, through the real routes, on
 * finance shaped as LAS's customer finance API answers. vendorApi is fully mocked (test/vendorApiMock.js): isolated test
 * data, nothing reaches a backend. Each module: loading, its figures as LAS sent them, empty, unavailable, and its details.
 */
vi.mock('../api/vendorApi', async (importOriginal) => (await import('../test/vendorApiMock')).mockVendorApi(await importOriginal(), {
  getMyFinance: vi.fn(),
  getMyNotifications: vi.fn(),
  markNotificationsRead: vi.fn(async () => ({ marked: 1 })),
  downloadStatement: vi.fn(async () => {}),
  downloadLoanDocument: vi.fn(async () => {}),
  fetchLoanDocumentUrl: vi.fn(async () => 'blob:loan-document'),
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
const bodyRows = (name) => within(table(name)).getAllByRole('row').slice(1)
const pick = async (labelText, value) => { await act(async () => { fireEvent.change(screen.getByLabelText(labelText), { target: { value } }) }) }
const click = async (el) => { await act(async () => { fireEvent.click(el) }) }

beforeEach(() => {
  api.getMyFinance.mockResolvedValue(FINANCE)
  api.getMyNotifications.mockResolvedValue(NOTIFICATIONS)
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); clearFinanceCache() })

describe('every module', () => {
  it.each(['/cashflow', '/drawdowns', '/repayments', '/payments'])('%s shows loading until LAS answers', async (path) => {
    api.getMyFinance.mockReturnValue(new Promise(() => {}))
    await renderAt(path)
    expect(screen.getByRole('status').textContent).toMatch(/Loading your loan figures/)
  })

  it.each([['/cashflow', 'Transactions'], ['/drawdowns', 'Drawdown History'], ['/repayments', 'Cashflows'], ['/payments', 'Receipts']])('%s is titled %s, with its breadcrumb and sidebar entry', async (path, title) => {
    await renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText(title).getAttribute('aria-current')).toBe('page')
    const sidebar = screen.getByRole('complementary', { name: 'Sections' })
    expect(within(sidebar).getByRole('link', { name: title }).getAttribute('aria-current')).toBe('page')
  })

  it.each(['/cashflow', '/drawdowns', '/repayments', '/payments'])('%s says when the figures cannot be loaded, and offers to try again', async (path) => {
    api.getMyFinance.mockRejectedValueOnce(new Error('Your loan details can’t be loaded right now.'))
    await renderAt(path)
    expect(screen.getByRole('alert').textContent).toMatch(/can’t be loaded/)
    await click(screen.getByRole('button', { name: /Try again/ }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['/cashflow', '/drawdowns', '/repayments', '/payments'])('%s has nothing to show before the loan account exists', async (path) => {
    api.getMyFinance.mockResolvedValue({ onboarded: false })
    await renderAt(path)
    expect(screen.getByText(/Your loan account is being set up/)).toBeTruthy()
  })
})

describe('Transactions (/cashflow)', () => {
  it('shows LAS’s totals, and only posted rows in the actual view', async () => {
    await renderAt('/cashflow')
    expect(within(kpi('Total inflows')).getByText('₹10,00,000.00')).toBeTruthy()
    expect(within(kpi('Total outflows')).getByText('₹12,000.00')).toBeTruthy()
    expect(within(kpi('Total outflows')).getByText('₹5,000.00 more being verified')).toBeTruthy()
    expect(within(kpi('Net cashflow')).getByText('₹9,88,000.00')).toBeTruthy()
    expect(within(kpi('Current outstanding')).getByText('₹10,04,857.53')).toBeTruthy()
    expect(bodyRows('Transaction history')).toHaveLength(5) // 5 posted: payout, a charge, 2 interest payments, unapplied
    expect(within(table('Transaction history')).queryByText('UTR7002')).toBeNull()
    await click(screen.getByRole('tab', { name: 'Pending & scheduled' }))
    expect(within(table('Transaction history')).getByText('UTR7002')).toBeTruthy()
    expect(within(table('Transaction history')).getByText('Pending verification')).toBeTruthy()
  })

  it('lists charges billed apart from money moved, with their sanction and drawdown', async () => {
    await renderAt('/cashflow')
    await pick('Type', 'interest_charge')
    const [row] = bodyRows('Transaction history')
    expect(bodyRows('Transaction history')).toHaveLength(1)
    expect(within(row).getByText('₹7,602.74')).toBeTruthy()
    expect(within(row).getByText('100411')).toBeTruthy()
    expect(within(row).getByText('Interest charged')).toBeTruthy()
  })

  it('opens a transaction with its drawdown’s history, and asks for a statement with the screen’s filters', async () => {
    await renderAt('/cashflow')
    await pick('Type', 'disbursement')
    await click(bodyRows('Transaction history')[0])
    const dialog = screen.getByRole('dialog', { name: 'Transaction details' })
    expect(within(dialog).getByText('Loan amount paid out to you')).toBeTruthy()
    const history = within(dialog).getByRole('list', { name: 'Related transactions' })
    expect(within(history).getByText('Interest charged')).toBeTruthy()
    expect(within(history).getAllByText('Interest payment')).toHaveLength(2)
    await click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await click(screen.getByRole('button', { name: /Excel/ }))
    expect(api.downloadStatement).toHaveBeenCalledWith('transactions', 'xlsx', { from: '', to: '', type: 'disbursement', disbursement: '', status: 'posted' })
  })

  it('a customer with no transactions sees an empty state, not zeros invented', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, transactions: [], summary: { ...FINANCE.summary, inflows: 0, outflows: 0, net: 0, monthly: [] } })
    await renderAt('/cashflow')
    expect(screen.getByText(/No transactions yet/)).toBeTruthy()
    expect(screen.getByText('No posted money movements yet.')).toBeTruthy()
  })

  it('says which figures LAS could not read', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, available: { ...FINANCE.available, flows: false } })
    await renderAt('/cashflow')
    expect(within(kpi('Total inflows')).getByText('Unavailable')).toBeTruthy()
    expect(screen.getByText(/Some of your money movements can’t be shown/)).toBeTruthy()
  })
})

describe('Drawdown History (/drawdowns)', () => {
  it('lists each request with its drawdown and sanction numbers, approval and disbursement, and filters by approval', async () => {
    await renderAt('/drawdowns')
    expect(within(kpi('Requests')).getByText('3')).toBeTruthy()
    expect(within(kpi('Pending approval')).getByText('1')).toBeTruthy()
    const t = table('Drawdown requests')
    expect(within(t).getByText('23000068')).toBeTruthy()
    expect(within(t).getAllByText('100411')).toHaveLength(3)
    expect(within(t).getByText('With the checker')).toBeTruthy()
    expect(within(t).getByText('Rejected')).toBeTruthy()
    expect(within(t).getByText('Disbursed', { selector: 'span' })).toBeTruthy()
    expect(within(t).getByText('Request 502')).toBeTruthy()
    await pick('Approval', 'checker')
    expect(bodyRows('Drawdown requests')).toHaveLength(1)
  })

  it('opens a drawdown with its approval steps, transaction history, repayment and memo', async () => {
    await renderAt('/drawdowns')
    await click(within(table('Drawdown requests')).getByText('23000068'))
    const dialog = screen.getByRole('dialog', { name: 'Drawdown 23000068' })
    const track = within(dialog).getByRole('list', { name: 'Approval' })
    expect(within(track).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Maker', 'Checker', 'Approved'])
    expect(within(within(dialog).getByRole('list', { name: 'Approval history' })).getByText('Amount disbursed')).toBeTruthy()
    const moves = within(dialog).getByRole('list', { name: 'Transaction history' })
    expect(within(moves).getByText('Loan disbursement')).toBeTruthy()
    expect(within(moves).getByText('Interest charged')).toBeTruthy()
    expect(within(dialog).getByText('₹10,13,157.53')).toBeTruthy() // remaining: 4,857.53 + 7,800 + 500 + 10,00,000
    await click(within(dialog).getByRole('button', { name: 'Download Drawdown Memo' }))
    expect(api.downloadLoanDocument).toHaveBeenCalledWith('drawdown', '1000-501', 'Drawdown_Memo_23000068.pdf')
    await click(within(dialog).getByRole('button', { name: /View Drawdown Memo/ }))
    expect(screen.getByRole('dialog', { name: 'Drawdown Memo' })).toBeTruthy()
    expect(api.fetchLoanDocumentUrl).toHaveBeenCalledWith('drawdown', '1000-501')
  })

  it('a request still with the checker has no memo and no transactions yet', async () => {
    await renderAt('/drawdowns')
    await click(within(table('Drawdown requests')).getByText('Request 502'))
    const dialog = screen.getByRole('dialog', { name: 'Drawdown request 502' })
    expect(within(within(dialog).getByRole('list', { name: 'Approval' })).getByText('Checker').getAttribute('aria-current')).toBe('step')
    expect(within(dialog).getByText(/Transactions start once the drawdown is approved/)).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /Drawdown Memo/ })).toBeNull()
  })

  it('says when there are no drawdowns, and when the payouts could not be read', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, drawdowns: [], available: { ...FINANCE.available, flows: false } })
    await renderAt('/drawdowns')
    expect(screen.getByText(/No drawdown requests yet/)).toBeTruthy()
    expect(within(kpi('Disbursed amount')).getByText('Unavailable')).toBeTruthy()
  })
})

describe('Cashflows (/repayments)', () => {
  it('groups the schedule by sanction and drawdown, with due, paid and remaining', async () => {
    await renderAt('/repayments')
    expect(within(kpi('Overdue amount')).getByText('₹4,857.53')).toBeTruthy()
    expect(within(kpi('Next payment')).getByText('₹8,300.00')).toBeTruthy()
    const loan = screen.getByRole('region', { name: 'Sanction 100411' })
    const t = within(loan).getByRole('table', { name: 'Instalments of drawdown 23000068' })
    expect(within(t).getAllByRole('row')).toHaveLength(5) // header + 4 instalments
    expect(within(t).getByText('Overdue')).toBeTruthy()
    expect(within(t).getAllByText('₹8,300.00')).toHaveLength(2) // due and remaining: interest 7,800 + fee 500
    expect(within(loan).getAllByText('₹10,13,157.53').length).toBeGreaterThan(0) // remaining on the sanction and the drawdown
    expect(screen.getByRole('region', { name: 'Upcoming payment' }).textContent).toMatch(/Other charges₹500\.00/)
  })

  it('filters the instalments by status', async () => {
    await renderAt('/repayments')
    await pick('Status', 'overdue')
    expect(within(screen.getByRole('table', { name: 'Instalments of drawdown 23000068' })).getAllByRole('row')).toHaveLength(2)
    await pick('Status', 'due')
    expect(screen.getByText('No instalments match these filters.')).toBeTruthy()
  })

  it('says the schedule cannot be shown when LAS could not read it', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, schedule: null, available: { ...FINANCE.available, schedule: false } })
    await renderAt('/repayments')
    expect(screen.getByText(/Your repayment schedule can’t be shown right now/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('has an empty state before any drawdown is disbursed', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, schedule: [], summary: { ...FINANCE.summary, nextDue: '' } })
    await renderAt('/repayments')
    expect(screen.getByText(/No repayment schedule yet/)).toBeTruthy()
  })
})

describe('Receipts (/payments)', () => {
  it('counts a receipt as received only once approved, and shows each one’s allocation status', async () => {
    await renderAt('/payments')
    expect(within(kpi('Received')).getByText('₹12,000.00')).toBeTruthy()
    expect(within(kpi('Pending approval')).getByText('₹5,000.00')).toBeTruthy()
    expect(within(kpi('Allocated to dues')).getByText('₹10,602.74')).toBeTruthy()
    expect(within(kpi('Unallocated')).getByText('₹1,397.26')).toBeTruthy()
    const t = table('Payment history')
    expect(within(t).getByText('Partially allocated')).toBeTruthy()
    expect(within(t).getByText('Pending approval')).toBeTruthy()
    await pick('Allocation', 'pending_approval')
    expect(bodyRows('Payment history')).toHaveLength(1)
  })

  it('opens a receipt with its details and which sanction, drawdown and due each part paid', async () => {
    await renderAt('/payments')
    await click(within(table('Payment history')).getByText('7001'))
    const dialog = screen.getByRole('dialog', { name: 'Receipt 7001' })
    expect(within(dialog).getByText('Overdue')).toBeTruthy() // purpose
    expect(within(dialog).getByText('Partially allocated')).toBeTruthy()
    const lines = within(dialog).getByRole('list', { name: 'Allocation history' })
    expect(within(lines).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lines).getAllByText(/Sanction 100411 · Drawdown 23000068/)).toHaveLength(2)
    expect(within(lines).getByText('₹7,602.74')).toBeTruthy()
  })

  it('asks for the receipts statement with the allocation filter', async () => {
    await renderAt('/payments')
    await pick('Allocation', 'partially_allocated')
    await click(screen.getByRole('button', { name: /PDF statement/ }))
    expect(api.downloadStatement).toHaveBeenCalledWith('payments', 'pdf', { from: '', to: '', disbursement: '', type: 'partially_allocated' })
  })

  it('says when there are no receipts, and when LAS could not read them', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, payments: [] })
    await renderAt('/payments')
    expect(screen.getByText('No payments received yet.')).toBeTruthy()
    cleanup()
    clearFinanceCache()
    api.getMyFinance.mockResolvedValue({ ...FINANCE, payments: null, available: { ...FINANCE.available, payments: false } })
    await renderAt('/payments')
    expect(screen.getByText(/Your receipts can’t be shown right now/)).toBeTruthy()
  })
})

describe('Notification bell', () => {
  it('counts unread items, opens one at its record and marks it read', async () => {
    await renderAt('/cashflow')
    const bell = screen.getByRole('button', { name: 'Notifications: 1 unread' })
    await click(bell)
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    expect(within(panel).getByText('Needs your attention')).toBeTruthy()
    await click(within(panel).getByText('₹4,857.53 is overdue'))
    expect(screen.getByTestId('where').textContent).toBe('/repayments')
    expect(api.markNotificationsRead).toHaveBeenCalledWith(['overdue-2026-10-31'])
  })

  it('marks everything read at once', async () => {
    await renderAt('/drawdowns')
    await click(screen.getByRole('button', { name: /^Notifications/ }))
    await click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(api.markNotificationsRead).toHaveBeenCalledWith('all')
  })
})
