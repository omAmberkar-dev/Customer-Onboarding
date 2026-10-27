import { DEFAULT_COUNTRY_CODE, phoneRuleFor } from '../../data/countryCodes'
import PhoneField from './PhoneField'
import FlagNote from './FlagNote'
import { flagClass, useFlag } from '../../context/flags-context'

// react-hook-form wrapper around PhoneField. The country code and the number are two separate form values
// (`codeName` and `name`); join them with joinPhone() when the full number is needed.
export default function PhoneInput({ label, name, codeName, register, watch, setValue, error, hint, required, className = '' }) {
  const code = watch(codeName) || DEFAULT_COUNTRY_CODE
  const errorId = error ? `${name}-error` : undefined
  const flag = useFlag(name)

  const handleCodeChange = (nextCode) => {
    setValue(codeName, nextCode, { shouldDirty: true })
    // Re-check what is already typed against the new country's rules.
    const current = String(watch(name) ?? '')
    if (current) setValue(name, current.slice(0, phoneRuleFor(nextCode).max), { shouldDirty: true, shouldValidate: true })
  }

  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900" htmlFor={name}>
        {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      </label>
      <input type="hidden" {...register(codeName)} />
      <PhoneField
        id={name}
        codeId={codeName}
        code={code}
        onCodeChange={handleCodeChange}
        inputProps={register(name)}
        onNumberReplace={(digits) => setValue(name, digits, { shouldDirty: true, shouldValidate: true })}
        invalid={Boolean(error)}
        required={required}
        describedBy={errorId}
        controlClassName={flagClass(flag)}
      />
      {hint && !error && <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-[11px] font-medium text-red-600">{error.message}</p>}
      <FlagNote name={name} />
    </div>
  )
}
