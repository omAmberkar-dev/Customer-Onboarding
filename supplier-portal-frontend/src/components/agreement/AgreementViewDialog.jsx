import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, PenLine, X, XCircle } from 'lucide-react'
import AgreementPdfViewer from './AgreementPdfViewer'
import { STATE_BADGES, formatDate, formatPeriod } from './agreementUtils'

// What happened to an agreement the vendor did not sign, in the vendor's own words, shown above its PDF.
function OutcomeNotice({ agreement }) {
  if (agreement.derived_state !== 'declined') return null
  const review = agreement.decline_step === 'review'
  const Icon = review ? AlertTriangle : XCircle
  return (
    <div role="status" className={`mb-3 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 ${review ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-xs leading-5">
        <p className="font-bold">{review ? 'You asked for corrections at the details review' : 'You declined this agreement after reading it'}{agreement.declined_at ? ` · ${formatDate(agreement.declined_at)}` : ''}</p>
        {agreement.decline_reason && <p className="break-words"><b>Your reason:</b> {agreement.decline_reason}</p>}
      </div>
    </div>
  )
}

const STATE_LABEL = { ...Object.fromEntries(Object.entries(STATE_BADGES).map(([key, [text]]) => [key, text])), scheduled: 'Starts later' }

// The agreement's own details, so the vendor sees what they are opening before they read it: its state, period, term and who signed.
function Details({ agreement }) {
  const months = agreement.key_terms?.term_months
  const facts = [
    ['Valid', formatPeriod(agreement)],
    months != null && ['Term', `${months} ${Number(months) === 1 ? 'month' : 'months'}`],
    agreement.issued_at && ['Sent to you', formatDate(agreement.issued_at)],
    agreement.signed_at && ['Signed', `${formatDate(agreement.signed_at)}${agreement.signer_name ? ` by ${agreement.signer_name}` : ''}`],
  ].filter(Boolean)
  const label = STATE_LABEL[agreement.derived_state]
  return (
    <section className="mb-3 rounded-lg border border-[#d8e0e9] bg-[#f7f9fc] px-3.5 py-2.5" aria-label="Agreement details">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-[13px] font-extrabold text-navy-900">{agreement.agreement_no}</span>
        {agreement.version && <span className="text-xs font-semibold text-slate-500">Version {agreement.version}</span>}
        {label && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-600">{label}</span>}
      </div>
      <dl className="mt-2 grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">{term}</dt>
            <dd className="break-words text-[13px] font-semibold text-navy-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// A large in-page dialog showing one agreement PDF.
// `onSign` adds a "Review and sign" button to the footer, for an agreement that is waiting for the vendor's signature.
export default function AgreementViewDialog({ agreement, onClose, onSign = null }) {
  useEffect(() => {
    if (!agreement) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [agreement, onClose])

  if (!agreement) return null
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/55 p-3 backdrop-blur-[2px] sm:p-6" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="agreement-view-title">
        <header className="flex items-center justify-between gap-3 border-b border-[#b3c3e4] bg-[#eef2fb] px-5 py-3">
          <div className="min-w-0">
            <p className="eyebrow">Customer agreement</p>
            <h2 id="agreement-view-title" className="mt-0.5 truncate text-base font-extrabold text-navy-950">{agreement.agreement_no}{agreement.version ? ` · Version ${agreement.version}` : ''}</h2>
          </div>
          <button type="button" onClick={onClose} className="interactive-icon" aria-label="Close agreement"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Details agreement={agreement} />
          <OutcomeNotice agreement={agreement} />
          <AgreementPdfViewer agreementId={agreement.agreement_id} agreementNo={agreement.agreement_no} className="h-[72vh] min-h-[360px]" />
        </div>
        {onSign && (
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#b3c3e4] bg-[#eef2fb] px-5 py-2.5">
            <p className="text-xs text-slate-600">Read it through, then sign when you are ready.</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg! border border-[#c2cdda] bg-white px-3.5 text-[13px]! font-semibold! text-navy-900 transition hover:border-brand-600 hover:bg-[#eef2fb] hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40">Close</button>
              <button type="button" onClick={onSign} className="inline-flex h-9 items-center gap-2 rounded-lg! border border-brand-600 bg-brand-600 px-3.5 text-[13px]! font-semibold! text-white transition hover:border-brand-700 hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40"><PenLine size={15} /> Review and sign</button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
