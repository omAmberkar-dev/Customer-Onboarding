// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../routes/AppRoutes'
import * as api from '../api/vendorApi'

/*
 * The customer request form (/request-vendor) in its LAS layout, through the real route: the step's cards, the step bar
 * and footer, a returned application in correction mode (banner, remarks, flagged fields, values kept, Resubmit for
 * review, earlier corrections), and that what the form hands the API on submit is unchanged. Every backend call is a
 * stub; only the pure mapping of a stored record onto the form's values (toFormValues) runs as written.
 */
vi.mock('../api/vendorApi', async (importOriginal) => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name, typeof value === 'function' && name !== 'toFormValues' ? vi.fn() : value]))
})

// Isolated test data in the shape of GET /vendors/me: a customer with every required detail saved.
const SAVED = {
  vendor_id: 84, email: 'neekhat@example.test', contact_no: '+919876543210',
  vendor_legal_name: 'Osprey Security Solutions Private Limited', vendor_type: 'Organization', year_established: '2014', currency: 'INR',
  registration_number: 'U74999MH2014PTC123456', msme_status: 'Not registered', udyam_number: null, assigned_rm: null,
  gstin: '27AABCO1234F1Z5', pan: 'AABCO1234F', aadhaar_no: null, cin: 'U74999MH2014PTC123456',
  demat_id: null, dp_id: null, bo_id: null, depository: null,
  street: '12 Marine Drive', city: 'Mumbai', district: 'Mumbai', region: 'Maharashtra', postal_code: '400020',
  account_holder_name: 'Osprey Security Solutions', bank_name: 'HDFC Bank', branch_name: 'Fort', bank_account_no: '123456789012', ifsc_code: 'HDFC0001234',
}
const DRAFT = { ...SAVED, stage: 'draft', rejection: null }
const REJECTION = {
  rejection_id: 7, round_no: 2, rejected_by_role: 'checker', rejected_at: '2026-11-03T10:00:00',
  overall_remark: 'The bank details do not match the cancelled cheque.',
  items: [
    { item_id: 1, field_key: 'vendor_legal_name', field_label: 'Legal name', reason_label: 'Does not match PAN', remark: 'Check the spelling', fixed: false },
    { item_id: 2, field_key: 'ifsc_code', field_label: 'IFSC code', reason_label: 'Does not match bank proof', remark: 'Cheque shows HDFC0000060', fixed: false },
    { item_id: 3, field_key: 'other', field_label: 'Other', reason_label: 'Other', remark: 'Upload a clearer PAN card', fixed: false },
  ],
}
const RETURNED = { ...SAVED, stage: 'returned', rejection: REJECTION }
const HISTORY = [
  {
    rejection_id: 5, round_no: 1, rejected_by_role: 'maker', rejected_at: '2026-10-20T10:00:00', resubmitted_at: '2026-10-22T09:00:00',
    overall_remark: 'Please add the GSTIN.', items: [{ item_id: 9, field_key: 'gstin', field_label: 'GSTIN', reason_label: 'Missing', remark: '', fixed: true }],
  },
]

// What the form holds for SAVED: the values handed to saveOnboardingDraft / submitOnboarding.
const FORM_VALUES = {
  vendorEmail: 'neekhat@example.test', vendorPhoneCode: '+91', vendorPhone: '9876543210',
  vendorLegalName: 'Osprey Security Solutions Private Limited', vendorType: 'Organization', yearEstablished: '2014', currency: 'INR',
  registrationNumber: 'U74999MH2014PTC123456', msmeStatus: 'Not registered', udyamNumber: '', assignedRm: '',
  gstin: '27AABCO1234F1Z5', pan: 'AABCO1234F', aadhaar: '', cin: 'U74999MH2014PTC123456',
  dematId: '', dpId: '', boId: '', depository: '',
  registeredAddress1: '12 Marine Drive', registeredCity: 'Mumbai', registeredDistrict: 'Mumbai', registeredState: 'Maharashtra', registeredPostalCode: '400020',
  accountHolderName: 'Osprey Security Solutions', bankName: 'HDFC Bank', branchName: 'Fort', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'HDFC0001234',
}

// Under a full parallel run the form's checks (PAN availability, saving) can take longer than Testing Library's 1 s default.
const SLOW = { timeout: 8000 }

async function renderForm(profile) {
  api.getVendorProfile.mockResolvedValue(profile)
  localStorage.setItem('vendor-onboarding-auth', JSON.stringify({ email: profile.email, vendor_id: profile.vendor_id, token: 't' }))
  await act(async () => { render(<MemoryRouter initialEntries={['/request-vendor']}><AppRoutes /></MemoryRouter>) })
  await screen.findByRole('list', { name: /^Step \d of 4$/ }, SLOW)
}
const stepBar = () => screen.getByRole('list', { name: /^Step \d of 4$/ })
const currentStep = () => within(stepBar()).getAllByRole('listitem').find((item) => item.getAttribute('aria-current') === 'step')
const button = (name) => screen.getByRole('button', { name })
const footer = () => within(document.querySelector('.vr-foot'))
async function click(element) { await act(async () => { fireEvent.click(element) }) }
// Continue from the current step, once the form allows it, and wait for the next step to show.
async function continueTo(title) {
  // While the PAN's availability is checked the button says so, so it is looked for until it reads Continue.
  const next = await screen.findByRole('button', { name: /^(Continue|Review request)/ }, SLOW)
  await waitFor(() => expect(next.disabled).toBe(false), SLOW)
  await click(next)
  await waitFor(() => expect(currentStep().textContent).toContain(title), SLOW)
}
// Ticks both declarations; the terms are accepted from inside the policy, after reading to its end.
async function acceptDeclarations() {
  await click(screen.getByRole('checkbox', { name: /provided information is accurate/ }))
  await click(screen.getByRole('checkbox', { name: /I agree to the/ }))
  const dialog = screen.getByRole('dialog', { name: 'Terms and policies' })
  await act(async () => { fireEvent.scroll(dialog.querySelector('[tabindex="0"]')) })
  await click(within(dialog).getByRole('button', { name: /Yes, I agree/ }))
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
})
beforeEach(() => {
  api.getMyDocuments.mockResolvedValue({})
  api.saveOnboardingDraft.mockResolvedValue({})
  api.submitOnboarding.mockResolvedValue({})
  api.checkPanExists.mockResolvedValue(false)
  api.verifyIdentity.mockResolvedValue({ verified: true, message: 'Verified.' })
  api.lookupPincode.mockResolvedValue(null)
  api.getMyNotifications.mockResolvedValue({ items: [], unread: 0, readState: true, unavailable: [] })
  api.getRenewal.mockResolvedValue(null)
  api.getMyAgreements.mockResolvedValue([])
})
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })

describe('Customer request form', () => {
  it('lays out step 1 as LAS does: the step bar, the titled cards and the footer actions', async () => {
    await renderForm(DRAFT)
    expect(screen.getByRole('heading', { level: 1, name: 'Request customer account' })).toBeTruthy()
    expect(within(stepBar()).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1Customer', '2Address', '3Bank', '4Review'])
    expect(currentStep().textContent).toContain('Customer')
    for (const name of ['Contact details', 'Customer information', 'Demat account details']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
    expect(within(screen.getByRole('region', { name: 'Customer information' })).getByLabelText(/^Customer legal name/).value).toBe(FORM_VALUES.vendorLegalName)
    expect(button('Save draft')).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Continue/ }, SLOW)).toBeTruthy()
    expect(footer().queryByRole('button', { name: /Back/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Correction required' })).toBeNull()
  })

  it('shows each step’s cards in turn, and hands the API the same values on save and submit', async () => {
    await renderForm(DRAFT)
    await continueTo('Address')
    expect(api.checkPanExists).toHaveBeenCalledWith('AABCO1234F')
    expect(api.saveOnboardingDraft).toHaveBeenLastCalledWith({ ...FORM_VALUES, accurateDeclaration: false, termsDeclaration: false })
    expect(screen.getByRole('region', { name: 'Registered address' })).toBeTruthy()
    expect(footer().getByRole('button', { name: /Back/ })).toBeTruthy()
    await continueTo('Bank')
    expect(screen.getByRole('region', { name: 'Bank details' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Upload supporting documents' })).toBeTruthy()
    await continueTo('Review')
    for (const name of ['Customer information', 'Address details', 'Bank details', 'Supporting documents', 'Confirm declarations']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
    // The review step keeps its actions with the declarations, as LAS's does.
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
    const send = button(/Send request/)
    expect(send.disabled).toBe(true)
    await acceptDeclarations()
    expect(send.disabled).toBe(false)
    await click(send)
    await waitFor(() => expect(api.submitOnboarding).toHaveBeenCalledTimes(1), SLOW)
    expect(api.submitOnboarding).toHaveBeenCalledWith({ ...FORM_VALUES, accurateDeclaration: true, termsDeclaration: true }, [])
  })
})

describe('Correction mode (a returned application)', () => {
  it('says Correction Required with the checker’s remark and every item, and highlights the flagged fields', async () => {
    await renderForm(RETURNED)
    expect(screen.getByRole('heading', { level: 1, name: 'Correct your application' })).toBeTruthy()
    const banner = screen.getByRole('region', { name: 'Correction required' })
    expect(within(banner).getByRole('heading', { name: 'Correction Required' })).toBeTruthy()
    expect(within(banner).getByText(/Returned by the checker on 3 Nov 2026 · Round 2/)).toBeTruthy()
    expect(within(banner).getByText('The bank details do not match the cancelled cheque.')).toBeTruthy()
    const items = within(within(banner).getByRole('list', { name: 'Items to correct' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Legal nameDoes not match PAN: Check the spelling'),
      expect.stringContaining('IFSC codeDoes not match bank proof: Cheque shows HDFC0000060'),
      expect.stringContaining('OtherOther: Upload a clearer PAN card'),
    ])
    expect(within(banner).getByText(/2 of 2 still to fix/)).toBeTruthy()
    // No earlier returns were sent, so none are shown.
    expect(within(banner).queryByText(/Earlier corrections/)).toBeNull()

    // It opens on the first step with something flagged; the flagged field is marked and keeps what was entered.
    expect(currentStep().textContent).toContain('Customer')
    const legalName = screen.getByLabelText(/^Customer legal name/)
    expect(legalName.value).toBe(FORM_VALUES.vendorLegalName)
    expect(legalName.className).toContain('app-field--flagged')
    expect(screen.getByLabelText(/Company registration number/).className).not.toContain('app-field--flagged')
    expect(screen.getAllByText('Needs your attention')).toHaveLength(1)
    expect(within(stepBar()).getAllByRole('listitem').filter((item) => item.className.includes('flagged')).map((item) => item.textContent))
      .toEqual(['1Customerhas items to correct', '3Bankhas items to correct'])

    // Fix takes the customer to the field's step, where it is marked too and still holds its value.
    await click(within(banner).getByRole('button', { name: 'Fix IFSC code' }))
    await waitFor(() => expect(currentStep().textContent).toContain('Bank'), SLOW)
    const ifsc = screen.getByLabelText(/^IFSC code/)
    expect(ifsc.value).toBe('HDFC0001234')
    expect(ifsc.className).toContain('app-field--flagged')
    expect(screen.getByLabelText(/Account holder name/).value).toBe('Osprey Security Solutions')
  })

  it('lists earlier corrections collapsed when the server sends them', async () => {
    await renderForm({ ...RETURNED, correction_history: HISTORY })
    const banner = screen.getByRole('region', { name: 'Correction required' })
    const history = within(banner).getByText(/Earlier corrections \(1\)/).closest('details')
    expect(history.open).toBe(false)
    expect(within(history).getByText(/Returned by the maker on 20 Oct 2026 · Round 1/)).toBeTruthy()
    expect(within(history).getByText('Resubmitted on 22 Oct 2026')).toBeTruthy()
    expect(within(history).getByText('“Please add the GSTIN.”')).toBeTruthy()
    expect(within(history).getByText('GSTIN — Missing')).toBeTruthy()
  })

  it('resubmits for review once every item is fixed or confirmed, with the same payload and confirmed fields', async () => {
    await renderForm(RETURNED)
    // The legal name is confirmed as entered; the IFSC is corrected.
    await click(button('This is correct as entered'))
    expect(screen.getByText(/Marked as correct as entered/)).toBeTruthy()
    await continueTo('Address')
    await continueTo('Bank')
    await act(async () => { fireEvent.change(screen.getByLabelText(/^IFSC code/), { target: { value: 'HDFC0000060' } }) })
    expect(screen.getByText(/Updated. It will be checked again/)).toBeTruthy()
    await continueTo('Review')
    expect(screen.queryByRole('button', { name: /Send request/ })).toBeNull()
    const resubmit = button(/Resubmit for review/)
    await acceptDeclarations()
    expect(resubmit.disabled).toBe(false)
    await click(resubmit)
    await waitFor(() => expect(api.submitOnboarding).toHaveBeenCalledTimes(1), SLOW)
    expect(api.submitOnboarding).toHaveBeenCalledWith(
      { ...FORM_VALUES, ifsc: 'HDFC0000060', accurateDeclaration: true, termsDeclaration: true },
      ['vendor_legal_name'],
    )
  })

  it('keeps Resubmit for review closed while a flagged item is still open', async () => {
    await renderForm(RETURNED)
    await continueTo('Address')
    await continueTo('Bank')
    await continueTo('Review')
    await acceptDeclarations()
    expect(button(/Resubmit for review/).disabled).toBe(true)
    expect(screen.getByText(/2 items sent back by our team are still waiting/)).toBeTruthy()
    // The values still to correct are marked on the review too.
    const review = screen.getByRole('region', { name: 'Customer information' })
    expect(within(review).getByText('Legal name').closest('div').className).toContain('flagged')
    expect(within(review).getByText('Registration no.').closest('div').className).not.toContain('flagged')
  })
})
