const DRAFT_KEY = 'vendor-onboarding-request-draft'
const SENSITIVE_KEYS = [
  'accountHolderName',
  'bankName',
  'branchName',
  'accountNumber',
  'ifsc',
]

export function saveDraft(values) {
  const safeValues = Object.fromEntries(Object.entries(values).filter(([key]) => !SENSITIVE_KEYS.includes(key)))
  localStorage.setItem(DRAFT_KEY, JSON.stringify(safeValues))
}

export function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null } catch { return null }
}

export function clearDraft() { localStorage.removeItem(DRAFT_KEY) }
