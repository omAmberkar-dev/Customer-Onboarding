import { FileSignature } from 'lucide-react'

// "You are signing": the agreement on the first line, the parties and the term on the second.
export default function AgreementSummaryCard({ agreement, vendorName }) {
  const months = agreement?.key_terms?.term_months
  const parties = [agreement?.company_name, vendorName].filter(Boolean).join(' and ')
  return (
    <section className="rounded-xl border border-[#b3c3e4] bg-[#eef2fb] px-4 py-2.5" aria-label="You are signing">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]"><FileSignature size={14} className="text-brand-600" /> You are signing</span>
        <span className="text-[13px] font-bold text-navy-900">{agreement?.agreement_no || '—'}{agreement?.version ? ` · Version ${agreement.version}` : ''}</span>
      </p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium leading-5 text-slate-600">{parties ? `Between ${parties}` : ' '}</p>
        {months != null && <span className="shrink-0 whitespace-nowrap rounded-full border border-[#b3c3e4] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#052e86]">Valid {months} {Number(months) === 1 ? 'month' : 'months'}</span>}
      </div>
    </section>
  )
}
