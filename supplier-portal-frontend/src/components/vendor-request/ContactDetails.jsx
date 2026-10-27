import { BadgeCheck, Phone } from 'lucide-react'
import Input from '../common/Input'
import PhoneInput from '../common/PhoneInput'
import FormSection from './FormSection'

// The contact details given at signup. The email was verified then and is the login name, so it can't be changed
// here; the phone number can.
export default function ContactDetails({ register, errors, watch, setValue }) {
  return (
    <FormSection icon={Phone} title="Contact details" description="Your email was verified when you signed up. You can update your phone number.">
      <div className="grid gap-x-3.5 gap-y-3 sm:grid-cols-2">
        <Input
          label="Email address"
          name="vendorEmail"
          type="email"
          register={register}
          error={errors.vendorEmail}
          hint="This is your login email and can’t be changed."
          locked
          required
          action={(
            <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
              <BadgeCheck size={14} /> Verified
            </span>
          )}
        />
        <PhoneInput
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
