import Input from '../common/Input'
import SelectMenu from '../common/SelectMenu'
import FormSection from './FormSection'
import { VERIFIED_CHIP, VerifyButton } from './VerifyControls'
import { DEMAT_EXAMPLES, DEPOSITORIES } from '../../utils/demat'

// The vendor's demat account, if they have one: all optional, but any ID needs its depository. Verifying the Demat ID fills in
// the DP ID, BO ID and depository (useDematVerification, kept by the page). Locked, like the vendor information, until the
// contact details are done.
export default function DematDetails({ register, errors, watch, setValue, demat, disabled = false }) {
  const example = DEMAT_EXAMPLES[watch('depository')] || DEMAT_EXAMPLES['']
  const dematIdFilled = Boolean(watch('dematId')?.trim())
  const dematHint = demat.verified ? demat.message : demat.loading ? 'Verifying the Demat ID…' : '8–16 letters or digits. Verify to fill in the DP ID, BO ID and depository.'

  return (
    <FormSection title="Demat account details" description="The customer’s demat account, if they have one. All fields are optional.">
      <fieldset disabled={disabled} className={`vr-grid vr-fieldset ${disabled ? 'vr-dim' : ''}`}>
        <Input
          className="vr-field"
          label="Demat ID"
          name="dematId"
          register={register}
          error={errors.dematId || (demat.failed ? { message: demat.message } : undefined)}
          hint={dematHint}
          placeholder="12081600"
          maxLength={20}
          autoComplete="off"
          action={demat.verified ? VERIFIED_CHIP : (
            <VerifyButton onClick={demat.verify} busy={demat.loading} disabled={!dematIdFilled} label="Verify Demat ID" />
          )}
        />
        <Input
          className="vr-field"
          label="Depository Participant ID (DP ID)"
          name="dpId"
          register={register}
          error={errors.dpId}
          hint="8 letters or digits"
          placeholder={example.dpId}
          maxLength={10}
          autoComplete="off"
        />
        <Input
          className="vr-field"
          label="Beneficial Owner ID (BO ID)"
          name="boId"
          register={register}
          error={errors.boId}
          hint="16 letters or digits"
          placeholder={example.boId}
          maxLength={20}
          autoComplete="off"
        />
        <SelectMenu
          className="vr-field"
          label="Depository"
          name="depository"
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors.depository}
          options={DEPOSITORIES}
          placeholder="Select depository"
        />
      </fieldset>
    </FormSection>
  )
}
