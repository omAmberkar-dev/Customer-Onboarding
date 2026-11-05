// Which tab an invoice belongs to and how its status reads to the vendor:
// The words follow the customer portal brief (Draft, Under review, Returned for correction, Approved, Rejected):
//   Returned for correction - sent back to the vendor to fix
//   Rejected          - turned down for good
//   Approved          - fully approved
//   Under review      - everything still in progress in the approval chain (an invoice a checker or authorizer sent back to the RM is
//                       the RM's to fix, so to the vendor it is simply still processing)
// A file that is just added but not yet uploaded ("Ready") or whose reading failed ("Failed") has no tab of its own: it shows in
// All Status, where it can be retried or removed.
export function statusDetails(invoice) {
  const status = String(invoice.extractionStatus ?? invoice.status ?? '').toLowerCase()
  if (status === 'returned to vendor') return { label: 'Returned for correction', tone: 'bg-[#fff0f1] text-[#bf4252]', filter: 'correction' }
  if (status === 'rejected') return { label: 'Rejected', tone: 'bg-red-50 text-red-700', filter: 'rejected' }
  if (status === 'approved') return { label: 'Approved', tone: 'bg-emerald-50 text-emerald-700', filter: 'approved' }
  if (status === 'failed') return { label: 'Failed', tone: 'bg-red-50 text-red-700', filter: 'failed' }
  if (invoice.source === 'local' || status === 'ready') return { label: 'Draft', tone: 'bg-[#eef2fb] text-[#0046dc]', filter: 'ready' }
  return { label: 'Under review', tone: 'bg-amber-50 text-amber-700', filter: 'processing' }
}

// Where an invoice is in its journey, as steps the vendor can follow: Submitted (uploaded and read), Verification (with the
// Relationship Manager: Pending Approval), Approval (with the checker or authorizer: Sent for Approval, Pending
// Authorization) and the outcome (Approved, or Rejected). Each step is done, current, upcoming or stopped, from
// invoices.status as the review app writes it; a status not listed is still in review, as statusDetails reads it.
// Returned for correction stops the journey at Verification until the vendor replaces the invoice.
const STEP_NAMES = [['submitted', 'Submitted'], ['verification', 'Verification'], ['approval', 'Approval'], ['outcome', 'Processed']]
export function invoiceProgress(invoice) {
  const status = String(invoice.extractionStatus ?? invoice.status ?? '').toLowerCase()
  const local = invoice.source === 'local' && status !== 'failed'
  // How far it got (index of the current step) and how that step reads when it is not simply in progress.
  let at = 1
  let stop = null
  if (status === 'failed') [at, stop] = [0, 'Could not be read']
  else if (local) at = 0
  else if (status === 'sent for approval' || status === 'pending authorization') at = 2
  else if (status === 'approved') at = 4
  else if (status === 'returned to vendor') [at, stop] = [1, 'Returned for correction']
  else if (status === 'rejected') [at, stop] = [3, 'Rejected']
  return STEP_NAMES.map(([key, text], i) => {
    if (i === 3 && status === 'approved') return { key, label: 'Approved', state: 'done' }
    if (i < at) return { key, label: text, state: 'done' }
    if (i === at) return { key, label: stop || text, state: stop ? 'stopped' : 'current' }
    return { key, label: text, state: 'upcoming' }
  })
}
