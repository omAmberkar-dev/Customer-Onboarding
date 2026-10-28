import { MapPin } from 'lucide-react'
import FormSection from './FormSection'
import AddressFields from './AddressFields'

export default function AddressDetails({ register, errors, watch, setValue, lockedFields = [] }) {
  return (
    <div className="space-y-3">
      <FormSection
        icon={MapPin}
        title="Registered address"
        description="Enter the address shown on the customer’s official registration."
      >
        <AddressFields prefix="registered" register={register} errors={errors} watch={watch} setValue={setValue} lockedFields={lockedFields} />
      </FormSection>
    </div>
  )
}
