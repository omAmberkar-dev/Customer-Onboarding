import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, SUPPORT_EMAIL, isActivePath } from './navigation'
import { displayName, greetingName } from '../../utils/customer'

// Every route the sidebar can send a customer to must exist (src/routes/AppRoutes.jsx).
const ROUTES = ['/home', '/loans', '/drawdowns', '/repayments', '/cashflow', '/invoices', '/payments', '/documents', '/update-requests', '/support']

describe('navigation', () => {
  it('links only to routes that exist; Profile opens the panel', () => {
    for (const item of NAV_ITEMS) {
      if (item.profile) expect(item.to).toBeUndefined()
      else expect(ROUTES).toContain(item.to)
    }
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['Dashboard', 'My Loans & Sanctions', 'Drawdown History', 'Repayment Schedule', 'Cashflow & Transactions',
      'Invoice Management', 'Payments & Receipts', 'Documents', 'Change Requests', 'Profile', 'Help & Support'])
  })

  it('has no entry point into the Agreement section for this release', () => {
    for (const item of NAV_ITEMS) {
      expect(item.to || '').not.toMatch(/agreement/)
      expect(item.label).not.toMatch(/agreement/i)
    }
  })

  it('marks the active item', () => {
    const invoices = NAV_ITEMS.find((i) => i.label === 'Invoice Management')
    expect(isActivePath(invoices, '/invoices')).toBe(true)
    expect(isActivePath(invoices, '/home')).toBe(false)
    expect(isActivePath(NAV_ITEMS.find((i) => i.profile), '/anything')).toBe(false)
  })

  it('uses the configured support mailbox, not a placeholder', () => {
    expect(SUPPORT_EMAIL).toBe('support@fourthsignal.com')
  })
})

describe('customer name', () => {
  it('prefers the person, then the company, then the email', () => {
    expect(displayName({ name: ' Neekhat A ', vendor_legal_name: 'Acme' }, { email: 'n@x.test' })).toBe('Neekhat A')
    expect(displayName({ vendor_legal_name: 'Acme Pvt Ltd' }, { email: 'n@x.test' })).toBe('Acme Pvt Ltd')
    expect(displayName(null, { email: 'neekhat.a@x.test' })).toBe('neekhat.a@x.test')
  })

  it('greets a person by first name and a company by its whole name', () => {
    expect(greetingName({ name: 'Rahul Sharma', vendor_legal_name: 'Sharma Traders Pvt Ltd' })).toBe('Rahul')
    // Most accounts repeat the company's name in `name`: "Hello, Aditya!" would read as a person.
    expect(greetingName({ name: 'Aditya Birla Capital Limited', vendor_legal_name: 'Aditya Birla Capital Limited' })).toBe('Aditya Birla Capital Limited')
    expect(greetingName({ name: ' OSPREY SECURITY SOLUTIONS', vendor_legal_name: 'Osprey Security Solutions ' })).toBe('OSPREY SECURITY SOLUTIONS')
    expect(greetingName({ vendor_legal_name: 'Acme Pvt Ltd' })).toBe('Acme Pvt Ltd')
    expect(greetingName(null, { email: 'n@x.test' })).toBe('n@x.test')
  })
})
