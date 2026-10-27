import { phoneRuleFor } from '../../data/countryCodes'
import CountryCodeSelect from './CountryCodeSelect'

// The code picker and the number box as one control, shared by the request form and the Edit details popup.
// It only handles the typing rules (digits only, capped to the country's length, tidy pasting); the caller
// owns the values. `inputProps` goes on the number <input> (a controlled value/onChange pair, or react-hook-form's
// register() result) and `onNumberReplace(digits)` is how a paste that needs tidying hands back the clean number.
export default function PhoneField({ id, codeId, code, onCodeChange, inputProps = {}, onNumberReplace, invalid = false, required = false, describedBy, controlClassName = '' }) {
  const { max } = phoneRuleFor(code)

  const handleChange = (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, max)
    inputProps.onChange?.(event)
  }

  // "+91 98765 43210" or "098765 43210" pasted into an Indian number should keep just the 10 digits.
  const handlePaste = (event) => {
    if (code !== '+91') return
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
    const national = pasted.length === 12 && pasted.startsWith('91') ? pasted.slice(2) : pasted.length === 11 && pasted.startsWith('0') ? pasted.slice(1) : null
    if (national === null) return
    event.preventDefault()
    onNumberReplace?.(national)
  }

  return (
    <div className="flex gap-2">
      <div className="w-[5.5rem] shrink-0">
        <CountryCodeSelect id={codeId} value={code} onChange={onCodeChange} invalid={invalid} controlClassName={controlClassName} />
      </div>
      <input
        id={id}
        className={`app-field min-w-0 flex-1 tabular-nums ${controlClassName}`}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={max}
        aria-label={undefined}
        aria-invalid={invalid}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        {...inputProps}
        onChange={handleChange}
        onPaste={handlePaste}
      />
    </div>
  )
}
