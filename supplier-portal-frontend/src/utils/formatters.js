// Aadhaar numbers are shown as three groups of four digits: "1234 5678 9012".
export const AADHAAR_LENGTH = 12
export const aadhaarDigits = (value = '') => String(value).replace(/\D/g, '').slice(0, AADHAAR_LENGTH)
export const formatAadhaar = (value = '') => aadhaarDigits(value).replace(/(\d{4})(?=\d)/g, '$1 ')

// Re-formats a text input in place as the user types and keeps the caret next to the digit it was after
// (assigning .value would otherwise throw it to the end). Returns the formatted text.
export function maskAadhaarInput(input) {
  const caret = input.selectionStart ?? input.value.length
  const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, '').length
  input.value = formatAadhaar(input.value)

  let position = 0
  let seen = 0
  while (position < input.value.length && seen < digitsBeforeCaret) {
    if (/\d/.test(input.value[position])) seen += 1
    position += 1
  }
  input.setSelectionRange(position, position)
  return input.value
}

export const maskAccountNumber =(value = '') => value ? `•••• •••• ${value.slice(-4)}` : '—'
export const maskAadhaar = (value = '') => (aadhaarDigits(value) ? `XXXX XXXX ${aadhaarDigits(value).slice(-4)}` : '—')
export const displayValue = (value) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value || '—'
}

export const formatFileSize = (bytes) => {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${unitIndex === 0 ? size : size.toFixed(1)} ${units[unitIndex]}`
}
