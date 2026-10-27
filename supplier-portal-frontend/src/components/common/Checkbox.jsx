export default function Checkbox({ label, name, register, disabled, description, error, onClick }) {
  return (
    <div className="flex h-full flex-col">
      <label className={`flex min-h-16 flex-1 items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 transition hover:border-slate-300 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
        <input type="checkbox" className="mt-0.5 size-4.5 shrink-0 rounded border-slate-300 accent-brand-600 focus:ring-brand-500" disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} {...register(name)} onClick={onClick} />
        <span className="text-sm leading-5 text-slate-700"><span className="font-semibold">{label}</span>{description && <span className="mt-0.5 block text-slate-500">{description}</span>}</span>
      </label>
      {error && <p id={`${name}-error`} className="ml-7 mt-1 text-xs font-medium text-red-600">{error.message}</p>}
    </div>
  )
}
