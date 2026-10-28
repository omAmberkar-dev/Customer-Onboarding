import { Check, Circle, CircleDot, XCircle } from 'lucide-react'

// Each step's marker and colours: done (filled), current (ringed), upcoming (hollow), stopped (not approved).
const LOOK = {
  done: { icon: Check, dot: 'bg-brand-600 text-white border-brand-600', line: 'bg-brand-600', label: 'text-navy-900', state: 'Done' },
  current: { icon: CircleDot, dot: 'bg-white text-brand-600 border-brand-600 ring-4 ring-brand-100', line: 'bg-[#d8e0e9]', label: 'text-navy-900', state: 'In progress' },
  upcoming: { icon: Circle, dot: 'bg-white text-slate-300 border-[#d8e0e9]', line: 'bg-[#d8e0e9]', label: 'text-slate-500', state: 'Not started' },
  stopped: { icon: XCircle, dot: 'bg-slate-100 text-slate-500 border-slate-300', line: 'bg-[#d8e0e9]', label: 'text-slate-600', state: 'Stopped' },
}

// The journey as a vertical stepper: onboarding, loan application, sanction, drawdowns, invoices.
export default function JourneySteps({ steps }) {
  return (
    <ol className="grid" aria-label="Your loan journey">
      {steps.map((step, index) => {
        const look = LOOK[step.state] || LOOK.upcoming
        const Icon = look.icon
        const last = index === steps.length - 1
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={step.state === 'current' ? 'step' : undefined}>
            {!last && <span className={`absolute top-8 bottom-0 left-[15px] w-0.5 ${look.line}`} aria-hidden="true" />}
            <span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 ${look.dot}`} aria-hidden="true"><Icon size={16} strokeWidth={2.5} /></span>
            <div className="min-w-0 pt-1">
              <p className={`text-sm font-bold ${look.label}`}>{step.label} <span className="sr-only">({look.state})</span></p>
              {step.note && <p className="mt-0.5 text-xs leading-5 text-[#5f5f5f]">{step.note}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
