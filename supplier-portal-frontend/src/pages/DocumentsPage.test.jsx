// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../routes/AppRoutes'
import * as api from '../api/vendorApi'
import { clearFinanceCache } from '../utils/finance'
import { FINANCE, NOTIFICATIONS } from '../test/financeFixture'

/*
 * Documents, through the real routes, on a journey shaped as LAS's customer journey API answers (its
 * customer-journey.mjs), stubbed at the API module as isolated test data. Covers: every issued PDF of the signed-in
 * customer in one list (newest first, nothing not yet issued), the first one open in the preview, opening another,
 * Download with the right kind and id, statements, the phone layout, and the empty, error and not-onboarded states.
 */
vi.mock('../api/vendorApi', async (importOriginal) => ({
  ...(await importOriginal()),
  getVendorProfile: vi.fn(async () => ({ vendor_id: 86, name: 'Neekhat A', stage: 'active' })),
  getMyLoans: vi.fn(),
  getMyFinance: vi.fn(),
  getMyNotifications: vi.fn(),
  fetchLoanDocumentUrl: vi.fn(async () => 'blob:loan-document'),
  downloadLoanDocument: vi.fn(async () => {}),
  downloadStatement: vi.fn(async () => {}),
  getRenewal: vi.fn(async () => null),
  getMyAgreements: vi.fn(async () => []),
}))

// LAS answers for the signed-in customer only (portalId = their vendor id); these are all of theirs.
const JOURNEY = {
  onboarded: true, customerNo: '700000693', customerName: 'SilverOak Engineering Works', invoicesAvailable: true, steps: [],
  sanctions: [
    { id: '1000-11', requestNo: '11', sanctionNo: '100411', status: 'approved', statusLabel: 'Approved', product: 'Credit Line · Regular', limit: 5000000, currency: 'INR', appliedOn: '2026-10-01', decidedOn: '2026-10-05', startDate: '2026-10-06', endDate: '2099-10-05', hasDocument: true },
    { id: '1000-12', requestNo: '12', sanctionNo: '', status: 'under_review', statusLabel: 'Under review', product: 'Credit Line · Regular', limit: 2000000, currency: 'INR', appliedOn: '2026-10-20', decidedOn: '', startDate: '', endDate: '', hasDocument: false },
  ],
  drawdowns: [
    { id: '1000-5', requestNo: '5', drawdownNo: '23000068', sanctionNo: '100411', status: 'disbursed', statusLabel: 'Amount disbursed', amount: 1000000, currency: 'INR', requestedOn: '2026-10-10', startDate: '2026-10-11', endDate: '2099-04-10', rate: 9.5, frequency: 'Quarterly', hasDocument: true },
    { id: '1000-6', requestNo: '6', drawdownNo: '', sanctionNo: '100411', status: 'requested', statusLabel: 'Requested', amount: 250000, currency: 'INR', requestedOn: '2026-10-28', startDate: '', endDate: '', rate: 9.5, frequency: 'Quarterly', hasDocument: false },
  ],
  invoices: [
    { id: 'aW52LTEw', kind: 'Dues', title: 'Dues for Oct 2026', month: '2026-10', dueDate: '2026-10-31', amount: 7808.22, currency: 'INR', sanctionNo: '100411', drawdownNo: '23000068', hasDocument: true },
    { id: 'aW52LWZlZQ', kind: 'Charges', title: 'Processing fee', month: '2026-10', dueDate: '2026-10-11', amount: 5900, currency: 'INR', sanctionNo: '100411', drawdownNo: '23000068', hasDocument: true },
  ],
}

async function renderDocuments() {
  localStorage.setItem('vendor-onboarding-auth', JSON.stringify({ email: 'n@x.test', vendor_id: 86, token: 't' }))
  await act(async () => { render(<MemoryRouter initialEntries={['/documents']}><AppRoutes /></MemoryRouter>) })
}
const list = () => screen.getByRole('list', { name: 'Documents' })
const titles = () => within(list()).getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label'))

beforeEach(() => {
  api.getMyLoans.mockResolvedValue(JOURNEY)
  api.getMyFinance.mockResolvedValue(FINANCE)
  api.getMyNotifications.mockResolvedValue(NOTIFICATIONS)
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}
  delete window.matchMedia
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); clearFinanceCache() })

describe('Documents', () => {
  it('lists every issued PDF of the customer at once, newest first, with no filters', async () => {
    await renderDocuments()
    expect(api.getMyLoans).toHaveBeenCalledTimes(1)
    expect(titles()).toEqual([
      'Open Invoice Dues for Oct 2026',
      'Open Drawdown Memo Drawdown No. 23000068',
      'Open Invoice Processing fee',
      'Open Sanction Memo Sanction No. 100411',
    ])
    // Items not issued yet are not listed, and there is nothing to filter.
    expect(screen.queryByText(/Application 12|request 6/)).toBeNull()
    expect(screen.queryByRole('group', { name: 'Filters' })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('opens the newest document in the preview, and another when it is chosen', async () => {
    await renderDocuments()
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).getByTitle('Invoice · Dues for Oct 2026')).toBeTruthy()
    expect(api.fetchLoanDocumentUrl).toHaveBeenLastCalledWith('invoice', 'aW52LTEw')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open Sanction Memo Sanction No. 100411' })) })
    expect(api.fetchLoanDocumentUrl).toHaveBeenLastCalledWith('sanction', '1000-11')
    expect(within(preview).getByTitle('Sanction Memo · Sanction No. 100411')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Sanction Memo Sanction No. 100411' }).getAttribute('aria-current')).toBe('true')
  })

  it('downloads a document with its kind, id and file name, and says so when it fails', async () => {
    await renderDocuments()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download Drawdown Memo Drawdown No. 23000068' })) })
    expect(api.downloadLoanDocument).toHaveBeenCalledWith('drawdown', '1000-5', 'Drawdown_Memo_23000068.pdf')
    api.downloadLoanDocument.mockRejectedValueOnce(new Error('Unable to load the document. Please try again.'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download Invoice Processing fee' })) })
    expect(screen.getByRole('alert').textContent).toBe('Unable to load the document. Please try again.')
  })

  it('offers each statement as PDF or Excel', async () => {
    await renderDocuments()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Repayment schedule as PDF' })) })
    expect(api.downloadStatement).toHaveBeenCalledWith('schedule', 'pdf', {})
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Account statement as Excel' })) })
    expect(api.downloadStatement).toHaveBeenCalledWith('transactions', 'xlsx', {})
  })

  it('on a phone a document opens full screen instead of a side preview', async () => {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
    await renderDocuments()
    expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open Sanction Memo Sanction No. 100411' })) })
    expect(screen.getByRole('dialog', { name: 'Sanction Memo' })).toBeTruthy()
  })

  it('says when there are no documents yet, and when invoices could not be read', async () => {
    api.getMyLoans.mockResolvedValue({ ...JOURNEY, sanctions: [JOURNEY.sanctions[1]], drawdowns: [JOURNEY.drawdowns[1]], invoices: [], invoicesAvailable: false })
    await renderDocuments()
    expect(screen.getByText(/No documents yet/)).toBeTruthy()
    expect(screen.getByText(/Your invoices can’t be shown right now/)).toBeTruthy()
    expect(screen.getByText('Choose a document to preview it here.')).toBeTruthy()
  })

  it('shows the error and tries again', async () => {
    api.getMyLoans.mockRejectedValueOnce(new Error('Unable to load your loans. Please try again.'))
    await renderDocuments()
    expect(screen.getByRole('alert').textContent).toMatch(/Unable to load your loans/)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Try again/ })) })
    expect(titles()).toHaveLength(4)
  })

  it('before the loan account exists there is nothing to show', async () => {
    api.getMyLoans.mockResolvedValue({ onboarded: false, sanctions: [], drawdowns: [], invoices: [] })
    await renderDocuments()
    expect(screen.getByText(/Your loan account is being set up/)).toBeTruthy()
  })

  it('is reached from the sidebar', async () => {
    await renderDocuments()
    const sidebar = screen.getByRole('complementary', { name: 'Sections' })
    expect(within(sidebar).getByRole('link', { name: 'Documents' }).getAttribute('aria-current')).toBe('page')
  })
})
