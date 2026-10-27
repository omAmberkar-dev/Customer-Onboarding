import { useState } from 'react'
import { BookOpenCheck, ChevronDown, FileCheck2, Lock, Minus, PenLine, ShieldCheck, UserCheck } from 'lucide-react'
import Button from '../common/Button'
import { formatDate } from './agreementUtils'

const LONG_NOTE = 140

const HOW_IT_WORKS = [
  { icon: UserCheck, title: 'Review your details', text: 'Check that your company, tax and bank details are correct.', time: 'About 1 min' },
  { icon: BookOpenCheck, title: 'Read the agreement', text: 'Go through the full agreement and its key terms.', time: 'About 3 min' },
  { icon: PenLine, title: 'Sign securely', text: 'Sign with a drawn, typed or uploaded signature and confirm with a one-time code sent to your email.', time: 'About 1 min' },
]
const TRUST = [
  { icon: ShieldCheck, text: 'E-signature protected by an email code' },
  { icon: FileCheck2, text: 'Signed copy available in your portal' },
  { icon: Lock, text: 'Your details stay private' },
]

const HISTORY_STATUS = {
  declined: { label: 'Returned for correction', verb: 'Returned', tone: 'bg-amber-100 text-amber-800' },
  withdrawn: { label: 'Withdrawn', verb: 'Withdrawn', tone: 'bg-slate-100 text-slate-600' },
  signed: { label: 'Signed', verb: 'Signed', tone: 'bg-emerald-100 text-emerald-800' },
  other: { label: 'Replaced', verb: 'Replaced', tone: 'bg-slate-100 text-slate-600' },
}

// One line of the short "conversation": who said it and what, cut to two lines until "Show full" is pressed.
function Note({ who, initial, tone, text }) {
  const [open, setOpen] = useState(false)
  const long = text.length > LONG_NOTE
  return (
    <li className="flex gap-2.5">
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${tone}`} aria-hidden="true">{initial}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-5 text-slate-700">
        <span className="font-bold text-navy-900">{who}: </span>
        <span className={open ? 'whitespace-pre-line' : 'line-clamp-2'}>{text}</span>
        {long && <button type="button" onClick={() => setOpen((value) => !value)} className="ml-1 text-xs! font-bold! text-[#052e86] hover:underline">{open ? 'Show less' : 'Show full'}</button>}
      </div>
    </li>
  )
}

// The first screen after an agreement was issued again (version 2 or later): short and action-first. Details of what
// changed are shown on the review step itself. `renewal` is the next term of an agreement already in force (the vendor is active):
// it is a new agreement for a new period, not a corrected one, so it says so and leaves out "what was updated".
export default function AgreementUpdated({ agreement, onStart, renewal = false }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const info = agreement?.update_info || {}
  const version = agreement?.version
  const previous = info.previous_version || (version ? version - 1 : '')
  const earlier = info.history?.length ? info.history : (previous ? [{ version: previous, status: 'declined', reason: info.previous_decline_reason }] : [])
  const changes = renewal ? [] : info.changes || []
  const months = agreement?.key_terms?.term_months
  const issued = agreement?.issued_at ? formatDate(agreement.issued_at) : ''
  const facts = [
    agreement?.agreement_no && ['Agreement no.', agreement.agreement_no],
    ['Version', String(version)],
    months != null && [renewal ? 'Term' : 'Validity', `${months} ${Number(months) === 1 ? 'month' : 'months'}`],
    renewal && agreement?.start_iso && ['Starts on', formatDate(agreement.start_iso)],
    !renewal && issued && issued !== '—' && ['Re-issued on', issued],
    renewal && issued && issued !== '—' && ['Sent to you on', issued],
  ].filter(Boolean)

  return (
    <div className="flex min-h-full w-full items-center justify-center py-2">
      <section className="w-full max-w-[860px] rounded-2xl border border-[#b3c3e4]/80 bg-white px-6 py-8 shadow-[0_12px_36px_rgba(40,83,130,0.08)] sm:px-10" aria-label="Updated agreement">
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">Action needed</span>
        <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-navy-950">{renewal ? 'Your renewed agreement is ready' : 'Your agreement has been updated'}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {renewal
            ? `This is your agreement for the next term${agreement?.start_iso && agreement?.end_iso ? `, ${formatDate(agreement.start_iso)} to ${formatDate(agreement.end_iso)}` : ''}. Your current agreement stays in force until it starts.`
            : `Version ${version} is ready for your review and signature.`}
        </p>

        <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-[#d8e0e9] bg-[#f7f9fc] sm:flex">
          {facts.map(([label, value], index) => (
            <div key={label} className={`min-w-0 px-4 py-3 sm:flex-1 ${index > 0 ? 'sm:border-l sm:border-[#d8e0e9]' : ''} ${index > 1 ? 'border-t border-[#d8e0e9] sm:border-t-0' : ''} ${index % 2 === 1 ? 'border-l border-[#d8e0e9] sm:border-l' : ''}`}>
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
              <dd className="mt-0.5 truncate text-sm font-extrabold text-navy-900">{value}</dd>
            </div>
          ))}
        </dl>

        {changes.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-navy-900">Updated for you:</span>
            {changes.map((change) => <span key={change.key || change.label} className="rounded-md border border-[#dce6ff] bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{change.label}</span>)}
          </div>
        )}

        {(info.previous_decline_reason || info.issue_note) && (
          <ul className="mt-4 space-y-2 rounded-lg border border-[#d8e0e9] bg-[#f7f9fc] px-3.5 py-3" aria-label="Notes">
            {info.previous_decline_reason && <Note who={renewal ? 'You, on the earlier version' : 'You'} initial="Y" tone="bg-slate-200 text-slate-700" text={info.previous_decline_reason} />}
            {info.issue_note && <Note who="Our team" initial="T" tone="bg-brand-600 text-white" text={info.issue_note} />}
          </ul>
        )}

        <div className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">How it works</p>
          <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch" aria-label="How it works">
            {HOW_IT_WORKS.map(({ icon: Icon, title, text, time }, index) => (
              <li key={title} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
                <div className="flex flex-1 flex-col rounded-xl border border-[#d8e0e9] bg-[#f7f9fc] px-3.5 py-3">
                  <span className="flex items-center justify-between">
                    <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-white"><Icon size={16} /></span>
                    <span className="text-[11px] font-bold text-slate-400">{index + 1}</span>
                  </span>
                  <p className="mt-2 text-[13px] font-extrabold text-navy-900">{title}</p>
                  <p className="mt-0.5 flex-1 text-xs leading-5 text-slate-600">{text}</p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">{time}</p>
                </div>
                {index < HOW_IT_WORKS.length - 1 && <span className="hidden self-center text-slate-300 sm:block" aria-hidden="true">›</span>}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6">
          <Button className="min-h-10! w-full px-4! py-2! text-[13px]!" onClick={onStart}><PenLine size={15} /> Review and sign</Button>
          <p className="mt-2 text-center text-xs text-slate-500">Takes about 2 minutes. Nothing is signed until you press Sign agreement.</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
            {TRUST.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Icon size={13} className="text-emerald-600" /> {text}</li>
            ))}
          </ul>
        </div>

        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <button type="button" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen} className="inline-flex items-center gap-1 text-xs! font-bold! text-slate-500 transition hover:text-navy-900">
            {renewal ? 'Earlier agreements' : 'Version history'} <ChevronDown size={14} className={`transition ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
          {historyOpen && (
            <ol className="mt-3" aria-label="Versions">
              <li className="relative flex gap-3 pb-4">
                <span className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-slate-200" aria-hidden="true" />
                <span className="relative z-[1] grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 ring-4 ring-brand-100"><FileCheck2 size={12} className="text-white" /></span>
                <div className="min-w-0 flex-1 rounded-lg border border-[#b3c3e4] bg-[#eef2fb]/60 px-3 py-2">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-extrabold text-navy-900">
                    Version {version}
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Current</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{issued && issued !== '—' ? `Issued ${issued}. ` : ''}Waiting for your review and signature.</p>
                </div>
              </li>
              {earlier.map((entry, index) => {
                const meta = HISTORY_STATUS[entry.status] || HISTORY_STATUS.other
                const when = entry.declined_at || entry.signed_at || entry.issued_at
                return (
                  <li key={entry.version} className={`relative flex gap-3 ${index < earlier.length - 1 ? 'pb-4' : ''}`}>
                    {index < earlier.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-slate-200" aria-hidden="true" />}
                    <span className="relative z-[1] grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 ring-4 ring-white"><Minus size={12} className="text-slate-500" /></span>
                    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-slate-700">
                        Version {entry.version}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tone}`}>{meta.label}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {entry.issued_at ? `Issued ${formatDate(entry.issued_at)}` : ''}
                        {when && when !== entry.issued_at ? `${entry.issued_at ? ' · ' : ''}${meta.verb} ${formatDate(when)}` : ''}
                      </p>
                      {entry.reason && <p className="mt-1 line-clamp-2 text-xs text-slate-600">“{entry.reason}”</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}
