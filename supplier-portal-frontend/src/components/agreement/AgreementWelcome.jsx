import { Clock3, FileSignature, FileText, PartyPopper, PenLine, ShieldCheck, UserCheck } from 'lucide-react'
import Button from '../common/Button'
import { SMALL_BUTTON } from './agreementUtils'

const OVERVIEW = [
  { icon: UserCheck, title: 'Review your details', text: 'Check the company, tax, address and bank details we hold for you.', hint: 'About 1 minute' },
  { icon: FileText, title: 'Read the agreement', text: 'See the key terms at a glance, then read the full agreement.', hint: 'About 1 minute' },
  { icon: PenLine, title: 'Sign', text: 'Add your signature and confirm it with a code sent to your email.', hint: 'About 1 minute' },
]

// The first screen of the agreement flow, for every vendor.
export default function AgreementWelcome({ vendorName, email, selfService, agreement, onStart }) {
  const months = agreement?.key_terms?.term_months

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-xl border border-[#dce6ff] bg-gradient-to-r from-[#eef2fb] to-white px-5 py-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 max-w-2xl">
          <span className="grid size-12 place-items-center rounded-full bg-brand-100 text-brand-700"><PartyPopper size={26} /></span>
          <p className="eyebrow mt-3">Final stage</p>
          <h2 className="mt-1.5 text-2xl font-extrabold tracking-[-0.03em] text-navy-950">
            {selfService ? 'Great news, you have reached the final stage' : `Welcome${vendorName ? `, ${vendorName}` : ''}`}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {selfService
              ? 'Your application has been reviewed and is ready for the final step: a short agreement to sign.'
              : <>You have been registered as a customer{email ? <> with <b className="font-bold text-navy-900">{email}</b></> : ''}. The final step is a short agreement to review and sign. After our team gives the final approval, your account goes live.</>}
          </p>
        </div>
        {agreement && (
          <div className="w-full shrink-0 rounded-lg border border-[#d8e0e9] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(16,42,76,0.08)] md:w-64">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Your agreement</p>
            <p className="mt-1 text-lg font-extrabold text-navy-950">{agreement.agreement_no}</p>
            <p className="text-xs font-semibold text-slate-500">Version {agreement.version}{months != null ? ` · Valid for ${months} ${Number(months) === 1 ? 'month' : 'months'}` : ''}</p>
          </div>
        )}
      </section>

      <ol className="grid gap-3 md:grid-cols-3" aria-label="What happens next">
        {OVERVIEW.map(({ icon: Icon, title, text, hint }, index) => (
          <li key={title} className="flex flex-col rounded-xl border border-[#d8e0e9] bg-[#f7f9fc] px-4 py-4">
            <span className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-full bg-brand-600 text-white"><Icon size={19} /></span>
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Step {index + 1}</span>
            </span>
            <p className="mt-3 text-sm font-extrabold text-navy-900">{title}</p>
            <p className="mt-1 flex-1 text-xs leading-5 text-slate-600">{text}</p>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Clock3 size={13} className="text-brand-600" /> {hint}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs leading-5 text-slate-600">
          <ShieldCheck size={16} className="shrink-0 text-emerald-600" />
          You can leave and come back; nothing is signed until you press Sign agreement.
        </p>
        <Button className={`${SMALL_BUTTON} shrink-0`} onClick={onStart}>
          <FileSignature size={15} /> Get started
        </Button>
      </div>
    </div>
  )
}
