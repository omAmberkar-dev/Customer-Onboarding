import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { maskAadhaarInput } from '../../utils/formatters'
import FlagNote from './FlagNote'
import { flagClass, useFlag } from '../../context/flags-context'

// One field that groups what is typed or pasted into three sets of four digits ("1234 5678 9012").
// The value kept in the form carries the spaces; strip them before sending it anywhere.
// The digits are hidden (dots) until the eye is pressed; `action` is an optional button beside the field (Verify).
export default function AadhaarInput({ label, name, register, error, hint, required, action, className = '' }) {
  const field = register(name)
  const errorId = error ? `${name}-error` : undefined
  const flag = useFlag(name)
  const [revealed, setRevealed] = useState(false)

  const handleChange = (event) => {
    maskAadhaarInput(event.target)
    field.onChange(event)
  }

  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900" htmlFor={name}>
        {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      </label>
      <div className={action ? 'flex items-center gap-2' : undefined}>
        <div className="relative min-w-0 flex-1">
          <input
            id={name}
            className={`app-field min-w-0 pr-11 tracking-wider tabular-nums ${flagClass(flag)}`}
            style={revealed ? undefined : { WebkitTextSecurity: 'disc' }}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="XXXX XXXX XXXX"
            maxLength={14}
            aria-invalid={Boolean(error)}
            aria-required={required}
            aria-describedby={errorId}
            {...field}
            onChange={handleChange}
          />
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            className="absolute inset-y-0 right-1 my-auto grid size-8 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-navy-900"
            aria-label={revealed ? 'Hide Aadhaar number' : 'Show Aadhaar number'}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {action}
      </div>
      {hint && !error && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-[11px] font-medium text-red-600">{error.message}</p>}
      <FlagNote name={name} />
    </div>
  )
}
