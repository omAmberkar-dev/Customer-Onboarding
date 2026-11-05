import { Check } from 'lucide-react'
import { FORM_STEPS } from '../../utils/constants'

// The step bar, as LAS's (.vr-steps): numbered circles joined by a line, done steps ticked. On a phone only the
// current step keeps its name. `flaggedSteps` are the steps of a returned application that still have items to correct.
export default function FormProgress({ currentStep, flaggedSteps = [] }) {
  return (
    <div className="vr-steps-wrap">
      <ol className="vr-steps" aria-label={`Step ${currentStep} of ${FORM_STEPS.length}`}>
        {FORM_STEPS.map((item) => {
          const done = item.id < currentStep
          const active = item.id === currentStep
          const flagged = flaggedSteps.includes(item.id)
          return (
            <li
              key={item.id}
              className={`${done ? 'done' : active ? 'active' : ''} ${flagged ? 'flagged' : ''}`}
              aria-current={active ? 'step' : undefined}
            >
              <i>{done ? <Check size={14} aria-hidden="true" /> : item.id}</i>
              <span>{item.title}</span>
              {flagged && <b className="vr-step-flag" title="Has items to correct"><span className="sr-only">has items to correct</span></b>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
