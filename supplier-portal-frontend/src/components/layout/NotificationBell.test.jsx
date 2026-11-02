// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import * as api from '../../api/vendorApi'
import NotificationBell from './NotificationBell'
import AppShell from './AppShell'

/*
 * The header bell (NotificationBell.jsx) with the backend stubbed at the API module, every call of it (isolated test data,
 * never presented as live): what needs the customer first, every stage grouped by workflow with its chip, opening an item
 * goes to its page and marks it read, a failure is said, and the shell shows the bell to a customer still in onboarding.
 */
vi.mock('../../api/vendorApi', async (importOriginal) => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name, typeof value === 'function' ? vi.fn(async () => ({})) : value]))
})
const auth = { stage: 'maker_review' }
vi.mock('../../hooks/useAuth', () => ({
  default: () => ({ logout: vi.fn(), user: { email: 'n@x.test', vendor_id: 85, token: 't' }, profile: { vendor_id: 85, name: 'Neekhat A' }, stage: auth.stage, updateProfile: vi.fn() }),
}))

const FEED = {
  items: [
    { id: 'inv-1-r32', kind: 'action', tone: 'back', workflow: 'invoices', stage: 'returned', title: 'Invoice INV-1 was returned to you for correction', detail: ['By the checker'], on: '2026-10-30', to: '/invoices', read: false },
    { id: 'sanction-1000-12-returned_to_maker', kind: 'update', tone: 'back', workflow: 'loans', stage: 'maker', title: 'Loan application 12 returned to your relationship manager for correction', detail: ['₹50,00,000.00'], on: '2026-10-30', to: '/loans', read: false },
    { id: 'inv-1-a22', kind: 'update', tone: 'pending', workflow: 'invoices', stage: 'authorizer', title: 'Invoice INV-1 is with the authorizer for final approval', detail: [], on: '2026-10-23', to: '/invoices', read: true },
    { id: 'onb-a7', kind: 'update', tone: 'pending', workflow: 'onboarding', stage: 'checker', title: 'Your application was sent to the checker for approval', detail: ['By the maker'], on: '2026-10-20', to: '/application-status', read: true },
    // From before workflows were sent: grouped by its page.
    { id: 'payment-7001', kind: 'update', tone: 'approved', title: 'Payment of ₹12,000.00 confirmed', detail: ['Ref. UTR1'], on: '2026-10-05', to: '/payments', read: true },
  ],
  unread: 2, readState: true, unavailable: [],
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

async function openBell(ui = <NotificationBell />) {
  await act(async () => { render(<MemoryRouter initialEntries={['/start']}>{ui}<Where /></MemoryRouter>) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Notifications/ })) })
  return screen.getByRole('dialog', { name: 'Notifications' })
}

beforeEach(() => {
  auth.stage = 'maker_review'
  api.getMyNotifications.mockResolvedValue(FEED)
  api.markNotificationsRead.mockResolvedValue({ marked: 1 })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Notification bell', () => {
  it('puts what needs the customer first, then each workflow with its stages', async () => {
    const panel = await openBell()
    expect(screen.getByRole('button', { name: 'Notifications: 2 unread' })).toBeTruthy()
    const headings = within(panel).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['Needs your attention1', 'Application1', 'Loans1', 'Invoices1', 'Payments1'])
    const attention = within(panel).getByRole('region', { name: /Needs your attention/ })
    expect(within(attention).getByText('Invoice INV-1 was returned to you for correction')).toBeTruthy()
    expect(within(attention).getByText('Returned to you')).toBeTruthy() // the stage chip
    expect(within(attention).getByText('Invoices')).toBeTruthy() // and its workflow, since this section mixes them
    const invoices = within(panel).getByRole('region', { name: /^Invoices/ })
    expect(within(invoices).getByText('Authorizer')).toBeTruthy()
    expect(within(within(panel).getByRole('region', { name: /^Application/ })).getByText('Checker')).toBeTruthy()
    expect(within(within(panel).getByRole('region', { name: /^Loans/ })).getByText('Maker')).toBeTruthy()
    expect(within(within(panel).getByRole('region', { name: /^Payments/ })).getByText('Payment of ₹12,000.00 confirmed')).toBeTruthy()
    // Unread items say so to a screen reader.
    expect(within(panel).getAllByText('(unread)')).toHaveLength(2)
  })

  it('opens an item at its page and marks it read; Escape closes and gives the focus back', async () => {
    let panel = await openBell()
    await act(async () => { fireEvent.click(within(panel).getByText('Loan application 12 returned to your relationship manager for correction')) })
    expect(screen.getByTestId('where').textContent).toBe('/loans')
    expect(api.markNotificationsRead).toHaveBeenCalledWith(['sanction-1000-12-returned_to_maker'])
    expect(screen.queryByRole('dialog')).toBeNull()
    const bell = screen.getByRole('button', { name: 'Notifications: 1 unread' })
    await act(async () => { fireEvent.click(bell) })
    panel = screen.getByRole('dialog', { name: 'Notifications' })
    // A read item is not marked again.
    await act(async () => { fireEvent.click(within(panel).getByText('Payment of ₹12,000.00 confirmed')) })
    expect(api.markNotificationsRead).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(bell) })
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(bell)
  })

  it('marks everything read at once', async () => {
    const panel = await openBell()
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'Mark all read' })) })
    expect(api.markNotificationsRead).toHaveBeenCalledWith('all')
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('fits a phone: across the screen under the header, hanging from the bell from sm up', async () => {
    const panel = await openBell()
    expect(panel.className).toMatch(/\bfixed\b/)
    expect(panel.className).toMatch(/\binset-x-2\b/)
    expect(panel.className).toMatch(/sm:w-\[24rem\]/)
  })

  it('says when nothing is there, when a source cannot be checked, and when the bell cannot load', async () => {
    api.getMyNotifications.mockResolvedValue({ items: [], unread: 0, readState: true, unavailable: ['loan_stages'] })
    let panel = await openBell()
    expect(within(panel).getByText('Nothing needs you right now.')).toBeTruthy()
    expect(within(panel).getByText('No updates in the last 30 days.')).toBeTruthy()
    expect(within(panel).getByText('Some updates can’t be checked right now.')).toBeTruthy()
    cleanup()
    api.getMyNotifications.mockRejectedValue(new Error('Unable to load your notifications.'))
    panel = await openBell()
    expect(within(panel).getByRole('alert').textContent).toBe('Unable to load your notifications.')
  })
})

describe('The shell', () => {
  it('shows the bell to a customer still in onboarding, and to an active one', async () => {
    const panel = await openBell(<AppShell><p>Page</p></AppShell>)
    expect(within(panel).getByText('Your application was sent to the checker for approval')).toBeTruthy()
    expect(api.getMyNotifications).toHaveBeenCalled()
    cleanup()
    auth.stage = 'active'
    expect(await openBell(<AppShell><p>Page</p></AppShell>)).toBeTruthy()
  })
})
