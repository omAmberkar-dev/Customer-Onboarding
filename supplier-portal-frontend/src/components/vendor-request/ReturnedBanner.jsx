import { AlertTriangle, ArrowRight, Check, CircleDashed } from 'lucide-react'

const formatDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// Shown on every step of a returned application: why it came back and what is left to fix. `items` is
// [{ key, label, reasons, status, step }]; `onGo` jumps to the field (changing step if needed).
export default function ReturnedBanner({ rejection, items, onGo }) {
  const open = items.filter((item) => item.status === 'open').length

  return (
    <section role="region" aria-label="Application returned" className="mb-4 rounded-xl border border-red-200 bg-red-50/70 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-700"><AlertTriangle size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-red-900">Your application needs a few corrections</h3>
          <p className="mt-0.5 text-xs leading-5 text-red-900/80">
            It was returned by our team{formatDate(rejection.rejected_at) && ` on ${formatDate(rejection.rejected_at)}`}.
            Fix the items below (or confirm they are correct), then resubmit. {open === 0
              ? 'Everything is handled: review and resubmit.'
              : `${open} of ${items.length} still to do.`}
          </p>
          {rejection.overall_remark && (
            <p className="mt-2 rounded-lg border border-red-200 bg-white/70 px-3 py-2 text-xs leading-5 text-red-900"><strong>Note from our team:</strong> {rejection.overall_remark}</p>
          )}
          <ul className="mt-3 grid gap-1.5">
            {items.map((item) => (
              <li key={item.key} className="flex items-start gap-2 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs">
                <span className={`mt-0.5 shrink-0 ${item.status === 'open' ? 'text-red-500' : 'text-emerald-600'}`}>
                  {item.status === 'open' ? <CircleDashed size={14} /> : <Check size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="text-navy-900">{item.label}</strong>
                  <span className="text-slate-600"> — {item.reasons.map((reason) => reason.label).join('; ')}</span>
                </span>
                <button type="button" onClick={() => onGo(item)} className="inline-flex shrink-0 items-center gap-1 font-bold text-brand-600 hover:text-brand-700">
                  {item.status === 'open' ? 'Fix' : 'View'} <ArrowRight size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
