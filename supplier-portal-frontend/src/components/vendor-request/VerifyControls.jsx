import { BadgeCheck, Search } from 'lucide-react'
import Loader from '../common/Loader'

// The controls beside a field that is checked with an outside service: a Verify button, then a Verified chip once it passes.
export const VERIFIED_CHIP = (
  <span className="vr-verified">
    <BadgeCheck size={14} /> Verified
  </span>
)

export function VerifyButton({ onClick, busy, disabled, label }) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} className="vr-verify-btn" aria-label={label}>
      {busy ? <Loader /> : <Search size={14} />}
      Verify
    </button>
  )
}
