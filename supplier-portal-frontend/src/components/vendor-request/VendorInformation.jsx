import { useEffect, useRef } from 'react'
import { Lock } from 'lucide-react'
import Input from '../common/Input'
import AadhaarInput from '../common/AadhaarInput'
import SelectMenu from '../common/SelectMenu'
import FormSection from './FormSection'
import { VERIFIED_CHIP, VerifyButton } from './VerifyControls'
import { currencies, relationshipManagers } from '../../data/mockData'
import { checkPanExists, lookupPincode, verifyGstin } from '../../api/vendorApi'
import useDuplicateCheck from '../../hooks/useDuplicateCheck'
import { PIN_PATTERN } from '../../hooks/usePincodeAutofill'
import { useFlag } from '../../context/flags-context'
import { PAN_TAKEN_MESSAGE } from '../../utils/constants'
import { indianStates } from '../../data/mockData'
import { VENDOR_TYPES, cinApplies } from '../../data/vendorTypes'

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export default function VendorInformation({ register, errors, watch, setValue, setError, clearErrors, lockedFields = [], disabled = false, gstLookup, setGstLookup, onGstLookupSuccess, onPanTakenChange, onPanCheckingChange, takenRef, identity }) {
  const msmeStatus = watch('msmeStatus')
  // An Udyam number the reviewer flagged must be editable whatever the MSME status currently says.
  const udyamFlagged = Boolean(useFlag('udyamNumber'))
  // CIN follows the MSME status (asked for unless registered), and stays editable whatever it says once the reviewer flagged it.
  const cinFlagged = Boolean(useFlag('cin'))
  const pan = watch('pan')?.trim().toUpperCase() || ''
  const gstin = watch('gstin')?.trim().toUpperCase() || ''
  const aadhaarFilled = Boolean(watch('aadhaar')?.replace(/\D/g, ''))
  // With the new verification on, the GSTIN is verified when the backend has confirmed this exact value. In legacy mode
  // gstLookup (kept by the page, so it survives moving between steps) holds the GSTIN that was looked up, and is cleared
  // again if the GSTIN is changed.
  const gstVerified = identity.enabled ? identity.isVerified('GSTIN') : Boolean(gstLookup.gstin) && gstLookup.gstin === gstin
  // The PAN is not typed: it comes from the verified GSTIN and is shown greyed out, like the legal name.
  const panFromGstin = identity.enabled
  const failureOf = (service) => (identity.failure(service) ? { message: identity.failure(service) } : undefined)
  const needsVerify = (service, label, filled, hint) => (identity.enabled && filled && identity.pending.includes(service) ? `Verify the ${label} to continue.` : hint)

  // City and District come from the GSTIN's PIN code, right after the lookup rather than once the vendor reaches the
  // address step. They stay editable. A failed PIN lookup is silent: the address step retries it and tells the vendor.
  const cityLookupToken = useRef(0)
  const fillCityAndDistrict = async (pincode, token) => {
    if (!PIN_PATTERN.test(pincode)) return
    try {
      const place = await lookupPincode(pincode)
      if (!place || token !== cityLookupToken.current) return
      setValue('registeredCity', place.city, { shouldDirty: true, shouldValidate: true })
      setValue('registeredDistrict', place.district, { shouldDirty: true, shouldValidate: true })
    } catch {
      // Nothing to do: see above.
    }
  }

  // Puts what a verified GSTIN returned into the form and locks those fields, then fills City / District from the PIN.
  const applyGstDetails = (verifiedGstin, { legalName, address, state, postalCode, pan: gstPan }, message) => {
    const appliedFields = []
    setValue('gstin', verifiedGstin, { shouldDirty: true, shouldValidate: true })
    if (legalName) {
      setValue('vendorLegalName', legalName, { shouldDirty: true, shouldValidate: true })
      appliedFields.push('vendorLegalName')
    }
    if (address) {
      setValue('registeredAddress1', address, { shouldDirty: true, shouldValidate: true })
      appliedFields.push('registeredAddress1')
    }
    if (state) {
      setValue('registeredState', state, { shouldDirty: true, shouldValidate: true })
      appliedFields.push('registeredState')
    }
    if (postalCode) {
      setValue('registeredPostalCode', postalCode, { shouldDirty: true, shouldValidate: true })
      appliedFields.push('registeredPostalCode')
    }
    if (gstPan) setValue('pan', gstPan, { shouldDirty: true, shouldValidate: true })
    clearErrors(['gstin', 'pan', 'vendorLegalName', 'registeredAddress1', 'registeredState', 'registeredPostalCode'])
    onGstLookupSuccess?.(appliedFields)
    setGstLookup({ loading: false, gstin: verifiedGstin, message })
    fillCityAndDistrict(postalCode, ++cityLookupToken.current)
  }

  const handleGstVerify = async () => {
    setGstLookup({ loading: true, gstin: '', message: '' })
    clearErrors('gstin')
    const result = await identity.verify('GSTIN')
    if (!result) {
      setGstLookup({ loading: false, gstin: '', message: '' })
      return
    }
    const { fill } = result
    applyGstDetails(gstin, {
      legalName: fill.vendor_legal_name,
      address: fill.street,
      state: indianStates.includes(fill.state) ? fill.state : '',
      postalCode: fill.postal_code,
      pan: fill.pan,
    }, 'GSTIN verified. Details are locked.')
  }

  const handleLegacyGstLookup = async () => {
    if (!GSTIN_PATTERN.test(gstin)) {
      setError('gstin', { type: 'manual', message: 'Enter a valid 15-character GSTIN before verifying.' })
      return
    }

    setGstLookup({ loading: true, gstin: '', message: '' })
    clearErrors('gstin')

    try {
      const result = await verifyGstin(gstin)
      const details = result.data
      const address = [details.addrBnm, details.addrBno, details.addrSt, details.addrLoc]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ')

      const verifiedGstin = result.gstin || details.gstin || gstin
      const legalName = details.tradeName || details.legalName || ''
      const state = details.stateCode || ''
      const postalCode = String(details.addrPncd || '')
      const appliedFields = []

      setValue('gstin', verifiedGstin, { shouldDirty: true, shouldValidate: true })
      if (legalName) {
        setValue('vendorLegalName', legalName, { shouldDirty: true, shouldValidate: true })
        appliedFields.push('vendorLegalName')
      }
      if (address) {
        setValue('registeredAddress1', address, { shouldDirty: true, shouldValidate: true })
        appliedFields.push('registeredAddress1')
      }
      if (state) {
        setValue('registeredState', state, { shouldDirty: true, shouldValidate: true })
        appliedFields.push('registeredState')
      }
      if (postalCode) {
        setValue('registeredPostalCode', postalCode, { shouldDirty: true, shouldValidate: true })
        appliedFields.push('registeredPostalCode')
      }
      clearErrors(['gstin', 'vendorLegalName', 'registeredAddress1', 'registeredState', 'registeredPostalCode'])
      onGstLookupSuccess?.(appliedFields)
      setGstLookup({ loading: false, gstin: verifiedGstin, message: result.message || 'GSTIN details applied. Verified fields are locked.' })
      fillCityAndDistrict(postalCode, ++cityLookupToken.current)
    } catch (lookupError) {
      const message = lookupError?.message || 'GSTIN verification failed. Please try again.'
      setError('gstin', { type: 'manual', message })
      setGstLookup({ loading: false, gstin: '', message: '' })
    }
  }

  // The legal name and address were filled from one GSTIN. Change or remove that GSTIN and they no longer
  // belong to it, so they are cleared (to be filled again by a lookup of the new GSTIN).
  useEffect(() => {
    if (!gstLookup.gstin || gstLookup.gstin === gstin) return
    cityLookupToken.current += 1 // a PIN lookup still in flight belongs to the old GSTIN
    // The PAN came from the GSTIN too (new verification), so it goes with it.
    const cleared = ['vendorLegalName', 'registeredAddress1', 'registeredCity', 'registeredDistrict', 'registeredState', 'registeredPostalCode', ...(identity.enabled ? ['pan'] : [])]
    cleared.forEach((name) => setValue(name, '', { shouldDirty: true }))
    // Nothing said about the old values (errors, "already exists", a PAN verification failure) applies to the empty fields.
    clearErrors(cleared)
    if (identity.enabled) {
      if (takenRef) takenRef.current = { ...takenRef.current, pan: '', panMessage: '' }
      onPanTakenChange?.(false)
    }
    setGstLookup({ loading: false, gstin: '', message: '' })
  }, [gstin, gstLookup.gstin, setGstLookup, setValue, clearErrors, onPanTakenChange, takenRef, identity.enabled])

  const checkingPan = useDuplicateCheck({
    value: pan,
    isValid: PAN_PATTERN.test(pan),
    checkFn: checkPanExists,
    message: PAN_TAKEN_MESSAGE,
    fieldName: 'pan',
    setError,
    clearErrors,
    onTakenChange: onPanTakenChange,
    onCheckingChange: onPanCheckingChange,
    takenRef,
  })

  return (
    <FormSection title="Customer information" description="Provide the customer’s legal and commercial profile.">
      {disabled && (
        <p role="status" className="vr-note">
          <Lock size={14} aria-hidden="true" />
          Enter a valid phone number above to fill in the customer information.
        </p>
      )}
      {/* A disabled fieldset disables every native control inside it, including the custom selects. */}
      {/* LAS's order, three to a row: GSTIN (its check fills the legal name, PAN and address), PAN, Aadhaar / legal name,
          registration no. / type, year, currency / MSME, CIN or Udyam, relationship manager. */}
      <fieldset disabled={disabled} className={`vr-grid vr-fieldset ${disabled ? 'vr-dim' : ''}`}>
        <Input
          className="vr-field"
          label="GSTIN"
          name="gstin"
          register={register}
          error={errors.gstin || failureOf('GSTIN')}
          hint={gstVerified && gstLookup.gstin === gstin && gstLookup.message ? gstLookup.message : needsVerify('GSTIN', 'GSTIN', Boolean(gstin), identity.enabled ? 'Verify to auto-fill legal name, address and PAN.' : '15-character GST identification number, if applicable')}
          locked={lockedFields.includes('gstin')}
          action={gstVerified ? VERIFIED_CHIP : (
            <VerifyButton
              onClick={identity.enabled ? handleGstVerify : handleLegacyGstLookup}
              busy={gstLookup.loading || identity.isBusy('GSTIN')}
              disabled={!gstin}
              label="Verify GSTIN"
            />
          )}
        />
        <Input
          className="vr-field"
          label="PAN"
          name="pan"
          register={register}
          error={errors.pan || failureOf('PAN')}
          hint={checkingPan ? 'Checking availability…' : identity.enabled ? (identity.isVerified('PAN') ? 'PAN verified.' : needsVerify('PAN', 'PAN', Boolean(pan), 'Filled automatically from GSTIN verification')) : 'Format: ABCDE1234F'}
          locked={panFromGstin}
          action={identity.enabled ? (identity.isVerified('PAN') ? VERIFIED_CHIP : pan ? (
            <VerifyButton onClick={() => identity.verify('PAN')} busy={identity.isBusy('PAN')} label="Verify PAN" />
          ) : undefined) : undefined}
          required
        />
        <AadhaarInput
          className="vr-field"
          label="Aadhaar number"
          name="aadhaar"
          register={register}
          error={errors.aadhaar || failureOf('AADHAAR')}
          hint={identity.enabled && aadhaarFilled && identity.isVerified('AADHAAR') ? 'Aadhaar number verified.' : needsVerify('AADHAAR', 'Aadhaar number', aadhaarFilled, '12-digit Aadhaar number, if applicable')}
          action={identity.enabled ? (identity.isVerified('AADHAAR') ? VERIFIED_CHIP : (
            <VerifyButton onClick={() => identity.verify('AADHAAR')} busy={identity.isBusy('AADHAAR')} disabled={!aadhaarFilled} label="Verify Aadhaar number" />
          )) : undefined}
        />
        <Input
          className="vr-field vr-span-2"
          label="Customer legal name"
          name="vendorLegalName"
          register={register}
          error={errors.vendorLegalName}
          hint={lockedFields.includes('vendorLegalName') ? 'Filled automatically from GSTIN verification' : undefined}
          locked={lockedFields.includes('vendorLegalName')}
          required
        />
        <Input
          className="vr-field"
          label="Company registration number"
          name="registrationNumber"
          register={register}
          error={errors.registrationNumber}
          required
        />
        <SelectMenu
          className="vr-field"
          label="Customer type"
          name="vendorType"
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors.vendorType}
          options={VENDOR_TYPES}
          required
        />
        <Input
          className="vr-field vr-narrow"
          label="Year established"
          name="yearEstablished"
          inputMode="numeric"
          register={register}
          error={errors.yearEstablished}
          placeholder="2014"
        />
        <SelectMenu
          className="vr-field"
          label="Transaction currency"
          name="currency"
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors.currency}
          options={currencies}
          required
        />
        <SelectMenu
          className="vr-field"
          label="MSME status"
          name="msmeStatus"
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors.msmeStatus}
          options={['Registered', 'Not registered', 'Not applicable']}
          required
        />
        {(cinApplies(msmeStatus) || cinFlagged) && (
          <Input
            className="vr-field"
            label="CIN"
            name="cin"
            maxLength={21}
            register={register}
            error={errors.cin}
            style={{ textTransform: 'uppercase' }}
            hint="21-character corporate identification number"
            required={cinApplies(msmeStatus)}
          />
        )}
        {(msmeStatus === 'Registered' || udyamFlagged) && (
          <Input
            className="vr-field"
            label="MSME / Udyam registration number"
            name="udyamNumber"
            maxLength={30}
            register={register}
            error={errors.udyamNumber}
            required
          />
        )}
        <SelectMenu
          className="vr-field"
          label="Relationship manager"
          name="assignedRm"
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors.assignedRm}
          options={relationshipManagers}
          placeholder="Select RM"
        />
      </fieldset>
    </FormSection>
  )
}
