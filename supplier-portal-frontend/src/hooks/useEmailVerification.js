import { useCallback, useEffect, useRef, useState } from 'react'
import { getEmailVerificationStatus, sendEmailVerification, verifyEmailOtp } from '../api/vendorApi'

const POLL_INTERVAL_MS = 4000
const IDLE = { phase: 'idle', email: '', verificationId: '', resendAt: 0, attemptsRemaining: null, error: '' }

// Terminal statuses from the service, with what to tell the vendor. All of them need a fresh email.
const DEAD_STATUS_MESSAGES = {
  expired: 'This code has expired. Send a new one.',
  locked: 'Too many incorrect attempts. Send a new code.',
  superseded: 'A newer email was sent. Use the latest one, or send a new code.',
}

const normalise = (email) => String(email ?? '').trim().toLowerCase()

// Verifies `email` with a 6-digit code or the link in the same email. Whichever happens first wins, so while a
// code is pending the status is polled (the link may be opened on another device). `verified` is only true for
// the exact address that was verified: change the email and the verification is dropped.
export default function useEmailVerification(email) {
  const current = normalise(email)
  const [state, setState] = useState(IDLE)
  const [busy, setBusy] = useState(false)
  const requestToken = useRef(0)
  const activeId = useRef('') // the verification the panel is on; a late answer about an older one is ignored

  const reset = useCallback(() => {
    requestToken.current += 1
    activeId.current = ''
    setBusy(false)
    setState(IDLE)
  }, [])

  // The verification belongs to one address; editing it makes the old one meaningless.
  useEffect(() => {
    if (state.email && state.email !== current) reset()
  }, [current, state.email, reset])

  // Asks the service (the source of truth) whether this verification is done; applies the outcome.
  const confirm = useCallback(async (verificationId, forEmail) => {
    const token = requestToken.current
    const result = await getEmailVerificationStatus(verificationId)
    if (token !== requestToken.current) return false

    if (result.status === 'verified') {
      setState((s) => ({ ...s, phase: 'verified', email: forEmail, verificationId, error: '', attemptsRemaining: null }))
      return true
    }
    // Sending a new code supersedes the old one, so a poll of the old verification can answer "superseded" after the new one is already shown.
    if (DEAD_STATUS_MESSAGES[result.status] && activeId.current === verificationId) {
      setState({ ...IDLE, email: forEmail, error: DEAD_STATUS_MESSAGES[result.status] })
    }
    return false
  }, [])

  useEffect(() => {
    if (state.phase !== 'pending') return undefined
    const timer = setInterval(() => {
      confirm(state.verificationId, state.email).catch(() => {}) // a missed poll is retried on the next tick
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [state.phase, state.verificationId, state.email, confirm])

  const send = async () => {
    const token = ++requestToken.current
    setBusy(true)
    try {
      const result = await sendEmailVerification(current)
      if (token !== requestToken.current) return
      requestToken.current += 1 // drops any poll of the old verification that is still in flight
      activeId.current = result.verification_id
      setState({ ...IDLE, phase: 'pending', email: current, verificationId: result.verification_id, resendAt: Date.parse(result.resend_available_at) || 0 })
    } catch (err) {
      if (token !== requestToken.current) return
      setState((s) => ({
        ...s,
        email: current,
        error: err.message,
        resendAt: err.retryAfter ? Date.now() + err.retryAfter * 1000 : s.resendAt,
      }))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (otp) => {
    const token = ++requestToken.current
    const { verificationId, email: forEmail } = state
    setBusy(true)
    setState((s) => ({ ...s, error: '' }))
    try {
      await verifyEmailOtp(verificationId, otp)
      // A 200 is not taken on trust: the status endpoint decides.
      const done = await confirm(verificationId, forEmail)
      if (!done && token === requestToken.current) setState((s) => (s.phase === 'pending' ? { ...s, error: 'Could not confirm the verification. Please try again.' } : s))
    } catch (err) {
      if (token !== requestToken.current) return
      const body = err.body
      if (body?.status === 'verified') {
        await confirm(verificationId, forEmail).catch(() => {})
      } else if (DEAD_STATUS_MESSAGES[body?.status] && activeId.current === verificationId) {
        setState({ ...IDLE, email: forEmail, error: DEAD_STATUS_MESSAGES[body.status] })
      } else {
        setState((s) => ({ ...s, error: err.message, attemptsRemaining: body?.attempts_remaining ?? s.attemptsRemaining }))
      }
    } finally {
      if (token === requestToken.current) setBusy(false)
    }
  }

  const verified = state.phase === 'verified' && state.email === current
  return {
    verified,
    verificationId: verified ? state.verificationId : '',
    pending: state.phase === 'pending' && state.email === current,
    busy,
    error: state.email === current ? state.error : '',
    attemptsRemaining: state.attemptsRemaining,
    resendAt: state.email === current ? state.resendAt : 0,
    send,
    submitCode,
    reset,
  }
}
