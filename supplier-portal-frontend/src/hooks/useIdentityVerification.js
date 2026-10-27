import { useCallback, useEffect, useRef, useState } from 'react'
import { verifyIdentity } from '../api/vendorApi'
import { aadhaarDigits } from '../utils/formatters'

// 'new' verifies PAN, GSTIN and Aadhaar through our backend (the third-party verification API) and blocks the form
// until they pass. 'legacy' goes back to the old GSTIN lookup against the shared service with no PAN / Aadhaar checks.
// Switch with VITE_VERIFICATION_MODE=legacy.
export const VERIFICATION_MODE = import.meta.env.VITE_VERIFICATION_MODE === 'legacy' ? 'legacy' : 'new'

const SHAPES = {
  PAN: { label: 'PAN', normalise: (value) => String(value ?? '').trim().toUpperCase(), pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/ },
  GSTIN: { label: 'GSTIN', normalise: (value) => String(value ?? '').trim().toUpperCase(), pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ },
  AADHAAR: { label: 'Aadhaar number', normalise: aadhaarDigits, pattern: /^[2-9]\d{11}$/ },
}
const FORM_FIELD = { PAN: 'pan', GSTIN: 'gstin', AADHAAR: 'aadhaar' }
const SERVICES = Object.keys(SHAPES)

const EMPTY = { PAN: '', GSTIN: '', AADHAAR: '' }

// Tracks which PAN / GSTIN / Aadhaar values have passed verification. A value counts as verified only while the field
// still holds exactly that value, so editing a verified field drops it back to unverified. `values` is the form's
// current values. Lives on the page (not on step 1) so the verified state survives moving between steps.
// `trusted` is the values of an application that was already submitted and sent back for correction: they passed
// verification when it was submitted, so whatever the vendor does not change stays verified.
// `restore` is for a saved draft: the values saved in it are checked again once, in the background, so the form comes back as it
// was left (what was verified stays verified) without pressing Verify again. Nothing in the form is changed by that check.
export default function useIdentityVerification(values, trusted = null, restore = false) {
  const enabled = VERIFICATION_MODE === 'new'
  const [verified, setVerified] = useState(() => {
    if (!trusted) return EMPTY
    return Object.fromEntries(SERVICES.map((service) => {
      const value = SHAPES[service].normalise(trusted[FORM_FIELD[service]])
      return [service, SHAPES[service].pattern.test(value) ? value : '']
    }))
  })
  const [busy, setBusy] = useState({})
  const [failures, setFailures] = useState({}) // service -> { value, message }, shown while the field still holds that value
  const latest = useRef(values)
  latest.current = values

  const current = (service) => SHAPES[service].normalise(values[FORM_FIELD[service]])
  const isVerified = (service) => Boolean(verified[service]) && verified[service] === current(service)
  const failure = (service) => (failures[service]?.value === current(service) ? failures[service].message : '')

  // The services whose field still has to be verified. PAN is mandatory; GSTIN and Aadhaar only once filled in.
  const pending = enabled ? SERVICES.filter((service) => (service === 'PAN' || current(service)) && !isVerified(service)) : []

  // Runs one value through the backend. With `silent` nothing is shown on failure (used to re-check saved values).
  // Resolves to the response ({ verified, message, fill?, pan_verified? }), or null if it was not verified.
  const verify = useCallback(async (service, { silent = false } = {}) => {
    const { label, normalise, pattern } = SHAPES[service]
    const form = latest.current
    const value = normalise(form[FORM_FIELD[service]])
    const fail = (message) => {
      if (!silent) setFailures((all) => ({ ...all, [service]: { value, message } }))
      return null
    }
    if (!value) return fail(`Enter a ${label} first.`)
    if (!pattern.test(value)) return fail(`Enter a valid ${label}.`)

    setBusy((all) => ({ ...all, [service]: true }))
    try {
      const result = await verifyIdentity(service, value, { pan: SHAPES.PAN.normalise(form.pan), gstin: SHAPES.GSTIN.normalise(form.gstin) })
      // The field was edited while this was in flight: the answer belongs to a value that is no longer there.
      if (normalise(latest.current[FORM_FIELD[service]]) !== value) return null
      if (!result.verified) return fail(result.message || `This ${label} could not be verified.`)
      // A verified GSTIN fills in the PAN written inside it. When that PAN could not be verified automatically, the reason
      // belongs under the PAN field (never the GSTIN) and lasts as long as the field holds that PAN.
      const filledPan = service === 'GSTIN' ? SHAPES.PAN.normalise(result.fill?.pan) : ''
      setFailures((all) => ({
        ...all,
        [service]: undefined,
        ...(service === 'GSTIN' ? { PAN: !result.pan_verified && result.pan_message && filledPan ? { value: filledPan, message: result.pan_message } : undefined } : {}),
      }))
      setVerified((all) => ({
        ...all,
        [service]: value,
        ...(service === 'GSTIN' && result.pan_verified && result.fill?.pan ? { PAN: result.fill.pan } : {}),
      }))
      return result
    } catch (err) {
      return fail(err.message || 'Verification is unavailable right now. Please try again shortly.')
    } finally {
      setBusy((all) => ({ ...all, [service]: false }))
    }
  }, [])

  // Verified means "this value was verified by pressing Verify", nothing more: the moment a field changes, its
  // verification is dropped, so typing the same value back in (or reopening a saved application) needs a fresh Verify.
  // The one exception is the PAN a verified GSTIN fills in, which arrives already verified.
  const previous = useRef({ PAN: current('PAN'), GSTIN: current('GSTIN'), AADHAAR: current('AADHAAR') })
  const now = { PAN: current('PAN'), GSTIN: current('GSTIN'), AADHAAR: current('AADHAAR') }
  useEffect(() => {
    const changed = SERVICES.filter((service) => previous.current[service] !== now[service] && verified[service] !== now[service])
    previous.current = now
    if (changed.length) setVerified((all) => ({ ...all, ...Object.fromEntries(changed.map((service) => [service, ''])) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.PAN, now.GSTIN, now.AADHAAR])

  const verifiedNow = useRef(verified)
  verifiedNow.current = verified
  useEffect(() => {
    if (!restore || !enabled) return undefined
    let cancelled = false
    ;(async () => {
      // GSTIN first: verifying it also verifies the PAN written inside it, which then needs no check of its own.
      for (const service of ['GSTIN', 'PAN', 'AADHAAR']) {
        if (cancelled) return
        const value = SHAPES[service].normalise(latest.current[FORM_FIELD[service]])
        if (!value || !SHAPES[service].pattern.test(value) || verifiedNow.current[service] === value) continue
        await verify(service, { silent: true })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { enabled, isVerified, isBusy: (service) => Boolean(busy[service]), failure, pending, blocked: pending.length > 0, verify }
}
