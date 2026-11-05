import FormSection from './FormSection'
import AddressFields from './AddressFields'

export default function AddressDetails({ register, errors, watch, setValue, lockedFields = [] }) {
  return (
    <FormSection title="Registered address" description="Enter the address shown on the customer’s official registration.">
      <AddressFields prefix="registered" register={register} errors={errors} watch={watch} setValue={setValue} lockedFields={lockedFields} />
    </FormSection>
  )
}
