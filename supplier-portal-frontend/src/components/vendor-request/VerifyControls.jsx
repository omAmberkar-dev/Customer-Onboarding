import { BadgeCheck, Search } from 'lucide-react'
import Loader from '../common/Loader'

// The controls beside a field that is checked with an outside service: a Verify button, then a Verified chip once it passes.
export const VERIFIED_CHIP = (
  <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
    <BadgeCheck size={14} /> Verified
  </span>
)

export function VerifyButton({ onClick, busy, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-3 text-xs font-bold text-brand-700 transition hover:border-brand-500 hover:bg-[#dce6ff] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={label}
    >
      {busy ? <Loader /> : <Search size={14} />}
      Verify
    </button>
  )
}
