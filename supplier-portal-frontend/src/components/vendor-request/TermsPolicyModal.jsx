import { useEffect, useRef, useState } from 'react'
import { Check, FileText, LockKeyhole, X } from 'lucide-react'
import Button from '../common/Button'

export default function TermsPolicyModal({ open, onClose, onAccept }) {
  const [reachedEnd, setReachedEnd] = useState(false)
  const contentRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setReachedEnd(false)
    closeRef.current?.focus()

    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const checkScrollPosition = (event) => {
    const element = event.currentTarget
    const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight <= 8
    if (atEnd) setReachedEnd(true)
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-navy-950/60 p-3 backdrop-blur-[3px] sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-policy-title"
        aria-describedby="terms-policy-intro"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <FileText size={21} />
            </span>
            <div>
              <p className="eyebrow">Supplier onboarding portal</p>
              <h2 id="terms-policy-title" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-navy-950">
                Terms and policies
              </h2>
              <p id="terms-policy-intro" className="mt-1 text-xs leading-5 text-slate-500">
                Please read this document completely before accepting.
              </p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="interactive-icon shrink-0" aria-label="Close terms and policies">
            <X size={20} />
          </button>
        </header>

        <div
          ref={contentRef}
          onScroll={checkScrollPosition}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm leading-6 text-slate-600 sm:px-6"
          tabIndex="0"
        >
          <div className="rounded-xl border border-[#dce6ff] bg-brand-50 p-4 text-sm leading-6 text-navy-900">
            By accepting these terms, you confirm that you are authorised to submit information on behalf of the supplier and that the information provided is complete and accurate.
          </div>

          <div className="mt-5 space-y-5">
            <PolicySection number="1" title="Purpose and scope">
              These terms govern the use of this portal to apply for supplier registration, provide onboarding information, complete verification checks, and maintain an approved supplier profile. Submitting an application does not guarantee appointment, approval, purchase orders, or any minimum volume of business.
            </PolicySection>
            <PolicySection number="2" title="Authority and accurate information">
              You confirm that you have authority to act for the supplier. All company, ownership, contact, registration, tax, address, and banking information must be current, truthful, and complete. You must promptly correct any information that becomes inaccurate or outdated.
            </PolicySection>
            <PolicySection number="3" title="Verification and due diligence">
              You authorise the organisation and its approved service providers to validate submitted information against government, tax, banking, sanctions, fraud-prevention, and other lawful verification sources. Additional documents or clarification may be requested before or after approval.
            </PolicySection>
            <PolicySection number="4" title="Tax and banking details">
              GSTIN, PAN, registration records, account-holder information, account numbers, and IFSC details must belong to the applying supplier. The supplier is responsible for ensuring payment instructions are correct. Any bank-detail change may be held for additional verification before it becomes effective.
            </PolicySection>
            <PolicySection number="5" title="Legal and ethical compliance">
              The supplier agrees to comply with applicable laws, tax obligations, labour and environmental requirements, anti-bribery and anti-corruption rules, sanctions, competition law, and the organisation’s supplier code of conduct. Fraudulent, misleading, or unlawful submissions may be rejected or reported to the appropriate authorities.
            </PolicySection>
            <PolicySection number="6" title="Privacy and information security">
              Submitted personal and business information may be collected, stored, reviewed, and shared with authorised teams and service providers for onboarding, risk assessment, payment, audit, compliance, and supplier-management purposes. Access credentials must be kept confidential, and suspected unauthorised access must be reported promptly.
            </PolicySection>
            <PolicySection number="7" title="Application decisions and suspension">
              The organisation may approve, reject, pause, request changes to, suspend, or deactivate a supplier profile based on its procurement requirements, risk controls, incomplete verification, policy violations, inactivity, or applicable law. Where appropriate, the supplier may be asked to remediate an issue before reconsideration.
            </PolicySection>
            <PolicySection number="8" title="Ongoing responsibilities">
              Approved suppliers must maintain accurate profile information and supporting records throughout the relationship. Material changes—including ownership, legal status, tax registration, address, contacts, or bank details—must be updated through the portal and may trigger renewed verification.
            </PolicySection>
            <PolicySection number="9" title="Electronic acceptance">
              Selecting “Yes, I agree” constitutes an electronic acknowledgement of these terms on behalf of the supplier. The date, time, user, and application reference may be recorded as evidence of acceptance.
            </PolicySection>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <LockKeyhole size={18} className="mt-0.5 shrink-0" />
            <p className="m-0 text-xs leading-5">
              You have reached the end of the supplier onboarding terms. You may now confirm your acceptance below.
            </p>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-xs font-semibold text-slate-500">
              {reachedEnd ? 'Terms reviewed. You can now accept.' : 'Scroll to the end to enable acceptance.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={onAccept} disabled={!reachedEnd}>
                <Check size={17} /> {reachedEnd ? 'Yes, I agree' : 'Scroll to continue'}
              </Button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  )
}

function PolicySection({ number, title, children }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-navy-900">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] text-slate-600">{number}</span>
        {title}
      </h3>
      <p className="mt-2 pl-8">{children}</p>
    </section>
  )
}
