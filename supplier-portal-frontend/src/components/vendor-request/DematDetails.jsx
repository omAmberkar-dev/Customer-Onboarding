import { Wallet } from 'lucide-react'
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
    <FormSection icon={Wallet} title="Demat account details" description="The customer’s demat account, if they have one. All fields are optional.">
      <fieldset disabled={disabled} className={`grid min-w-0 gap-x-3.5 gap-y-2.5 transition-opacity md:grid-cols-3 ${disabled ? 'opacity-50' : ''}`}>
        <Input
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
