// Customer types (2026-10-28). A customer onboarded earlier may still hold an older type ("Private limited company");
// customerTypeOf maps it onto these two the way LAS does when it creates the SAP customer: only a proprietor is a person.
export const VENDOR_TYPES = ['Individual', 'Organization']

export const customerTypeOf = (vendorType) => {
  const type = String(vendorType ?? '').trim()
  if (!type || VENDOR_TYPES.includes(type)) return type
  return /individual|proprietor/i.test(type) ? 'Individual' : 'Organization'
}

// The CIN is asked for, and required, unless the customer is a registered MSME (who gives the Udyam number instead).
export const cinApplies = (msmeStatus) => msmeStatus !== 'Registered'
export const CIN_PATTERN = /^[A-Za-z0-9]{21}$/
