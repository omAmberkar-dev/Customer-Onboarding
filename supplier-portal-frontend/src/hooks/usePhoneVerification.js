import { useCallback, useEffect, useRef, useState } from 'react'
import { sendPhoneVerification, verifyPhoneOtp } from '../api/vendorApi'

const IDLE = { phase: 'idle', phone: '', verificationId: '', resendAt: 0, attemptsRemaining: null, error: '' }

// Terminal statuses from the server, with what to tell the vendor. All of them need a fresh code.
const DEAD_STATUS_MESSAGES = {
  expired: 'This code has expired. Send a new one.',
  locked: 'Too many incorrect attempts. Send a new code.',
  superseded: 'A newer code was sent. Use the latest one, or send a new code.',
}

const normalise = (phone) => String(phone ?? '').replace(/[\s-]/g, '')

// Verifies `phone` (the full number with its country code, "+919998832823") with a 6-digit code sent over WhatsApp.
// Returns the same shape as useEmailVerification so the same panel can show it. `verified` is only true for the
// exact number that was verified: change the number and the verification is dropped.
export default function usePhoneVerification(phone) {
  const current = normalise(phone)
  const [state, setState] = useState(IDLE)
  const [busy, setBusy] = useState(false)
  const requestToken = useRef(0) // a late answer about an older request is ignored

  const reset = useCallback(() => {
    requestToken.current += 1
    setBusy(false)
    setState(IDLE)
  }, [])

  // The verification belongs to one number; editing it makes the old one meaningless.
  useEffect(() => {
    if (state.phone && state.phone !== current) reset()
  }, [current, state.phone, reset])

  const send = async () => {
    const token = ++requestToken.current
    setBusy(true)
    try {
      const result = await sendPhoneVerification(current)
      if (token !== requestToken.current) return
      setState({ ...IDLE, phase: 'pending', phone: current, verificationId: result.verification_id, resendAt: Date.parse(result.resend_available_at) || 0 })
    } catch (err) {
      if (token !== requestToken.current) return
      setState((s) => ({
        ...s,
        phone: current,
        error: err.message,
        resendAt: err.retryAfter ? Date.now() + err.retryAfter * 1000 : s.resendAt,
      }))
    } finally {
      if (token === requestToken.current) setBusy(false)
    }
  }

  const submitCode = async (otp) => {
    const token = ++requestToken.current
    const { verificationId, phone: forPhone } = state
    setBusy(true)
    setState((s) => ({ ...s, error: '' }))
    try {
      await verifyPhoneOtp(verificationId, otp)
      if (token !== requestToken.current) return
      setState({ ...IDLE, phase: 'verified', phone: forPhone, verificationId })
    } catch (err) {
      if (token !== requestToken.current) return
      const body = err.body
      if (DEAD_STATUS_MESSAGES[body?.status]) {
        setState({ ...IDLE, phone: forPhone, error: DEAD_STATUS_MESSAGES[body.status] })
      } else {
        setState((s) => ({ ...s, error: err.message, attemptsRemaining: body?.attempts_remaining ?? s.attemptsRemaining }))
      }
    } finally {
      if (token === requestToken.current) setBusy(false)
    }
  }

  const verified = state.phase === 'verified' && state.phone === current
  return {
    verified,
    verificationId: verified ? state.verificationId : '',
    pending: state.phase === 'pending' && state.phone === current,
    busy,
    error: state.phone === current ? state.error : '',
    attemptsRemaining: state.attemptsRemaining,
    resendAt: state.phone === current ? state.resendAt : 0,
    send,
    submitCode,
    reset,
  }
}
