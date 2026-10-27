// Where a vendor is in the lifecycle (the backend's `stage`, derived from vendor.status) decides what they can use.
export const STAGES = {
  draft: 'draft', // signed up, application not submitted yet
  returned: 'returned', // sent back by the maker or checker with reasons to fix
  makerReview: 'maker_review',
  checkerReview: 'checker_review',
  agreement: 'agreement', // the checker issued the vendor agreement: the vendor reviews and signs it
  agreementSigned: 'agreement_signed', // signed; waiting for the checker's final approval
  approved: 'approved', // checker approved, SAP vendor being created
  rejected: 'rejected', // final rejection
  changeRequested: 'change_requested', // asked to change details; waiting for the reviewer to send the application back
  active: 'active', // approved and live: invoices and change requests
}

// Stages in which the vendor edits the onboarding form.
export const FORM_STAGES = [STAGES.draft, STAGES.returned]
// Stages in which the vendor can only follow the progress of their application.
export const WAITING_STAGES = [STAGES.makerReview, STAGES.checkerReview, STAGES.agreementSigned, STAGES.approved, STAGES.rejected, STAGES.changeRequested]

export function homeForStage(stage) {
  if (stage === STAGES.active) return '/invoices'
  if (stage === STAGES.agreement) return '/agreement'
  if (FORM_STAGES.includes(stage)) return '/request-vendor'
  if (WAITING_STAGES.includes(stage)) return '/application-status'
  return '/'
}
