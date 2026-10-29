// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../routes/AppRoutes'
import * as api from '../api/vendorApi'

/*
 * Loans & Sanctions with the loan tracker, through the real routes, on a journey shaped as LAS's customer journey API
 * answers (its customer-journey.mjs), stubbed at the API module as isolated test data.
 */
vi.mock('../api/vendorApi', async (importOriginal) => ({
  ...(await importOriginal()),
  getVendorProfile: vi.fn(async () => ({ vendor_id: 85, name: 'Neekhat A', stage: 'active' })),
  getMyLoans: vi.fn(),
  getRenewal: vi.fn(async () => null),
  getMyDocuments: vi.fn(async () => []),
  getUpdateRequests: vi.fn(async () => []),
}))

const LAS_JOURNEY = {
  onboarded: true, customerNo: '700000692', customerName: 'SilverOak Engineering Works', invoicesAvailable: true, steps: [],
  sanctions: [
    { id: '1000-12', requestNo: '12', sanctionNo: '', status: 'under_review', statusLabel: 'Under review', product: 'Credit Line · Regular', limit: 2000000, currency: 'INR', appliedOn: '2026-10-20', decidedOn: '', startDate: '2026-11-01', endDate: '2027-10-31', hasDocument: false },
    { id: '1000-11', requestNo: '11', sanctionNo: '100411', status: 'approved', statusLabel: 'Approved', product: 'Credit Line · Regular', limit: 5000000, currency: 'INR', appliedOn: '2026-10-01', decidedOn: '2026-10-05', startDate: '2026-10-06', endDate: '2099-10-05', hasDocument: true },
  ],
  drawdowns: [
    { id: '1000-5', requestNo: '5', drawdownNo: '23000068', sanctionNo: '100411', status: 'disbursed', statusLabel: 'Amount disbursed', amount: 1000000, currency: 'INR', requestedOn: '2026-10-10', startDate: '2026-10-11', endDate: '2099-04-10', rate: 9.5, frequency: 'Quarterly', hasDocument: true },
  ],
  invoices: [],
}

async function renderLoans() {
  localStorage.setItem('vendor-onboarding-auth', JSON.stringify({ email: 'n@x.test', vendor_id: 85, token: 't' }))
  await act(async () => { render(<MemoryRouter initialEntries={['/loans']}><AppRoutes /></MemoryRouter>) })
}
const phase = (title) => screen.getByRole('heading', { level: 3, name: title }).closest('li')

// Braces matter: a function returned from beforeEach is run by Vitest as a cleanup hook.
beforeEach(() => { api.getMyLoans.mockResolvedValue(LAS_JOURNEY) })
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })

describe('Loan tracker', () => {
  it('shows the four phases with the current one marked, and the totals', async () => {
    await renderLoans()
    const journey = screen.getByRole('list', { name: 'Your loan journey' })
    expect(within(journey).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Origination', 'Sanction', 'Disbursement', 'Servicing & closure'])
    // Across all applications a step is done once any application has done it: one drawdown is paid out, so the
    // customer is in servicing (the application still under review shows its own phase in the register).
    expect(phase('Servicing & closure').getAttribute('aria-current')).toBe('step')
    expect(within(phase('Servicing & closure')).getByText('You are here')).toBeTruthy()
    expect(phase('Origination').getAttribute('aria-current')).toBeNull()
    expect(within(phase('Disbursement')).getByText('₹10,00,000.00 paid out')).toBeTruthy()
    expect(within(phase('Servicing & closure')).getByText(/Repay by 2099-04-10/)).toBeTruthy()
    const header = screen.getByRole('region', { name: 'From application to closure' })
    const totals = within(header).getByText('Sanctioned limit').closest('dl')
    expect(within(totals).getByText('₹50,00,000.00')).toBeTruthy() // the approved sanction only
    expect(within(totals).getByText('₹10,00,000.00')).toBeTruthy()
    expect(screen.getByText(/Customer No\. 700000692/)).toBeTruthy()
  })

  it('lists each application with its own current phase, and follows one when chosen', async () => {
    await renderLoans()
    const register = screen.getByRole('region', { name: 'Your applications' })
    const rows = within(register).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[3].textContent)).toEqual(['Origination', 'Servicing & closure'])
    await act(async () => { fireEvent.click(within(rows[1]).getByRole('button', { name: /^11/ })) })
    expect(screen.getByText('Sanction Request No. 11 · Sanction No. 100411')).toBeTruthy()
    expect(phase('Servicing & closure').getAttribute('aria-current')).toBe('step')
    expect(within(phase('Sanction')).getByText('Sanction No. 100411')).toBeTruthy()
    // The chips say the same, and All brings the whole picture back.
    expect(screen.getByRole('button', { name: 'Request 11 · Sanction 100411' }).getAttribute('aria-pressed')).toBe('true')
    // Request 12 alone is still in origination.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Request 12' })) })
    expect(phase('Origination').getAttribute('aria-current')).toBe('step')
    expect(within(phase('Origination')).getByText('Your application is with the credit team.')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /All applications/ })) })
    expect(phase('Servicing & closure').getAttribute('aria-current')).toBe('step')
  })

  it('a customer with no application yet: the application is the next step, no register', async () => {
    api.getMyLoans.mockResolvedValue({ ...LAS_JOURNEY, sanctions: [], drawdowns: [] })
    await renderLoans()
    expect(within(phase('Origination')).getByText('Your relationship manager raises it for you.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Your applications' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Show applications' })).toBeNull()
  })

  it('says invoices can’t be checked when LAS could not read them', async () => {
    api.getMyLoans.mockResolvedValue({ ...LAS_JOURNEY, invoicesAvailable: false })
    await renderLoans()
    expect(within(phase('Servicing & closure')).getAllByText('Your invoices can’t be shown right now.').length).toBe(1)
  })

  it('still shows the plain error when the journey cannot be loaded', async () => {
    api.getMyLoans.mockImplementation(() => Promise.reject(new Error('LAS unavailable (test)')))
    await renderLoans()
    expect(screen.queryAllByRole('alert').map((a) => a.textContent)).toEqual(['LAS unavailable (test)'])
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Your loan journey' })).toBeNull()
  })
})
