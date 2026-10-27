import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { vendorRequestSchema } from '../schemas/vendorRequestSchema'
import { DEFAULT_COUNTRY_CODE } from '../data/countryCodes'
import { toFormValues } from '../api/vendorApi'
import { PAN_TAKEN_MESSAGE } from '../utils/constants'

const defaults = {
  vendorLegalName: '', vendorPhoneCode: DEFAULT_COUNTRY_CODE, vendorPhone: '', vendorEmail: '', vendorType: '', yearEstablished: '', currency: 'INR', registrationNumber: '', msmeStatus: 'Not registered', assignedRm: '', udyamNumber: '',
  registeredAddress1: '', registeredCity: '', registeredDistrict: '', registeredState: '', registeredPostalCode: '',
  pan: '', gstin: '', aadhaar: '', cin: '',
  dematId: '', dpId: '', boId: '', depository: '',
  accountHolderName: '', bankName: '', branchName: '', accountNumber: '', ifsc: '',
  accurateDeclaration: false, termsDeclaration: false,
}

// A PAN the server has said already belongs to another vendor. The duplicate check hook records it here, and the
// resolver below keeps reporting it as an error, so the message stays for as long as the taken value is in the field.
// (A plain manual error is wiped the moment the field is validated again - e.g. when you click out of it.)
const TAKEN_RULES = [
  ['pan', PAN_TAKEN_MESSAGE, (value) => String(value ?? '').trim().toUpperCase()],
]

// The onboarding form, started from what the vendor has already saved (their signup details, a saved draft, or the
// application that was returned to them).
export default function useVendorRequest(vendor) {
  const takenRef = useRef({ pan: '' })
  const schemaResolver = useRef(zodResolver(vendorRequestSchema)).current
  const initialValues = useRef({ ...defaults, ...toFormValues(vendor) }).current

  const resolver = async (values, context, options) => {
    const result = await schemaResolver(values, context, options)
    const errors = { ...(result.errors || {}) }
    let found = false
    TAKEN_RULES.forEach(([field, message, normalise]) => {
      const taken = takenRef.current[field]
      if (taken && normalise(values[field]) === normalise(taken)) {
        errors[field] = { type: 'duplicate', message: takenRef.current[`${field}Message`] || message }
        found = true
      }
    })
    return found ? { values: {}, errors } : result
  }

  const form = useForm({ resolver, defaultValues: initialValues, mode: 'onTouched', shouldUnregister: false })
  return { ...form, takenRef, initialValues }
}
