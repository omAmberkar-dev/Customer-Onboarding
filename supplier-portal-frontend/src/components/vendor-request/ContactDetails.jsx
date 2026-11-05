import Input from '../common/Input'
import PhoneInput from '../common/PhoneInput'
import FormSection from './FormSection'
import { VERIFIED_CHIP } from './VerifyControls'

// The contact details given at signup. The email was verified then and is the login name, so it can't be changed
// here; the phone number can.
export default function ContactDetails({ register, errors, watch, setValue }) {
  return (
    <FormSection title="Contact details" description="Your email was verified when you signed up. You can update your phone number.">
      <div className="vr-grid">
        <Input
          className="vr-field"
          label="Email address"
          name="vendorEmail"
          type="email"
          register={register}
          error={errors.vendorEmail}
          hint="This is your login email and can’t be changed."
          locked
          required
          action={VERIFIED_CHIP}
        />
        <PhoneInput
          className="vr-field"
          label="Phone number"
          name="vendorPhone"
          codeName="vendorPhoneCode"
          register={register}
          watch={watch}
          setValue={setValue}
          error={errors.vendorPhone}
          hint={watch('vendorPhoneCode') === '+91' ? '10-digit mobile number' : 'Number without the country code'}
          required
        />
      </div>
    </FormSection>
  )
}
