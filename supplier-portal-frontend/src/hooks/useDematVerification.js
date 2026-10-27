import { useEffect, useRef, useState } from 'react'
import { verifyIdentity } from '../api/vendorApi'
import { DEMAT_RULES, dematText } from '../utils/demat'

const IDLE = { loading: false, dematId: '', verified: false, failed: false, message: '' }
const NOT_FOUND = 'No Demat details found for this Demat ID.'
// The backend's fill (column names) -> the form's fields.
const FILLED = { dp_id: 'dpId', bo_id: 'boId', depository: 'depository' }

// The Verify beside the Demat ID: the backend looks the Demat ID up with the demat service and, when an account is found under
// exactly that ID, fills its DP ID, BO ID and depository (all still editable). Verifying is optional: it only saves typing.
// One lookup at a time; an answer for a Demat ID that has since been edited is dropped, and editing a verified Demat ID undoes
// the check (not the values it filled). Lives on the page so the result survives moving between steps.
export default function useDematVerification({ watch, setValue, clearErrors }) {
  const dematId = dematText(watch('dematId'))
  const [check, setCheck] = useState(IDLE)
  const inFlight = useRef(false)
  const current = useRef(dematId)
  current.current = dematId

  const verify = async () => {
    if (inFlight.current || !dematId) return
    const [pattern, invalid] = DEMAT_RULES.dematId
    if (!pattern.test(dematId)) {
      setCheck({ ...IDLE, dematId, failed: true, message: `${invalid}.` })
      return
    }
    inFlight.current = true
    setCheck({ ...IDLE, dematId, loading: true })
    clearErrors('dematId')
    try {
      const result = await verifyIdentity('DEMAT', dematId)
      if (current.current !== dematId) return setCheck(IDLE)
      if (!result.verified) return setCheck({ ...IDLE, dematId, failed: true, message: result.message || NOT_FOUND })
      const options = { shouldDirty: true, shouldValidate: true }
      setValue('dematId', dematId, options)
      Object.entries(FILLED).forEach(([key, name]) => result.fill?.[key] && setValue(name, result.fill[key], options))
      setCheck({ ...IDLE, dematId, verified: true, message: result.message })
    } catch (err) {
      setCheck(current.current === dematId ? { ...IDLE, dematId, failed: true, message: err.message || 'The Demat ID could not be verified. Please try again.' } : IDLE)
    } finally {
      inFlight.current = false
    }
  }

  // The Demat ID was edited after a check: that check no longer stands.
  useEffect(() => {
    setCheck((c) => (!c.loading && c.dematId && c.dematId !== dematId ? IDLE : c))
  }, [dematId])

  return { ...check, verified: check.verified && check.dematId === dematId, verify }
}
