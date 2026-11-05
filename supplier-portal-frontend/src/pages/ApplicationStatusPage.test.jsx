// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../routes/AppRoutes'
import * as api from '../api/vendorApi'

/*
 * The application status page through the real routes and auth provider, with every backend call stubbed (src/test/vendorApiMock):
 * a returned application reads "Correction Required" with the reviewer's remarks and flagged fields and reopens the form; a
 * resubmitted one in review is marked with its round and keeps its earlier corrections. Isolated test data, never shown as live.
 */
vi.mock('../api/vendorApi', async (importOriginal) => (await import('../test/vendorApiMock')).mockVendorApi(await importOriginal(), {
  getVendorProfile: vi.fn(),
}))

const PAST = {
  round_no: 1, rejected_by_role: 'maker', overall_remark: 'Upload a clearer bank proof.', rejected_at: '2026-10-20T10:00:00',
  resubmitted_at: '2026-10-21T09:00:00',
  items: [{ field_key: 'doc_bank', field_label: 'Bank account proof', reason_label: 'Document unclear or unreadable', remark: null, fixed: true }],
}
const RETURNED = {
  vendor_id: 84, vendor_legal_name: 'Osprey Securities Pvt Ltd', email: 'o@x.test', stage: 'returned', submission_round: 2,
  submitted_at: '2026-10-21T09:00:00',
  rejection: {
    rejection_id: 5, round_no: 2, rejected_by_role: 'checker', overall_remark: 'Please correct the PAN.', rejected_at: '2026-10-30T10:00:00',
    items: [{ item_id: 9, field_key: 'pan', field_label: 'PAN', reason_label: 'PAN invalid or does not match GSTIN', remark: 'Typo', fixed: false }],
  },
  correction_history: [PAST],
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

async function renderWith(profile) {
  api.getVendorProfile.mockResolvedValue(profile)
  localStorage.setItem('vendor-onboarding-auth', JSON.stringify({ email: profile.email, vendor_id: profile.vendor_id, token: 't' }))
  await act(async () => {
    render(<MemoryRouter initialEntries={['/application-status']}><AppRoutes /><Where /></MemoryRouter>)
  })
}

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })

describe('Application status', () => {
  it('shows a returned application as Correction Required with the remarks and reopens the form', async () => {
    await renderWith(RETURNED)
    expect(screen.getByRole('heading', { name: 'Correction Required' })).toBeTruthy()
    const toFix = screen.getByRole('region', { name: 'What to correct' })
    expect(within(toFix).getByText('Please correct the PAN.')).toBeTruthy()
    expect(within(toFix).getByText('PAN')).toBeTruthy()
    expect(within(toFix).getByText(/Returned after our final review/)).toBeTruthy()
    expect(screen.getByText('Earlier corrections (1)')).toBeTruthy()
    expect(screen.getByText('Upload a clearer bank proof.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Request changes/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Correct and resubmit/ }))
    expect(screen.getByTestId('where').textContent).toBe('/request-vendor')
  })

  it('marks a resubmitted application in review with its round', async () => {
    await renderWith({ ...RETURNED, stage: 'maker_review', rejection: null })
    expect(screen.getByText('Resubmitted · round 2')).toBeTruthy()
    expect(screen.queryByText('Correction Required')).toBeNull()
    expect(screen.getByText('Earlier corrections (1)')).toBeTruthy()
  })
})
