// Which tab an invoice belongs to and how its status reads to the vendor:
//   Needs correction  - sent back to the vendor to fix
//   Rejected          - turned down for good
//   Approved          - fully approved
//   Processing        - everything still in progress in the approval chain (an invoice a checker or authorizer sent back to the RM is
//                       the RM's to fix, so to the vendor it is simply still processing)
// A file that is just added but not yet uploaded ("Ready") or whose reading failed ("Failed") has no tab of its own: it shows in
// All Status, where it can be retried or removed.
export function statusDetails(invoice) {
  const status = String(invoice.extractionStatus ?? invoice.status ?? '').toLowerCase()
  if (status === 'returned to vendor') return { label: 'Needs correction', tone: 'bg-[#fff0f1] text-[#bf4252]', filter: 'correction' }
  if (status === 'rejected') return { label: 'Rejected', tone: 'bg-red-50 text-red-700', filter: 'rejected' }
  if (status === 'approved') return { label: 'Approved', tone: 'bg-emerald-50 text-emerald-700', filter: 'approved' }
  if (status === 'failed') return { label: 'Failed', tone: 'bg-red-50 text-red-700', filter: 'failed' }
  if (invoice.source === 'local' || status === 'ready') return { label: 'Ready', tone: 'bg-[#eef2fb] text-[#0046dc]', filter: 'ready' }
  return { label: 'Processing', tone: 'bg-amber-50 text-amber-700', filter: 'processing' }
}
