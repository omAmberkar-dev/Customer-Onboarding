import { joinPhone, splitPhone } from '../data/countryCodes'
import { aadhaarDigits, formatAadhaar } from '../utils/formatters'
import { dematText } from '../utils/demat'
import { customerTypeOf } from '../data/vendorTypes'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
// Deployed shared-services API (GSTIN verification, invoice preview links; email and OCR are called by the backend).
const SHARED_SERVICES_URL = (import.meta.env.VITE_SHARED_SERVICES_URL || 'https://fs-quad-shared.azurewebsites.net').replace(/\/+$/, '')

const AUTH_KEY = 'vendor-onboarding-auth'
// Fired when the server says the session is no longer valid, so the app can sign the vendor out.
export const AUTH_EXPIRED_EVENT = 'vendor-auth-expired'

function sessionToken() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY))?.token || '' } catch { return '' }
}

// fetch() against our backend with the vendor's session token attached.
async function authFetch(path, options = {}) {
  const token = sessionToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (response.status === 401 && token) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  return response
}

const jsonRequest = (method, payload) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

const GST_VERIFY_API_URL = `${SHARED_SERVICES_URL}/api/verify`
const INVOICE_PREVIEW_API_URL = `${SHARED_SERVICES_URL}/api/invoice/preview-url`

// Legacy GSTIN lookup straight against the shared service. Only used when VITE_VERIFICATION_MODE=legacy; otherwise
// verifyIdentity() below is used.
export async function verifyGstin(gstin) {
  const params = new URLSearchParams({ gstin })
  const response = await fetch(`${GST_VERIFY_API_URL}?${params}`)
  const body = await response.json().catch(() => null)

  if (!response.ok || !body?.success || !body?.valid || !body?.data) {
    throw new Error(body?.message || body?.error || 'GSTIN could not be verified.')
  }

  return body
}

// Verifies a PAN, GSTIN, Aadhaar number or Demat ID through our backend (service is 'PAN', 'GSTIN', 'AADHAAR' or 'DEMAT'). `context` is the
// other tax ids in the form ({ pan, gstin }) so the backend can check the PAN belongs to the GSTIN. Resolves to
// { verified, message, fill?, pan_verified? }; a verification that is down or times out rejects, which blocks the form.
export async function verifyIdentity(service, value, context = {}) {
  let response
  try {
    response = await authFetch(`/vendors/verify/${service.toLowerCase()}`, jsonRequest('POST', { value, ...context }))
  } catch {
    throw new Error('Verification is unavailable right now. Please try again shortly.')
  }
  const body = await response.json().catch(() => null)
  if (response.status === 400 || response.status === 503) throw new Error(body?.message || body?.error || 'Verification is unavailable right now. Please try again shortly.')
  if (!response.ok || typeof body?.verified !== 'boolean') throw new Error(body?.error || 'Verification is unavailable right now. Please try again shortly.')
  return body
}

// "Request changes" while the application is under review: the fields a vendor can ask to change ([{ field_key,
// field_label, section }]), sending the request (which tells the maker or checker), and withdrawing it again.
async function changeRequestCall(path, options, fallback) {
  const response = await authFetch(`/vendors/me/change-request${path}`, options)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || fallback)
  return body
}

export async function getChangeRequestFields() {
  const body = await changeRequestCall('/fields', undefined, 'Unable to load the fields you can change.')
  return Array.isArray(body?.fields) ? body.fields : []
}

export const requestChanges = (fields) => changeRequestCall('', jsonRequest('POST', { fields }), 'Unable to send your request. Please try again.')

export const cancelChangeRequest = () => changeRequestCall('/cancel', { method: 'POST' }, 'Unable to cancel your request. Please try again.')

// Public India Post directory. Only the 6-digit PIN code is sent. A PIN code resolves to one district, which
// is used for both City and District / County (the directory has no separate city), and both stay editable.
const PINCODE_API_URL = 'https://api.postalpincode.in/pincode'
const pincodeCache = new Map()

// Resolves to { city, district }, or null when the PIN code is not in the directory. Throws if the lookup
// itself fails (offline, timeout), so the caller can tell "unknown PIN" from "could not check".
export async function lookupPincode(pincode) {
  if (pincodeCache.has(pincode)) return pincodeCache.get(pincode)

  const response = await fetch(`${PINCODE_API_URL}/${pincode}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('PIN code lookup failed.')
  const body = await response.json().catch(() => null)
  const entry = Array.isArray(body) ? body[0] : null
  if (!entry) throw new Error('PIN code lookup failed.')

  const district = entry.Status === 'Success' ? String(entry.PostOffice?.find((office) => office?.District)?.District || '').trim() : ''
  const result = district ? { city: district, district } : null
  pincodeCache.set(pincode, result)
  return result
}

// documents is { [typeKey]: File[] }; each type goes up under its own form field name.
// `append` adds to what is uploaded for a type that takes several files; by default a type's new files replace its earlier ones.
export async function uploadVendorDocuments(vendorId, documents, { append = false } = {}) {
  const formData = new FormData()
  Object.entries(documents).forEach(([type, files]) => files.forEach((file) => formData.append(type, file)))

  const response = await authFetch(`/vendors/${vendorId}/documents${append ? '?append=1' : ''}`, { method: 'POST', body: formData })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to upload the supporting documents.')
  return body
}

// The uploaded documents grouped by type: { pan: [{ original_name, size, blob_name }], ... }.
function groupDocuments(body) {
  const grouped = {}
  for (const document of body?.documents || []) {
    if (document.type) (grouped[document.type] ||= []).push(document)
  }
  return grouped
}

// What has already been uploaded for the application, grouped by document type.
export async function getMyDocuments() {
  const response = await authFetch('/vendors/me/documents')
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to load your documents.')
  return groupDocuments(body)
}

// The bytes of one uploaded document for the preview. Fetched with the token and shown through a blob: URL, so no token is put in a URL.
export async function fetchMyDocumentBlob(blobName) {
  let response
  try {
    response = await authFetch(`/vendors/me/documents/content?${new URLSearchParams({ blob_name: blobName })}`)
  } catch {
    throw new Error('Unable to load the document. Please check your connection and try again.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Unable to load the document right now.')
  }
  return response.blob()
}

// Removes one uploaded document (`blobName` is the file's identifier from the listing); resolves to the documents that are left.
export async function deleteMyDocument(docType, blobName) {
  const response = await authFetch('/vendors/me/documents', jsonRequest('DELETE', { doc_type: docType, blob_name: blobName }))
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to remove the document. Please try again.')
  return groupDocuments(body)
}

export async function loginVendor(email, password) {
  const response = await fetch(`${API_BASE_URL}/vendors/login`, jsonRequest('POST', { email, password }))

  const body = await response.json().catch(() => null)

  if (response.status !== 200) {
    const error = new Error(
      response.status === 401
        ? 'Invalid email or password.'
        : response.status === 429
          ? 'Too many failed attempts. Please wait a few minutes and try again.'
          : body?.error || body?.message || 'Unable to sign in. Please try again.',
    )
    error.status = response.status
    error.code = body?.code
    error.body = body
    throw error
  }

  const session = body?.data ?? body

  if (!session?.vendor_id || !session?.token) {
    const error = new Error('The login response did not include a session.')
    error.status = 502
    throw error
  }

  return session
}

// The signed-in vendor's own record, with their lifecycle `stage` and, if the application was returned, the
// open `rejection` (reasons and flagged fields).
export async function getVendorProfile() {
  const response = await authFetch('/vendors/me')
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error || 'Unable to load customer details.')
  }

  return body
}

// Signup: a verified email and a phone number. The backend emails the login credentials.
export async function signupVendor({ email, phone, verificationId, phoneVerificationId }) {
  const response = await fetch(`${API_BASE_URL}/vendors/signup`, jsonRequest('POST', {
    email: email.trim().toLowerCase(),
    contact_no: phone,
    verification_id: verificationId,
    phone_verification_id: phoneVerificationId,
  }))
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(body?.error || 'Unable to create your account. Please try again.')
    error.status = response.status
    error.code = body?.code
    throw error
  }
  return body
}

// Saves the onboarding form as it stands (partial is fine). Resolves to the vendor's refreshed record.
export async function saveOnboardingDraft(formData) {
  const response = await authFetch('/vendors/me/draft', jsonRequest('PUT', toVendorPayload(formData)))
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to save your progress.')
  return body
}

// Submits (or resubmits) the application for review. `confirmedFields` are flagged fields the vendor checked
// and kept as they were.
export async function submitOnboarding(formData, confirmedFields = []) {
  const response = await authFetch('/vendors/me/submit', jsonRequest('POST', {
    details: toVendorPayload(formData),
    confirmed_fields: confirmedFields,
  }))
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Failed to submit your application. Please try again.')
  return body
}

// Fired after a request is sent so any open Change Requests screen refreshes immediately.
export const UPDATE_REQUESTS_CHANGED_EVENT = 'update-requests-changed'

export async function createUpdateRequest(vendorId, details) {
  const response = await authFetch('/vendors/update-requests', jsonRequest('POST', { vendor_id: vendorId, details }))
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error || 'Unable to send the update request.')
  }

  window.dispatchEvent(new Event(UPDATE_REQUESTS_CHANGED_EVENT))
  return body
}

export async function getUpdateRequests(vendorId) {
  const params = new URLSearchParams({ vendor_id: String(vendorId) })
  const response = await authFetch(`/vendors/update-requests?${params}`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error || 'Unable to load update requests.')
  }

  return Array.isArray(body) ? body : []
}

export async function getVendorInvoices(vendorId) {
  const params = new URLSearchParams({ vendor_id: String(vendorId) })
  const response = await authFetch(`/invoices?${params}`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error || body?.message || 'Unable to load uploaded invoices.')
  }

  const invoices = Array.isArray(body) ? body : body?.invoices ?? body?.data
  return Array.isArray(invoices) ? invoices : []
}

// The earlier versions of a replaced invoice: { current_version, versions: [...], earlier_versions_not_kept }.
async function invoiceVersionCall(path, fallback) {
  let response
  try {
    response = await authFetch(path)
  } catch {
    throw new Error(fallback)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || fallback)
  return body
}

export const getInvoiceVersions = (invoiceId) => invoiceVersionCall(`/invoices/${invoiceId}/versions`, 'Unable to load the earlier versions.')
// One earlier version, shaped like an invoice from getVendorInvoices.
export const getInvoiceVersion = (invoiceId, versionNo) => invoiceVersionCall(`/invoices/${invoiceId}/versions/${versionNo}`, 'Unable to open this version.')
// Where that version's original file is kept ({ blob_url, ... }); open it with getInvoicePreviewUrl like the current file.
export const getInvoiceVersionFile = (invoiceId, versionNo) => invoiceVersionCall(`/invoices/${invoiceId}/versions/${versionNo}/file`, 'The original file of this version is not available.')

export async function getInvoicePreviewUrl(blobUrl) {
  if (!blobUrl) throw new Error('This invoice does not include a blob URL.')

  const params = new URLSearchParams({ blob_name: blobUrl })
  const response = await fetch(`${INVOICE_PREVIEW_API_URL}?${params}`)
  const rawBody = await response.text()
  let body = null
  try { body = rawBody ? JSON.parse(rawBody) : null } catch { body = rawBody }

  if (!response.ok) {
    throw new Error(body?.error || body?.message || 'Unable to generate the invoice preview.')
  }

  const previewUrl = typeof body === 'string'
    ? body
    : body?.preview_url || body?.previewUrl || body?.url || body?.sas_url
      || body?.data?.preview_url || body?.data?.previewUrl || body?.data?.url || body?.data?.sas_url

  if (!previewUrl) throw new Error('The preview service did not return a document URL.')
  return previewUrl
}

export async function extractInvoice(vendorId, file) {
  const formData = new FormData()
  formData.append('vendor_id', String(vendorId))
  formData.append('invoices', file)

  const response = await authFetch('/invoices/ocr', {
    method: 'POST',
    body: formData,
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error || body?.message || 'Unable to extract the invoice.')
  }

  return body
}

// Why a returned invoice needs correcting (or why a rejected one was rejected); null when there is nothing to show.
export async function getInvoiceReturnReasons(invoiceId) {
  const response = await authFetch(`/invoices/${invoiceId}/return-reasons`)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || body?.message || 'Unable to load the correction details.')
  return body
}

// Reads a new file for a returned invoice and gives back its details (nothing is saved), so they can be compared with the
// invoice being replaced before it is overwritten. Resolves to an invoice-shaped object.
export async function previewInvoiceReplacement(invoiceId, file) {
  const formData = new FormData()
  formData.append('invoices', file)
  const response = await authFetch(`/invoices/${invoiceId}/replace-preview`, { method: 'POST', body: formData })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.invoice) throw new Error(body?.error || body?.message || 'The new file could not be read.')
  return body.invoice
}

// Uploads the corrected file for a returned invoice; the same invoice is overwritten and goes back for approval.
export async function replaceInvoice(invoiceId, file) {
  const formData = new FormData()
  formData.append('invoices', file)
  const response = await authFetch(`/invoices/${invoiceId}/replace`, { method: 'POST', body: formData })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || body?.message || 'Unable to replace the invoice.')
  return body
}

// Maps the react-hook-form field names (camelCase) to the backend's
// vendor table column names (snake_case). The email is fixed at signup, so it is not sent.
function toVendorPayload(data) {
  return {
    vendor_legal_name: data.vendorLegalName,
    contact_no: joinPhone(data.vendorPhoneCode, data.vendorPhone),
    vendor_type: data.vendorType,
    year_established: data.yearEstablished || null,
    currency: data.currency,
    registration_number: data.registrationNumber,
    msme_status: data.msmeStatus,
    udyam_number: data.udyamNumber || null,
    assigned_rm: data.assignedRm || null,
    gstin: data.gstin || null,
    pan: data.pan,
    aadhaar_no: aadhaarDigits(data.aadhaar) || null,
    cin: data.cin || null,
    demat_id: dematText(data.dematId) || null,
    dp_id: dematText(data.dpId) || null,
    bo_id: dematText(data.boId) || null,
    depository: data.depository || null,
    street: data.registeredAddress1,
    city: data.registeredCity,
    district: data.registeredDistrict,
    region: data.registeredState,
    postal_code: data.registeredPostalCode,
    account_holder_name: data.accountHolderName,
    bank_name: data.bankName,
    branch_name: data.branchName,
    bank_account_no: data.accountNumber,
    ifsc_code: data.ifsc,
  }
}

// The inverse of toVendorPayload: the vendor's stored record as the form's (camelCase) values.
export function toFormValues(vendor) {
  const { code, number } = splitPhone(vendor.contact_no)
  const text = (value) => (value == null ? '' : String(value))
  return {
    vendorEmail: text(vendor.email),
    vendorPhoneCode: code,
    vendorPhone: number,
    vendorLegalName: text(vendor.vendor_legal_name),
    vendorType: customerTypeOf(vendor.vendor_type),
    yearEstablished: text(vendor.year_established),
    currency: text(vendor.currency) || 'INR',
    registrationNumber: text(vendor.registration_number),
    msmeStatus: text(vendor.msme_status) || 'Not registered',
    udyamNumber: text(vendor.udyam_number),
    assignedRm: text(vendor.assigned_rm),
    gstin: text(vendor.gstin),
    pan: text(vendor.pan),
    aadhaar: formatAadhaar(text(vendor.aadhaar_no)),
    cin: text(vendor.cin),
    dematId: text(vendor.demat_id),
    dpId: text(vendor.dp_id),
    boId: text(vendor.bo_id),
    depository: text(vendor.depository),
    registeredAddress1: text(vendor.street),
    registeredCity: text(vendor.city),
    registeredDistrict: text(vendor.district),
    registeredState: text(vendor.region),
    registeredPostalCode: text(vendor.postal_code),
    accountHolderName: text(vendor.account_holder_name),
    bankName: text(vendor.bank_name),
    branchName: text(vendor.branch_name),
    accountNumber: text(vendor.bank_account_no),
    ifsc: text(vendor.ifsc_code),
  }
}

async function checkExists(path, payload, errorMessage) {
  const response = await authFetch(`/vendors/${path}`, jsonRequest('POST', payload))

  if (!response.ok) {
    throw new Error(errorMessage)
  }

  const body = await response.json().catch(() => null)
  return Boolean(body?.exists)
}

export async function checkEmailExists(email) {
  return checkExists('check-email', { email: email.trim().toLowerCase() }, 'Failed to verify email address')
}

export async function checkPanExists(pan) {
  return checkExists('check-pan', { pan: pan.trim().toUpperCase() }, 'Failed to verify PAN')
}

// Email verification goes through our backend, which relays to the shared service; phone verification is run by
// our backend itself (the code goes out over WhatsApp). Failures carry `status`, `body` (the JSON answer) and, for
// a 429, `retryAfter` seconds.
async function emailVerificationRequest(path, options, fallbackMessage, kind = 'email-verification') {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/vendors/${kind}${path}`, options)
  } catch {
    throw new Error(fallbackMessage)
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || fallbackMessage)
    error.status = response.status
    error.body = body
    error.retryAfter = Number(body?.retry_after ?? response.headers.get('Retry-After')) || 0
    throw error
  }
  return body
}

const jsonPost = (payload) => jsonRequest('POST', payload)

export function sendEmailVerification(email, recipientName) {
  return emailVerificationRequest('/send', jsonPost({ email: email.trim().toLowerCase(), recipient_name: recipientName || undefined }), 'Unable to send the verification email. Please try again.')
}

export function verifyEmailOtp(verificationId, otp) {
  return emailVerificationRequest('/verify-otp', jsonPost({ verification_id: verificationId, otp }), 'Unable to verify the code. Please try again.')
}

export function getEmailVerificationStatus(verificationId) {
  return emailVerificationRequest(`/${encodeURIComponent(verificationId)}/status`, undefined, 'Unable to check the verification status.')
}

// `phone` is the full number with its country code, e.g. "+919998832823".
export function sendPhoneVerification(phone) {
  return emailVerificationRequest('/send', jsonPost({ phone }), 'Unable to send the verification code. Please try again.', 'phone-verification')
}

export function verifyPhoneOtp(verificationId, otp) {
  return emailVerificationRequest('/verify-otp', jsonPost({ verification_id: verificationId, otp }), 'Unable to verify the code. Please try again.', 'phone-verification')
}

// ---- Vendor agreement signing -------------------------------------------------------------------------------------
// Every failure throws Error(body.error) with `status`, `body` and, for a 429, `retryAfter` seconds.
async function agreementError(response, fallback) {
  const body = await response.json().catch(() => null)
  const error = new Error(body?.error || body?.message || fallback)
  error.status = response.status
  error.body = body
  error.retryAfter = Number(body?.retry_after ?? response.headers.get('Retry-After')) || 0
  return error
}

async function agreementCall(path, options, fallback) {
  let response
  try {
    response = await authFetch(path, options)
  } catch {
    throw new Error(fallback)
  }
  if (!response.ok) throw await agreementError(response, fallback)
  return response.json().catch(() => ({}))
}

// The vendor's agreements (sent and signed only), newest first.
export async function getMyAgreements() {
  const body = await agreementCall('/vendors/me/agreements', undefined, 'Unable to load your agreements.')
  return Array.isArray(body) ? body : []
}

async function agreementPdfBlob(id, download) {
  let response
  try {
    response = await authFetch(`/vendors/me/agreements/${id}/pdf${download ? '?download=1' : ''}`)
  } catch {
    throw new Error('Unable to load the agreement. Please try again.')
  }
  if (!response.ok) throw await agreementError(response, 'Unable to load the agreement. Please try again.')
  return response.blob()
}

// A blob: URL for the PDF (the caller revokes it with URL.revokeObjectURL when done).
export async function fetchAgreementPdfUrl(id) {
  const blob = await agreementPdfBlob(id, false)
  return URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
}

// Saves a PDF Blob under `fileName` through a temporary link.
function savePdf(blob, fileName) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export async function downloadAgreement(id, agreementNo) {
  savePdf(await agreementPdfBlob(id, true), `${agreementNo || `agreement-${id}`}.pdf`)
}

// The agreement as it will look once signed, built from what is filled in so far (nothing is saved). `final` adds the
// certificate page. Returns the PDF as a Blob.
export async function previewSignedAgreement(id, payload) {
  let response
  try {
    response = await authFetch(`/vendors/me/agreements/${id}/preview`, jsonRequest('POST', payload))
  } catch {
    throw new Error('Unable to load the preview. Please try again.')
  }
  if (!response.ok) throw await agreementError(response, 'Unable to load the preview. Please try again.')
  return response.blob()
}

export const sendAgreementCode =(id) => agreementCall(`/vendors/me/agreements/${id}/send-code`, { method: 'POST' }, 'Unable to send the code. Please try again.')

// Whether the emailed code was confirmed - by typing it, or by opening the link in the same email. Polled while the code is pending.
export const getAgreementCodeStatus = (id) => agreementCall(`/vendors/me/agreements/${id}/code-status`, undefined, 'Unable to check the verification status.')

export const verifyAgreementCode = (id, otp) => agreementCall(`/vendors/me/agreements/${id}/verify-code`, jsonRequest('POST', { otp }), 'Unable to verify the code. Please try again.')

export const signAgreement = (id, payload) => agreementCall(`/vendors/me/agreements/${id}/sign`, jsonRequest('POST', payload), 'Unable to sign the agreement. Please try again.')

// `fields` (the details to change) goes with atStep 'review': that is a change request for the checker, not a plain decline.
export const declineAgreement = (id, reason, atStep = 'sign', fields = undefined) => agreementCall(`/vendors/me/agreements/${id}/decline`, jsonRequest('POST', { reason, at_step: atStep, ...(fields ? { fields } : {}) }), 'Unable to send your response. Please try again.')

export const changePassword = (currentPassword, newPassword) => agreementCall('/vendors/me/password', jsonRequest('POST', { current_password: currentPassword, new_password: newPassword }), 'Unable to change your password. Please try again.')

// Public (no login): is this agreement number and fingerprint a genuine signed agreement?
export async function verifyAgreementPublic(no, h) {
  const params = new URLSearchParams({ no: no || '', h: h || '' })
  let response
  try {
    response = await fetch(`${API_BASE_URL}/agreements/verify?${params}`)
  } catch {
    throw new Error('Unable to reach the verification service. Please try again.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.error || 'Unable to verify the agreement. Please try again.')
    error.status = response.status
    error.body = body
    throw error
  }
  return body || { valid: false }
}

// Renewal request (an ending or ended agreement): the window and any open request / last outcome, asking, and cancelling.
export const getRenewal = () => agreementCall('/vendors/me/renewal', undefined, 'Unable to load your renewal details.')
export const requestRenewal = (payload) => agreementCall('/vendors/me/renewal-request', jsonRequest('POST', payload), 'Unable to send your request. Please try again.')
export const cancelRenewal = () => agreementCall('/vendors/me/renewal-request', { method: 'DELETE' }, 'Unable to cancel your request. Please try again.')

// The agreement PDF as a Blob (the reading view makes its own blob: URL and reads the page count from it).
export const fetchAgreementPdfBlob = (id) => agreementPdfBlob(id, false)

// ---- My loans -------------------------------------------------------------------------------------------------------
// The customer's loan journey as LAS carries it out (the backend reads it from LAS): steps, sanctions, drawdowns and
// invoices. Before onboarding is approved it is an empty journey ({ onboarded: false }).
export const getMyLoans = () => agreementCall('/vendors/me/loans', undefined, 'Unable to load your loans. Please try again.')

// Home: the customer's invoice, agreement and change-request summary. A section the backend could not read is null and
// named in `unavailable` (not a zero).
export const getMyHome = () => agreementCall('/vendors/me/home', undefined, 'Unable to load your summary. Please try again.')

// Sends a message to the support team through the backend's email service: { topic, reference, message } ->
// { sent, request_id, submitted_at }. Throws the backend's own reason (with `status`, and `body.fields` for invalid input).
export const sendSupportRequest = (payload) =>
  agreementCall('/vendors/me/support-request', jsonRequest('POST', payload), 'Your message could not be sent. Please try again.')

// The customer's own recent events, newest first: { events: [{ at, category, title, reference }], unavailable }.
export const getMyActivity = (limit = 50) =>
  agreementCall(`/vendors/me/activity?limit=${encodeURIComponent(limit)}`, undefined, 'Unable to load your recent activity. Please try again.')

// A Sanction Memo, Drawdown Memo or invoice PDF (kind 'sanction', 'drawdown' or 'invoice') as a Blob.
async function loanDocumentBlob(kind, id) {
  let response
  try {
    response = await authFetch(`/vendors/me/loans/documents/${kind}/${encodeURIComponent(id)}`)
  } catch {
    throw new Error('Unable to load the document. Please try again.')
  }
  if (!response.ok) throw await agreementError(response, 'Unable to load the document. Please try again.')
  return response.blob()
}

// A blob: URL for the document (the caller revokes it with URL.revokeObjectURL when done).
export async function fetchLoanDocumentUrl(kind, id) {
  const blob = await loanDocumentBlob(kind, id)
  return URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
}

export async function downloadLoanDocument(kind, id, fileName) {
  savePdf(await loanDocumentBlob(kind, id), fileName)
}

// ---- Money with LAS -------------------------------------------------------------------------------------------------
// The customer's facilities, drawdowns, dues, payments and transactions as LAS records them (the backend reads them from
// LAS's customer finance API): { onboarded, facilities, drawdowns, schedule, payments, transactions, summary, available }.
// A section LAS could not read is null and false in `available` (never zeros).
export const getMyFinance = () => agreementCall('/vendors/me/finance', undefined, 'Unable to load your loan figures. Please try again.')

// A statement of one section ('transactions', 'schedule' or 'payments') as 'pdf' or 'xlsx', with the screen's filters
// ({ from, to, disbursement, type, status }); saved under the name the backend gives it.
export async function downloadStatement(section, format, filters = {}) {
  const query = new URLSearchParams({ section, format })
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
  let response
  try {
    response = await authFetch(`/vendors/me/finance/statement?${query}`)
  } catch {
    throw new Error('Unable to download the statement. Please try again.')
  }
  if (!response.ok) throw await agreementError(response, 'Unable to download the statement. Please try again.')
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || `${section}-statement.${format}`
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// The header bell: { items: [{ id, kind, tone, title, detail, on, to, read }], unread, readState, unavailable }.
export const getMyNotifications = () => agreementCall('/vendors/me/notifications', undefined, 'Unable to load your notifications.')
// Marks bell items read: ids, or every current item when ids is 'all'.
export const markNotificationsRead = (ids) =>
  agreementCall('/vendors/me/notifications/read', jsonRequest('POST', ids === 'all' ? { all: true } : { ids }), 'Unable to update your notifications.')
