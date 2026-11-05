import { useState } from 'react'
import { Eye, EyeOff, ShieldAlert } from 'lucide-react'
import Input from '../common/Input'
import FormSection from './FormSection'

export default function BankDetails({ register, errors }) {
  const [showAccountNumber, setShowAccountNumber] = useState(false)

  return (
    <FormSection title="Bank details" description="Used to pay your invoices. Your progress is saved to your account, not to this browser.">
      <p className="vr-note info">
        <ShieldAlert size={16} aria-hidden="true" />
        <span>Double-check the account number and IFSC code: they must match your bank proof exactly.</span>
      </p>
      {/* LAS's order: holder, bank and IFSC on the first line; the account number and the branch on the next. */}
      <div className="vr-grid">
        <Input
          className="vr-field"
          label="Account holder name"
          name="accountHolderName"
          register={register}
          error={errors.accountHolderName}
          autoComplete="off"
          required
        />
        <Input
          className="vr-field"
          label="Bank name"
          name="bankName"
          register={register}
          error={errors.bankName}
          autoComplete="off"
          required
        />
        <Input
          className="vr-field"
          label="IFSC code"
          name="ifsc"
          register={register}
          error={errors.ifsc}
          hint="11 characters, e.g. HDFC0001234"
          required
        />
        <Input
          className="vr-field"
          label="Account number"
          name="accountNumber"
          type={showAccountNumber ? 'text' : 'password'}
          inputMode="numeric"
          register={register}
          error={errors.accountNumber}
          autoComplete="new-password"
          endAdornment={(
            <button
              type="button"
              onClick={() => setShowAccountNumber((current) => !current)}
              className="interactive-icon min-h-9 min-w-9"
              aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
              title={showAccountNumber ? 'Hide account number' : 'Show account number'}
            >
              {showAccountNumber ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          )}
          required
        />
        <Input className="vr-field" label="Branch name" name="branchName" register={register} error={errors.branchName} required />
      </div>
    </FormSection>
  )
}
