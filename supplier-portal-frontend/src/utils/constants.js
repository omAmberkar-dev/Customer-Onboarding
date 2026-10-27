// Shown when the PAN (which comes from the GSTIN, so it is read-only) already belongs to another vendor.
export const PAN_TAKEN_MESSAGE = 'A customer with this PAN is already registered. The PAN comes from your GSTIN, so please check the GSTIN you entered.'

export const FORM_STEPS = [
  { id: 1, title: 'Customer', longTitle: 'Customer Information' },
  { id: 2, title: 'Address', longTitle: 'Address Details' },
  { id: 3, title: 'Bank', longTitle: 'Bank Details' },
  { id: 4, title: 'Review', longTitle: 'Review and Submit' },
]

export const STEP_FIELDS = [
  ['gstin', 'vendorLegalName', 'pan', 'aadhaar', 'vendorPhone', 'vendorEmail', 'vendorType', 'yearEstablished', 'currency', 'registrationNumber', 'msmeStatus', 'assignedRm', 'udyamNumber', 'dematId', 'dpId', 'boId', 'depository'],
  ['registeredAddress1', 'registeredDistrict', 'registeredCity', 'registeredState', 'registeredPostalCode', 'cin'],
  ['accountHolderName', 'bankName', 'branchName', 'accountNumber', 'ifsc'],
]
