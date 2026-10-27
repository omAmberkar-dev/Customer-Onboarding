export default function TextArea({ label, name, register, error, required, className = '', ...props }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900" htmlFor={name}>
        {label}{required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      </label>
      <textarea id={name} className="app-field min-h-28 resize-y" aria-invalid={Boolean(error)} aria-required={required} aria-describedby={error ? `${name}-error` : undefined} {...register(name)} {...props} />
      {error && <p id={`${name}-error`} className="mt-1 text-[11px] font-medium text-red-600">{error.message}</p>}
    </div>
  )
}
