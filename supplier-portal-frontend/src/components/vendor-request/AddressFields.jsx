import Input from '../common/Input'
import SelectMenu from '../common/SelectMenu'
import { indianStates } from '../../data/mockData'
import usePincodeAutofill, { pincodeStatusHint } from '../../hooks/usePincodeAutofill'

export default function AddressFields({ prefix, register, errors, watch, setValue, lockedFields = [] }) {
  const cityName = `${prefix}City`
  const districtName = `${prefix}District`
  const postalName = `${prefix}PostalCode`

  // City and District are filled in from the PIN code, but stay editable.
  const pincodeStatus = usePincodeAutofill({
    pincode: String(watch(postalName) ?? '').trim(),
    getCurrent: () => ({ city: watch(cityName), district: watch(districtName) }),
    apply: ({ city, district }) => {
      if (city) setValue(cityName, city, { shouldDirty: true, shouldValidate: true })
      if (district) setValue(districtName, district, { shouldDirty: true, shouldValidate: true })
    },
  })

  return (
    // LAS's order: the address across two columns with the PIN code beside it (it fills in what follows), then
    // district, city and state. Two columns on a tablet, one on a phone.
    <div className="vr-grid">
      <Input
        className="vr-field vr-span-2"
        label="Address"
        name={`${prefix}Address1`}
        register={register}
        error={errors[`${prefix}Address1`]}
        hint={lockedFields.includes(`${prefix}Address1`) ? 'Filled automatically from GSTIN verification' : undefined}
        locked={lockedFields.includes(`${prefix}Address1`)}
        required
      />
      <Input
        className="vr-field vr-narrow"
        label="Postal / PIN code"
        name={postalName}
        register={register}
        error={errors[postalName]}
        inputMode="numeric"
        hint={pincodeStatusHint[pincodeStatus] || (lockedFields.includes(postalName) ? 'Filled automatically from GSTIN verification' : 'City and district fill in from the PIN code')}
        locked={lockedFields.includes(postalName)}
        required
      />
      <Input
        className="vr-field"
        label="District / County"
        name={districtName}
        register={register}
        error={errors[districtName]}
        required
      />
      <Input
        className="vr-field"
        label="City"
        name={cityName}
        register={register}
        error={errors[cityName]}
        required
      />
      <SelectMenu
        className="vr-field"
        label="State"
        name={`${prefix}State`}
        register={register}
        watch={watch}
        setValue={setValue}
        error={errors[`${prefix}State`]}
        options={indianStates}
        locked={lockedFields.includes(`${prefix}State`)}
        required
      />
    </div>
  )
}
