import { MapPin, Receipt } from 'lucide-react'
import Input from '../common/Input'
import FormSection from './FormSection'
import AddressFields from './AddressFields'
import { useFlag } from '../../context/flags-context'
import { isCompanyType } from '../../data/vendorTypes'

export default function AddressDetails({ register, errors, watch, setValue, lockedFields = [] }) {
  const vendorType = watch('vendorType')
  const cinFlagged = Boolean(useFlag('cin'))
  const showCin = cinFlagged || isCompanyType(vendorType)

  return (
    <div className="space-y-3">
      <FormSection
        icon={MapPin}
        title="Registered address"
        description="Enter the address shown on the customer’s official registration."
      >
        <AddressFields prefix="registered" register={register} errors={errors} watch={watch} setValue={setValue} lockedFields={lockedFields} />
      </FormSection>
      {showCin && (
        <FormSection
          icon={Receipt}
          title="Compliance information"
          description="Additional registration details required for incorporated entities."
        >
          <div className="form-grid">
            <Input label="CIN" name="cin" register={register} error={errors.cin} maxLength={21} style={{ textTransform: 'uppercase' }} hint="21-character corporate identification number" />
          </div>
        </FormSection>
      )}
    </div>
  )
}
