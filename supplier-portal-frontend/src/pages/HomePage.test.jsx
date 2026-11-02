// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../routes/AppRoutes'
import * as api from '../api/vendorApi'
import { clearFinanceCache } from '../utils/finance'
import { FINANCE, NOTIFICATIONS } from '../test/financeFixture'

/*
 * The shell and Home through the real routes, auth provider and route guards, with the backend calls stubbed at the
 * API module (isolated test data, never presented as live). Covers: real figures shown, "unavailable" never shown as
 * zero, a failed loans read leaving the rest of Home working, the sidebar and the header search.
 */
vi.mock('../api/vendorApi', async (importOriginal) => ({
  ...(await importOriginal()),
  getVendorProfile: vi.fn(),
  getMyHome: vi.fn(),
  getMyLoans: vi.fn(),
  getMyActivity: vi.fn(),
  getMyFinance: vi.fn(),
  getMyNotifications: vi.fn(),
  markNotificationsRead: vi.fn(async () => ({ marked: 1 })),
  getMyAgreements: vi.fn(async () => []),
  getRenewal: vi.fn(async () => null),
  getMyDocuments: vi.fn(async () => []),
  getUpdateRequests: vi.fn(async () => []),
  sendSupportRequest: vi.fn(),
}))

const PROFILE = { vendor_id: 85, name: 'Neekhat A', vendor_legal_name: 'Acme Pvt Ltd', email: 'n@x.test', stage: 'active', created_at: '2026-09-01 10:00:00', assigned_rm: 'Priya Nair' }
const HOME = {
  stage: 'active',
  invoices: { total: 5, in_review: 2, approved: 1, returned: 1, rejected: 0, other: 1 },
  agreement: { agreement_no: 'AGR-2', status: 'signed', awaiting_signature: false, signing_link_expired: false, valid_until: '2027-09-30' },
  change_requests: { open: 0, total: 2 },
  unavailable: [],
}
const LOANS = {
  onboarded: true, customerNo: '100440', steps: [],
  sanctions: [{ id: '1000-11', status: 'approved', limit: 5000000, currency: 'INR' }, { id: '1000-12', status: 'under_review', limit: 1 }],
  drawdowns: [{ id: '1000-5', status: 'approved' }, { id: '1000-6', status: 'requested' }],
  invoices: [], invoicesAvailable: true,
}
const ACTIVITY = { events: [{ at: '2026-10-20T10:00:00', category: 'invoice', title: 'Invoice returned to you for correction', reference: 'INV-A3' }], unavailable: [] }

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

async function renderAt(path) {
  localStorage.setItem('vendor-onboarding-auth', JSON.stringify({ email: 'n@x.test', vendor_id: 85, token: 't' }))
  await act(async () => {
    render(<MemoryRouter initialEntries={[path]}><AppRoutes /><Where /></MemoryRouter>)
  })
}

beforeEach(() => {
  api.getVendorProfile.mockResolvedValue(PROFILE)
  api.getMyHome.mockResolvedValue(HOME)
  api.getMyLoans.mockResolvedValue(LOANS)
  api.getMyActivity.mockResolvedValue(ACTIVITY)
  api.getMyFinance.mockResolvedValue(FINANCE)
  api.getMyNotifications.mockResolvedValue(NOTIFICATIONS)
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); clearFinanceCache() })

const kpi = (label) => screen.getByRole('heading', { name: label }).closest('article')

describe('Home', () => {
  it('is where an active customer lands, and shows their own figures', async () => {
    await renderAt('/')
    expect(screen.getByTestId('where').textContent).toBe('/home')
    expect(screen.getByRole('heading', { name: 'Hello, Neekhat!' })).toBeTruthy()
    expect(within(kpi('Total invoices')).getByText('5')).toBeTruthy()
    expect(within(kpi('Invoices in review')).getByText('2')).toBeTruthy()
    expect(within(kpi('Approved invoices')).getByText('1')).toBeTruthy()
    // A real zero is shown as 0.
    expect(within(kpi('Open change requests')).getByText('0')).toBeTruthy()
    // The financial overview is LAS's own figures, as sent.
    const overview = screen.getByRole('region', { name: 'Financial overview' })
    expect(within(kpi('Total sanctioned')).getByText('₹50,00,000.00')).toBeTruthy()
    expect(within(kpi('Total outstanding')).getByText('₹10,04,857.53')).toBeTruthy()
    expect(within(kpi('Overdue amount')).getByText('₹4,857.53')).toBeTruthy()
    expect(within(overview).getByText('Due 31 Jan 2099')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Loan utilisation' })).toBeTruthy()
    // Loan events join the activity feed.
    expect(screen.getAllByText('Payment confirmed').length).toBeGreaterThan(0)
    expect(screen.getByText('Loan customer no.').nextSibling.textContent).toBe('100440')
    expect(screen.getByText('Invoice returned to you for correction')).toBeTruthy()
    expect(screen.getByText('1 invoice needs correction')).toBeTruthy()
    expect(screen.queryByText(/1800|customercentral\.com|Last login/i)).toBeNull()
  })

  it('says a section is unavailable instead of showing zero', async () => {
    api.getMyHome.mockResolvedValue({ ...HOME, invoices: null, unavailable: ['invoices'] })
    await renderAt('/home')
    expect(within(kpi('Total invoices')).getByText('Unavailable')).toBeTruthy()
    expect(within(kpi('Invoices in review')).getByText('Unavailable')).toBeTruthy()
    expect(within(kpi('Total invoices')).queryByText('0')).toBeNull()
    expect(within(kpi('Open change requests')).getByText('0')).toBeTruthy()
  })

  it('has no entry point into the Agreement section', async () => {
    await renderAt('/home')
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.filter((h) => /agreement/.test(h))).toEqual([])
    expect(screen.queryByText(/View agreement/)).toBeNull()
  })

  it('keeps working when the loan figures cannot be read, and retries on request', async () => {
    api.getMyFinance.mockRejectedValueOnce(new Error('Your loan details can’t be loaded right now.'))
    await renderAt('/home')
    const alert = screen.getByText(/Your loan figures can’t be shown right now/)
    expect(within(kpi('Total invoices')).getByText('5')).toBeTruthy()
    await act(async () => { fireEvent.click(within(alert).getByRole('button', { name: /Try again/ })) })
    expect(within(kpi('Total sanctioned')).getByText('₹50,00,000.00')).toBeTruthy()
    expect(api.getMyFinance).toHaveBeenCalledTimes(2)
  })

  it('shows a figure LAS could not read as unavailable, never zero', async () => {
    api.getMyFinance.mockResolvedValue({ ...FINANCE, schedule: null, summary: { ...FINANCE.summary, outstanding: null, overdue: null, nextDue: null }, available: { ...FINANCE.available, schedule: false } })
    await renderAt('/home')
    expect(within(kpi('Total outstanding')).getByText('Unavailable')).toBeTruthy()
    expect(within(kpi('Overdue amount')).getByText('Unavailable')).toBeTruthy()
    expect(within(kpi('Total outstanding')).queryByText('₹0.00')).toBeNull()
  })
})

describe('Shell', () => {
  it('lists the sections with the Dashboard current', async () => {
    await renderAt('/home')
    const sidebar = screen.getByRole('complementary', { name: 'Sections' })
    const names = within(sidebar).getAllByRole('link').map((a) => a.textContent.trim())
    expect(names).toEqual(['Dashboard', 'My Loans & Sanctions', 'Drawdown History', 'Repayment Schedule', 'Cashflow & Transactions',
      'Invoice Management', 'Payments & Receipts', 'Documents', 'Change Requests', 'Help & Support', 'Contact support'])
    expect(within(sidebar).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page')
    expect(within(sidebar).getByRole('button', { name: 'Profile' })).toBeTruthy()
  })

  it('has no search box in the header', async () => {
    await renderAt('/home')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByPlaceholderText(/Search anything/)).toBeNull()
  })

  it('reaches Support from the sidebar and names the relationship manager', async () => {
    await renderAt('/home')
    const sidebar = screen.getByRole('complementary', { name: 'Sections' })
    await act(async () => { fireEvent.click(within(sidebar).getByRole('link', { name: 'Help & Support' })) })
    expect(screen.getByTestId('where').textContent).toBe('/support')
    expect(screen.getByText('Priya Nair')).toBeTruthy()
  })

  it('never opens an email app: no mailto link anywhere in the portal shell', async () => {
    for (const path of ['/home', '/support']) {
      await renderAt(path)
      expect(screen.getAllByRole('link').filter((a) => (a.getAttribute('href') || '').startsWith('mailto:'))).toEqual([])
      cleanup()
    }
  })

  it('keeps a customer still in onboarding off Home', async () => {
    api.getVendorProfile.mockResolvedValue({ ...PROFILE, stage: 'maker_review' })
    await renderAt('/home')
    expect(screen.getByTestId('where').textContent).toBe('/application-status')
    expect(api.getMyHome).not.toHaveBeenCalled()
  })
})

describe('Support', () => {
  async function fillForm() {
    await renderAt('/support')
    fireEvent.change(screen.getByLabelText(/What is it about/), { target: { value: 'invoice' } })
    fireEvent.change(screen.getByLabelText(/Invoice, request or loan number/), { target: { value: ' INV-1 ' } })
    fireEvent.change(screen.getByLabelText(/Your message/), { target: { value: '  My invoice was returned, why?  ' } })
    return screen.getByRole('button', { name: /Send message/ })
  }

  it('has no Agreement question', async () => {
    await renderAt('/support')
    const questions = screen.getByRole('region', { name: 'Common questions' })
    expect(within(questions).queryByText(/agreement/i)).toBeNull()
    expect(within(questions).getAllByRole('listitem')).toHaveLength(3)
  })

  it('cannot be sent until a topic and a long enough message are given', async () => {
    await renderAt('/support')
    const send = screen.getByRole('button', { name: /Send message/ })
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/What is it about/), { target: { value: 'general' } })
    fireEvent.change(screen.getByLabelText(/Your message/), { target: { value: 'too short' } })
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Your message/), { target: { value: 'Long enough now.' } })
    expect(send.disabled).toBe(false)
  })

  it('sends through the backend once, and says sent only after the backend confirms', async () => {
    let confirm
    api.sendSupportRequest.mockImplementation(() => new Promise((resolve) => { confirm = resolve }))
    const send = await fillForm()
    await act(async () => { fireEvent.click(send) })
    // Sending: the button is disabled and nothing claims success yet; a second click sends nothing more.
    expect(screen.getByRole('button', { name: /Sending/ }).disabled).toBe(true)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Sending/ })) })
    expect(api.sendSupportRequest).toHaveBeenCalledTimes(1)
    expect(api.sendSupportRequest).toHaveBeenCalledWith({ topic: 'invoice', reference: 'INV-1', message: 'My invoice was returned, why?' })
    expect(screen.queryByText(/has been sent/)).toBeNull()
    await act(async () => { confirm({ sent: true, request_id: 'SUP-85-20261028173000', submitted_at: '28 Oct 2026, 05:30 PM IST' }) })
    expect(screen.getByRole('status').textContent).toMatch(/has been sent to our support team.*SUP-85-20261028173000/)
  })

  it('shows the backend\'s reason when it could not send, and keeps the message', async () => {
    const failure = Object.assign(new Error('Support messages can\'t be sent from the portal yet. Please try again later.'), { status: 503, body: { code: 'not_configured' } })
    api.sendSupportRequest.mockRejectedValue(failure)
    const send = await fillForm()
    await act(async () => { fireEvent.click(send) })
    expect(screen.getByRole('alert').textContent).toMatch(/can't be sent from the portal yet/)
    expect(screen.queryByText(/has been sent/)).toBeNull()
    expect(screen.getByLabelText(/Your message/).value).toMatch(/My invoice was returned/)
    expect(screen.getByRole('button', { name: /Send message/ }).disabled).toBe(false)
  })

  it('marks the fields the backend refused', async () => {
    api.sendSupportRequest.mockRejectedValue(Object.assign(new Error('Please check the highlighted fields.'), { status: 400, body: { fields: { reference: 'Use up to 60 letters.' } } }))
    const send = await fillForm()
    await act(async () => { fireEvent.click(send) })
    expect(screen.getByText('Use up to 60 letters.')).toBeTruthy()
    expect(screen.getByLabelText(/Invoice, request or loan number/).getAttribute('aria-invalid')).toBe('true')
  })
})
