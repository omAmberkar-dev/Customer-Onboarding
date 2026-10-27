import { BadgeCheck, Building2, Landmark, MapPin } from 'lucide-react'
import { currencies, indianStates } from '../../data/mockData'
import { normalizePhone } from '../../data/countryCodes'
import { aadhaarDigits, formatAadhaar } from '../../utils/formatters'

// The vendor profile's fields, shared by the read-only profile panel and the Edit details popup.
// Each field is [key, label, input type, options (for selects)].

export const VENDOR_TYPES = ['Individual', 'Proprietorship', 'Partnership', 'Private limited company', 'Public limited company', 'Government entity', 'Other']
export const MSME_STATUSES = ['Registered', 'Not registered', 'Not applicable']

export const sections = [
  {
    title: 'Company details',
    icon: Building2,
    fields: [
      ['vendor_legal_name', 'Customer legal name'],
      ['email', 'Email address', 'email'],
      ['contact_no', 'Phone number', 'tel'],
      ['vendor_type', 'Customer type', 'select', VENDOR_TYPES],
      ['year_established', 'Year established'],
      ['currency', 'Transaction currency', 'select', currencies],
      ['registration_number', 'Company registration number'],
      ['msme_status', 'MSME status', 'select', MSME_STATUSES],
      ['udyam_number', 'MSME / Udyam number'],
    ],
  },
  {
    title: 'Tax & compliance',
    icon: BadgeCheck,
    fields: [
      ['gstin', 'GSTIN'],
      ['pan', 'PAN'],
      ['aadhaar_no', 'Aadhaar number'],
      ['cin', 'CIN'],
    ],
  },
  {
    title: 'Registered address',
    icon: MapPin,
    fields: [
      ['street', 'Address line 1'],
      ['city', 'City'],
      ['district', 'District / County'],
      ['region', 'State', 'select', indianStates],
      ['postal_code', 'Postal / PIN code'],
    ],
  },
  {
    title: 'Bank details',
    icon: Landmark,
    fields: [
      ['account_holder_name', 'Account holder name'],
      ['bank_name', 'Bank name'],
      ['branch_name', 'Branch name'],
      ['bank_account_no', 'Account number'],
      ['ifsc_code', 'IFSC code'],
    ],
  },
]

export const editableKeys = sections.flatMap((section) => section.fields.map(([key]) => key))

export const requiredKeys = new Set([
  'vendor_legal_name', 'email', 'contact_no', 'gstin', 'pan', 'vendor_type', 'currency', 'registration_number', 'msme_status',
  'street', 'city', 'district', 'region', 'postal_code',
  'account_holder_name', 'bank_name', 'branch_name', 'bank_account_no', 'ifsc_code',
])

// Filled in from the GSTIN / PAN registration (and email, the login name), so they can't be edited.
// A detail that was never captured stays editable, otherwise it could never be completed.
export const LOCKED_KEYS = new Set(['gstin', 'pan', 'vendor_legal_name', 'street', 'region', 'postal_code', 'email'])

export const isRegisteredMsme = (data) => data?.msme_status === 'Registered'

// Phone and Aadhaar are compared in their canonical form (+919998832823 / 999988887777), so a number stored the
// older way - without the country code, or with spaces - is not reported as changed just because it is shown tidied.
const comparable = { contact_no: normalizePhone, aadhaar_no: aadhaarDigits }
export const sameValue = (a, b, key) => {
  const normalise = comparable[key] || ((value) => String(value ?? '').trim())
  return normalise(a) === normalise(b)
}

// What the vendor sees: Aadhaar in groups of four, phone with its country code.
export const displayProfileValue = (key, value) => {
  if (key === 'aadhaar_no') return formatAadhaar(value)
  if (key === 'contact_no') return normalizePhone(value)
  return value ?? ''
}

export const toDraft = (profile) => Object.fromEntries(editableKeys.map((key) => [key, displayProfileValue(key, profile?.[key])]))

// The request sent for approval. Phone is "+<code><number>" and Aadhaar is digits only; a value the vendor did
// not touch goes back exactly as stored so it is not reported as a change.
export const toUpdatePayload = (draft, profile) => ({
  ...draft,
  contact_no: sameValue(draft.contact_no, profile?.contact_no, 'contact_no') ? (profile?.contact_no ?? '') : draft.contact_no,
  aadhaar_no: sameValue(draft.aadhaar_no, profile?.aadhaar_no, 'aadhaar_no') ? (profile?.aadhaar_no ?? '') : aadhaarDigits(draft.aadhaar_no),
})
