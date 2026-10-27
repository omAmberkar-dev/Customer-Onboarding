export default function FormSection({ title, description, icon: Icon, children }) {
  return (
    <section className="section-card p-3.5 sm:p-4">
      <div className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-2.5">
        {Icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Icon size={17} strokeWidth={2.25} />
          </span>
        )}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-base font-extrabold tracking-tight text-navy-900">{title}</h2>
          {description && <p className="text-xs leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
