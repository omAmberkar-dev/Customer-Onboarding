// Supporting documents a vendor can attach to an onboarding request. `key` is what the backend expects
// (DOCUMENT_TYPES in app.py); `max` is how many files the slot takes. Every document is optional.
export const documentTypes = [
  { key: 'pan', label: 'PAN card', max: 1 },
  { key: 'aadhaar', label: 'Aadhaar card', max: 1 },
  { key: 'gstin', label: 'GST registration certificate', max: 1 },
  { key: 'bank', label: 'Bank account proof', hint: 'Cancelled cheque or bank statement', max: 1 },
  { key: 'cin', label: 'CIN / certificate of incorporation', max: 1 },
  { key: 'other', label: 'Other supporting documents', hint: 'Up to 3 files', max: 3 },
]

export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png'
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
export const DOCUMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']

// Returns a message when the file cannot be attached, otherwise ''.
export function documentProblem(file) {
  const name = file.name.toLowerCase()
  if (!DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension))) return `${file.name}: only PDF, JPG or PNG files are accepted.`
  if (file.size > DOCUMENT_MAX_BYTES) return `${file.name}: each file must be 5 MB or smaller.`
  if (file.size === 0) return `${file.name}: the file is empty.`
  return ''
}
