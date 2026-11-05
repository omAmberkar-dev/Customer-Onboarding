// A full stand-in for src/api/vendorApi in page tests: every network call is a stub, so a test can never reach a backend
// (an unmocked call would hit :5000 and sign the test user out). Pure helpers and constants stay real.
// Use: vi.mock('../api/vendorApi', async (importOriginal) => (await import('../test/vendorApiMock')).mockVendorApi(await importOriginal(), { ...overrides }))
import { vi } from 'vitest'

const PURE = new Set(['toFormValues'])

// What the shell itself asks for on every page, answered as an active customer with nothing pending.
const SHELL = {
  getVendorProfile: async () => ({ vendor_id: 84, name: 'Neekhat A', stage: 'active' }),
  getMyNotifications: async () => ({ items: [], unread: 0, readState: true, unavailable: [] }),
  markNotificationsRead: async () => ({ marked: 0 }),
  getRenewal: async () => null,
  getMyAgreements: async () => [],
  getMyDocuments: async () => [],
  getUpdateRequests: async () => [],
}

export function mockVendorApi(real, overrides = {}) {
  const stubs = Object.fromEntries(Object.entries(real).map(([name, value]) => {
    if (typeof value !== 'function' || PURE.has(name)) return [name, value]
    return [name, vi.fn(SHELL[name] || (async () => undefined))]
  }))
  return { ...stubs, ...overrides }
}
