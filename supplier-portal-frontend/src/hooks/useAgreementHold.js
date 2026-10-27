import useAuth from './useAuth'

// Shown on every write control that is frozen while the vendor has no agreement in force.
export const HOLD_TOOLTIP = 'On hold: your agreement has expired'

// The agreement hold from the vendor's profile (the backend derives it from the agreement dates on every request):
// `onHold`, the `hold` details ({ reason, expired_on, next_start, released_until }) and the `expiry` of the agreement in force.
export default function useAgreementHold() {
  const { profile } = useAuth()
  const hold = profile?.agreement_hold || null
  const onHold = Boolean(hold?.on_hold)
  return { onHold, hold, expiry: profile?.agreement_expiry || null, tooltip: onHold ? HOLD_TOOLTIP : undefined }
}
