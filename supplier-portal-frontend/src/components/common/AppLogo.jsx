import { Link } from 'react-router-dom'

// The brand: the mark in a bordered tile, the product name and its subtitle (the LAS navbar brand). `compact` (the
// navbar) keeps only the mark on the narrowest phones, so the name never runs under the header's buttons.
export default function AppLogo({ light = false, compact = false, to = '/', subtitle = 'Customer onboarding' }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 min-w-11 items-center gap-3 rounded-lg focus-visible:outline-none"
      aria-label="Customer Onboarding home"
    >
      <span className={`grid shrink-0 place-items-center rounded-lg border bg-white ${light ? 'border-white/20' : 'border-[#d8e0e9]'} ${compact ? 'size-[38px]' : 'size-11'}`}>
        <svg className={compact ? 'size-7' : 'size-8'} viewBox="0 0 48 48" aria-hidden="true">
          <rect x="13" y="8" width="23" height="7" rx="3.5" fill="#c0252d" />
          <rect x="13" y="17" width="17" height="7" rx="3.5" fill="#e3a71d" />
          <rect x="13" y="26" width="19" height="7" rx="3.5" fill="#23855d" />
          <circle cx="17" cy="39" r="4" fill="#626970" />
        </svg>
      </span>
      <span className={compact ? 'max-[419px]:sr-only' : ''}>
        <span className={`block whitespace-nowrap text-[15px] font-bold leading-tight tracking-[-0.01em] ${light ? 'text-white' : 'text-black'}`}>
          Customer Central
        </span>
        <span className={`mt-px block whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.04em] ${light ? 'text-white/75' : 'text-black/65'}`}>
          {subtitle}
        </span>
      </span>
    </Link>
  )
}
