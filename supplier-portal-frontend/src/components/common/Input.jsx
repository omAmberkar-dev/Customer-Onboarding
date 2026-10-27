import FlagNote from './FlagNote'
import { flagClass, useFlag } from '../../context/flags-context'

export default function Input({ label, name, register, error, hint, required, action, endAdornment, locked = false, className = '', ...props }) {
  const errorId = error ? `${name}-error` : undefined
  const flag = useFlag(name)
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900" htmlFor={name}>
        {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      </label>
      <div className={action ? 'flex items-center gap-2' : undefined}>
        <div className="relative min-w-0 flex-1">
          <input
            id={name}
            className={`app-field min-w-0 ${endAdornment ? 'pr-11' : ''} ${locked ? 'app-field--locked' : ''} ${flagClass(flag)}`}
            aria-invalid={Boolean(error)}
            aria-required={required}
            aria-readonly={locked || undefined}
            {...register(name)}
            {...props}
            readOnly={locked || props.readOnly}
          />
          {endAdornment && <div className="absolute inset-y-0 right-1 flex items-center">{endAdornment}</div>}
        </div>
        {action}
      </div>
      {hint && !error && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-[11px] font-medium text-red-600">{error.message}</p>}
      <FlagNote name={name} />
    </div>
  )
}
