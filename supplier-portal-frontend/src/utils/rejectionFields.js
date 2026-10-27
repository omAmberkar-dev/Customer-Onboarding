import { STEP_FIELDS } from './constants'

// The maker/checker flags fields by the backend's column names (pan, ifsc_code, ...) and supporting documents as
// doc_<type>. The form uses its own camelCase names, so this maps one to the other.
export const FORM_FIELD_BY_KEY = {
  vendor_legal_name: 'vendorLegalName',
  contact_no: 'vendorPhone',
  vendor_type: 'vendorType',
  year_established: 'yearEstablished',
  currency: 'currency',
  registration_number: 'registrationNumber',
  msme_status: 'msmeStatus',
  udyam_number: 'udyamNumber',
  assigned_rm: 'assignedRm',
  gstin: 'gstin',
  pan: 'pan',
  aadhaar_no: 'aadhaar',
  cin: 'cin',
  demat_id: 'dematId',
  dp_id: 'dpId',
  bo_id: 'boId',
  depository: 'depository',
  street: 'registeredAddress1',
  city: 'registeredCity',
  district: 'registeredDistrict',
  region: 'registeredState',
  postal_code: 'registeredPostalCode',
  account_holder_name: 'accountHolderName',
  bank_name: 'bankName',
  branch_name: 'branchName',
  bank_account_no: 'accountNumber',
  ifsc_code: 'ifsc',
}

export const DOCUMENT_STEP = 3
export const isDocumentKey = (key) => typeof key === 'string' && key.startsWith('doc_')
export const documentTypeOf = (key) => key.slice(4)

// Which form step a flagged form field (or document) sits on.
export function stepOfFlag(name, isDocument) {
  if (isDocument) return DOCUMENT_STEP
  const index = STEP_FIELDS.findIndex((fields) => fields.includes(name))
  return index === -1 ? 1 : index + 1
}

// Turns the open return into what the form needs: { fields, documents }, each { [formFieldName | documentType]: flag }
// where a flag is { label, reasons: [{ label, remark }] }. Several reasons on one field merge into one flag.
export function buildFlags(rejection) {
  const fields = {}
  const documents = {}
  for (const item of rejection?.items || []) {
    const document = isDocumentKey(item.field_key)
    const key = document ? documentTypeOf(item.field_key) : FORM_FIELD_BY_KEY[item.field_key]
    if (!key) continue // a general ("Other") reason has no field to highlight
    const target = document ? documents : fields
    // `fixed` is the server's record that the vendor already dealt with every reason on this field (saved earlier).
    const entry = (target[key] ||= { label: item.field_label, reasons: [], fixed: true })
    entry.fixed = entry.fixed && Boolean(item.fixed)
    entry.reasons.push({ label: item.reason_label, remark: item.remark || '' })
  }
  return { fields, documents }
}

// The backend key to tell the server about when the vendor confirms a flagged form field is right as entered.
export const KEY_BY_FORM_FIELD = Object.fromEntries(Object.entries(FORM_FIELD_BY_KEY).map(([key, name]) => [name, key]))
