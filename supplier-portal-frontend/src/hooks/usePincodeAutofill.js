import { useEffect, useRef, useState } from 'react'
import { lookupPincode } from '../api/vendorApi'

export const PIN_PATTERN =/^[1-9]\d{5}$/

// Looks up a complete 6-digit PIN code and hands City and District to `apply({ city?, district? })`.
// A field is only filled when it is empty or still holds what the previous lookup put there, so anything the
// vendor typed themselves is left alone. `getCurrent()` must return the current { city, district }.
// Returns 'idle' | 'loading' | 'found' | 'notfound' | 'error'.
export default function usePincodeAutofill({ pincode, getCurrent, apply, enabled = true }) {
  const [status, setStatus] = useState('idle')
  const lastFilled = useRef({})
  const latest = useRef({ getCurrent, apply })

  useEffect(() => {
    latest.current = { getCurrent, apply }
  })

  useEffect(() => {
    if (!enabled || !PIN_PATTERN.test(pincode)) {
      setStatus('idle')
      return undefined
    }

    let cancelled = false
    setStatus('loading')
    lookupPincode(pincode)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setStatus('notfound')
          return
        }
        const current = latest.current.getCurrent()
        const fill = {}
        ;['city', 'district'].forEach((field) => {
          const value = String(current[field] ?? '').trim()
          if (!value || value === lastFilled.current[field]) fill[field] = result[field]
        })
        lastFilled.current = { ...lastFilled.current, ...fill }
        if (Object.keys(fill).length > 0) latest.current.apply(fill)
        setStatus('found')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [pincode, enabled])

  return status
}

export const pincodeStatusHint = {
  loading: 'Looking up city and district…',
  notfound: 'PIN code not found. Enter the city and district manually.',
  error: 'Could not look up this PIN code. Enter the city and district manually.',
}
