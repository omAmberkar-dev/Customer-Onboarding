import { useEffect, useState } from 'react'
import { BadgeCheck, CheckCircle2, MailCheck, MessageCircle, X } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import PhoneField from '../common/PhoneField'
import EmailVerificationPanel from '../vendor-request/EmailVerificationPanel'
import useEmailVerification from '../../hooks/useEmailVerification'
import usePhoneVerification from '../../hooks/usePhoneVerification'
import { checkEmailExists, signupVendor } from '../../api/vendorApi'
import { DEFAULT_COUNTRY_CODE, isValidPhone, joinPhone, phoneRuleFor } from '../../data/countryCodes'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// "Start vendor application": the vendor gives only their contact details (a verified email and a verified phone number).
// The account is created and the login details are emailed; the rest of the application is filled in after signing in.
export default function SignupModal({ open, onClose, onSignedUp, initialEmail = '' }) {
  const [email, setEmail] = useState('')
  const [phoneCode, setPhoneCode] = useState(DEFAULT_COUNTRY_CODE)
  const [phone, setPhone] = useState('')
  const [checking, setChecking] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [created, setCreated] = useState(false)
  const verification = useEmailVerification(email)
  const phoneValid = isValidPhone(phoneCode, phone)
  // Only a complete, valid number can be verified; while it is being edited the verification is dropped.
  const phoneVerification = usePhoneVerification(phoneValid ? joinPhone(phoneCode, phone) : '')

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape' && !submitting) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, submitting])

  // Start clean every time the popup is opened.
  useEffect(() => {
    if (open) return
    setEmail('')
    setPhoneCode(DEFAULT_COUNTRY_CODE)
    setPhone('')
    setEmailError('')
    setSubmitError('')
    setCreated(false)
    verification.reset()
    phoneVerification.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Opened with an email (a vendor starting a new application): fill it in, they still verify it with a code.
  useEffect(() => {
    if (open && initialEmail) setEmail(initialEmail)
  }, [open, initialEmail])

  if (!open) return null

  const emailValid = EMAIL_PATTERN.test(email.trim())
  const canVerify = emailValid && !verification.verified && !verification.pending && !verification.busy && !checking
  const canVerifyPhone = phoneValid && !phoneVerification.verified && !phoneVerification.pending && !phoneVerification.busy
  const canCreate = verification.verified && phoneVerification.verified && !submitting

  // The email must not already belong to an account: say so before a code is sent.
  const sendCode = async () => {
    setEmailError('')
    setChecking(true)
    try {
      if (await checkEmailExists(email)) {
        setEmailError('An account with this email already exists. Please log in instead.')
        return
      }
    } catch {
      setEmailError('We couldn’t check this email right now. Please try again.')
      return
    } finally {
      setChecking(false)
    }
    await verification.send()
  }

  const createAccount = async (event) => {
    event.preventDefault()
    if (!canCreate) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await signupVendor({
        email,
        phone: joinPhone(phoneCode, phone),
        verificationId: verification.verificationId,
        phoneVerificationId: phoneVerification.verificationId,
      })
      setCreated(true)
    } catch (error) {
      if (error.code === 'email_exists') setEmailError(error.message)
      else setSubmitError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy-950/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="signup-title" className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white px-6 pb-6 pt-5 text-[13px] shadow-2xl">
        {created ? (
          <button type="button" onClick={onClose} aria-label="Close" className="interactive-icon absolute right-3 top-3 !min-h-9 !min-w-9">
            <X size={18} />
          </button>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">New customer</p>
              <h2 id="signup-title" className="mt-1 text-lg font-bold leading-6 text-navy-900">Create your customer account</h2>
            </div>
            <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="interactive-icon -mr-2 !min-h-9 !min-w-9">
              <X size={18} />
            </button>
          </div>
        )}

        {created ? (
          <div className="flex flex-col items-center pt-2 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
              <span className="grid size-11 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={26} /></span>
            </span>
            <p className="eyebrow mt-5">Account created</p>
            <h2 id="signup-title" className="mt-1 text-xl font-extrabold tracking-tight text-navy-950">Your account is ready</h2>
            <p className="mt-2 text-[13px] leading-5 text-slate-600">We’ve emailed your login details to</p>
            <p className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-[#dce6ff] bg-brand-50 px-4 py-2 text-[13px] font-bold text-navy-900">
              <MailCheck size={15} className="shrink-0 text-brand-600" aria-hidden="true" />
              <span className="min-w-0 break-all">{email.trim()}</span>
            </p>

            <ol className="mt-5 w-full space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-left" aria-label="What to do next">
              {['Open the email and copy your password.', 'Log in with your email and that password.', 'Complete your customer application. You can save your progress and come back.'].map((step, index) => (
                <li key={step} className="flex items-start gap-3 text-xs leading-5 text-slate-700">
                  <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">It may take a minute to arrive and can land in your spam folder.</p>
            <Button className="mt-5 w-full" onClick={() => onSignedUp(email.trim())}>Go to login</Button>
          </div>
        ) : (
          <form onSubmit={createAccount} noValidate className="mt-3">
            <p className="text-[13px] leading-5 text-slate-600">
              Verify your email and WhatsApp phone number. We’ll email you login details, then you can fill in the rest of your
              application and save your progress as you go.
            </p>

            <div className="mt-4">
              <label htmlFor="signup-email" className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900">
                Email address<span className="ml-1 text-red-600" aria-hidden="true">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  className={`app-field min-w-0 flex-1 ${verification.verified ? 'app-field--locked' : ''}`}
                  value={email}
                  readOnly={verification.verified}
                  onChange={(event) => { setEmail(event.target.value); setEmailError('') }}
                  aria-invalid={Boolean(emailError)}
                  placeholder="you@company.com"
                />
                {verification.verified ? (
                  <>
                    <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                      <BadgeCheck size={14} /> Verified
                    </span>
                    <button type="button" onClick={verification.reset} className="shrink-0 px-1 text-[11px] font-medium text-slate-400 underline underline-offset-2 hover:text-brand-700">Change</button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={!canVerify}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-3 text-xs font-bold text-brand-700 transition hover:border-brand-500 hover:bg-[#dce6ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {checking || (verification.busy && !verification.pending) ? <Loader /> : <MailCheck size={14} />} Verify
                  </button>
                )}
              </div>
              {emailError
                ? <p role="alert" className="mt-1 text-[11px] font-medium text-red-600">{emailError}</p>
                : <p className="mt-1 text-[11px] leading-4 text-slate-500">{verification.verified ? 'Email verified.' : 'We’ll send a 6-digit code to confirm it’s yours.'}</p>}
              <div className="mt-2 empty:hidden"><EmailVerificationPanel email={email.trim()} verification={verification} /></div>
            </div>

            <div className="mt-4">
              <label htmlFor="signup-phone" className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900">
                Phone number<span className="ml-1 text-red-600" aria-hidden="true">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PhoneField
                    id="signup-phone"
                    codeId="signup-phone-code"
                    code={phoneCode}
                    onCodeChange={(code) => { setPhoneCode(code); setPhone((current) => current.slice(0, phoneRuleFor(code).max)) }}
                    inputProps={{ value: phone, onChange: (event) => setPhone(event.target.value), name: 'signupPhone' }}
                    onNumberReplace={setPhone}
                    invalid={Boolean(phone) && !phoneValid}
                    required
                  />
                </div>
                {phoneVerification.verified ? (
                  <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
                    <BadgeCheck size={14} /> Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={phoneVerification.send}
                    disabled={!canVerifyPhone}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-3 text-xs font-bold text-brand-700 transition hover:border-brand-500 hover:bg-[#dce6ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {phoneVerification.busy && !phoneVerification.pending ? <Loader /> : <MessageCircle size={14} />} Verify
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {phone && !phoneValid
                  ? phoneRuleFor(phoneCode).message
                  : phoneVerification.verified
                    ? 'Phone number verified.'
                    : `${phoneCode === '+91' ? '10-digit mobile number' : 'Number without the country code'}. We’ll send a 6-digit code on WhatsApp.`}
              </p>
              <div className="mt-2 empty:hidden">
                <EmailVerificationPanel
                  verification={phoneVerification}
                  Icon={MessageCircle}
                  message={(
                    <span>
                      We sent a 6-digit code on WhatsApp to <strong className="text-navy-900">{joinPhone(phoneCode, phone)}</strong>. Enter it below.
                      It may take a minute to arrive.
                    </span>
                  )}
                />
              </div>
            </div>

            {submitError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{submitError}</p>}

            <Button type="submit" className="mt-5 w-full" disabled={!canCreate}>
              {submitting ? <><Loader /> Creating your account…</> : 'Create account'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
