import { Check, Pencil } from 'lucide-react'
import { FORM_STEPS } from '../../utils/constants'

export default function FormProgress({ currentStep }) {
  return (
    <div className="mb-2" aria-label={`Step ${currentStep} of ${FORM_STEPS.length}`}>
      <div className="mb-3 flex items-center justify-between sm:hidden">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-600">Step {currentStep} of {FORM_STEPS.length}</span>
        <span className="text-sm font-semibold text-navy-900">{FORM_STEPS[currentStep - 1].longTitle}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 sm:hidden">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${currentStep / FORM_STEPS.length * 100}%` }} />
      </div>

      <ol className="hidden items-center sm:flex">
        {FORM_STEPS.map((item, index) => {
          const done = item.id < currentStep
          const active = item.id === currentStep
          return (
            <li key={item.id} aria-current={active ? 'step' : undefined} className={`relative flex min-w-0 items-center ${index < FORM_STEPS.length - 1 ? 'flex-1' : ''}`}>
              <div className={`relative z-10 flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 ${active ? 'bg-slate-50' : ''}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold shadow-sm ${done ? 'bg-brand-600 text-white' : active ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-500'}`}>
                  {done ? <Check size={15} /> : active && index < 3 ? <Pencil size={14} /> : item.id}
                </span>
                <span className={`hidden truncate text-xs font-bold lg:block ${active ? 'text-navy-950' : done ? 'text-brand-700' : 'text-slate-500'}`}>{item.title}</span>
              </div>
              {index < FORM_STEPS.length - 1 && <span className={`mx-2 h-px flex-1 ${done ? 'bg-brand-500' : 'bg-slate-200'}`} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
