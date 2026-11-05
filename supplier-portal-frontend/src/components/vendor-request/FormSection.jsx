// A titled card of the form, in LAS's panel look (vendorRequest.css): the title with its short blue bar, a one-line
// subtitle under it, an optional `action` on the right (Edit on the review step), then the body.
export default function FormSection({ title, description, action, children }) {
  return (
    <section className="vr-section" aria-label={title}>
      <header className="vr-section-head">
        <div className="min-w-0">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      <div className="vr-section-body">{children}</div>
    </section>
  )
}
