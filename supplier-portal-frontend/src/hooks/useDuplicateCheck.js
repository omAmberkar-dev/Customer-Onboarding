import { useEffect, useRef, useState } from 'react'

// Debounces an async "does this value already exist" check and reports the
// result back into react-hook-form as a manual error, plus a plain boolean
// for callers (like a wizard's "Continue" button) that need to block on it
// synchronously rather than re-reading form errors.
export default function useDuplicateCheck({ value, isValid, checkFn, message, fieldName, setError, clearErrors, onTakenChange, onCheckingChange, onChecked, takenRef }) {
  const [checking, setChecking] = useState(false)
  const token = useRef(0)

  useEffect(() => {
    onCheckingChange?.(checking)
  }, [checking, onCheckingChange])

  useEffect(() => {
    const current = ++token.current
    onTakenChange?.(false)
    // null = the latest value has not been checked yet; true / false once the server has answered.
    onChecked?.(null)
    if (!value || !isValid) {
      // An empty field has nothing to be "taken"; drop the earlier answer and its error so it cannot linger.
      if (!value) {
        if (takenRef) takenRef.current[fieldName] = ''
        if (takenRef) takenRef.current[`${fieldName}Message`] = ''
        clearErrors(fieldName)
      }
      setChecking(false)
      return undefined
    }

    clearErrors(fieldName)
    setChecking(true)
    const timer = setTimeout(async () => {
      try {
        const exists = await checkFn(value)
        if (current !== token.current) return
        onChecked?.(Boolean(exists))
        if (takenRef) {
          takenRef.current[fieldName] = exists ? String(value).trim() : ''
          takenRef.current[`${fieldName}Message`] = ''
        }
        if (exists) {
          setError(fieldName, { type: 'manual', message })
          onTakenChange?.(true)
        } else {
          clearErrors(fieldName)
        }
      } catch {
        if (current !== token.current) return
        // If the check itself fails the value stays blocked (and the message stays) until it can be verified.
        if (takenRef) {
          takenRef.current[fieldName] = String(value).trim()
          takenRef.current[`${fieldName}Message`] = 'Could not verify availability. Please try again.'
        }
        setError(fieldName, { type: 'manual', message: 'Could not verify availability. Please try again.' })
        onChecked?.(true)
        onTakenChange?.(true)
      } finally {
        if (current === token.current) setChecking(false)
      }
    }, 500)

    return () => {
      clearTimeout(timer)
      if (token.current === current) token.current += 1
    }
  }, [value, isValid, checkFn, message, fieldName, setError, clearErrors, onTakenChange, onChecked, takenRef])

  return checking
}
