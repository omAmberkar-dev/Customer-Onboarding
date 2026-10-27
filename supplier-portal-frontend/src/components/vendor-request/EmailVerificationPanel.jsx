import { useEffect, useState } from 'react'
import { MailCheck, RefreshCw } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'

const CODE_PATTERN = /^\d{6}$/

// 37s, then minutes once it is long (a rate limit can be close to an hour).
const waitText = (seconds) => (seconds > 90 ? `${Math.ceil(seconds / 60)} min` : `${seconds}s`)

// Shown under the email field while a code is pending (or a verification just failed). The code can be typed here,
// or the link in the email opened on any device: the status is polled, so this panel disappears either way.
// The phone field reuses it: `message` replaces the "we sent a code to <email>" text and `Icon` the mail icon.
export default function EmailVerificationPanel({ email, verification, message, Icon = MailCheck }) {
  const { pending, busy, error, attemptsRemaining, resendAt, send, submitCode } = verification
  const [code, setCode] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (resendAt <= Date.now()) return undefined
    const timer = setInterval(() => {
      const tick = Date.now()
      setNow(tick)
      if (tick >= resendAt) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [resendAt])

  if (!pending && !error) return null

  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const confirm = () => {
    if (CODE_PATTERN.test(code) && !busy) submitCode(code)
  }
  const resend = async () => {
    setCode('')
    await send()
  }

  return (
    <div className="col-span-full rounded-lg border border-[#dce6ff] bg-[#f7f9fc] px-3 py-3" aria-live="polite">
      {pending && (
        <>
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-700">
            <Icon size={16} className="mt-0.5 shrink-0 text-brand-600" />
            {message ?? (
              <span>
                We sent a 6-digit code to <strong className="break-all text-navy-900">{email}</strong>. Enter it below, or open the link in that email.
                It may take a minute and can land in spam.
              </span>
            )}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <input
              className="app-field min-w-0 flex-1 text-center font-mono text-base tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              aria-label="6-digit verification code"
              aria-invalid={attemptsRemaining != null}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault() // would otherwise submit the whole request form
                confirm()
              }}
            />
            <Button type="button" className="shrink-0 justify-center whitespace-nowrap px-5" onClick={confirm} disabled={busy || !CODE_PATTERN.test(code)}>
              {busy ? <><Loader /> Checking...</> : 'Confirm code'}
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#dce6ff] pt-2.5">
            <span className="text-xs text-slate-500">Didn&rsquo;t get the code?</span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#b3c3e4] bg-white px-3 py-1 text-xs font-semibold text-brand-700 transition hover:border-brand-600 hover:bg-[#eef2fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
              onClick={resend}
              disabled={busy || waitSeconds > 0}
            >
              <RefreshCw size={12} aria-hidden="true" />
              {waitSeconds > 0 ? `Resend in ${waitText(waitSeconds)}` : 'Resend code'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className={`text-xs font-medium text-red-600 ${pending ? 'mt-2' : ''}`}>
          {error}
          {pending && attemptsRemaining != null && ` ${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt' : 'attempts'} left.`}
        </p>
      )}
      {/* No code is pending (it expired, was locked or replaced): one click sends a fresh one and brings the code box back. */}
      {!pending && error && (
        <Button type="button" variant="secondary" className="mt-2.5 w-full justify-center" onClick={resend} disabled={busy || waitSeconds > 0}>
          {busy ? <><Loader /> Sending...</> : <><RefreshCw size={14} aria-hidden="true" /> {waitSeconds > 0 ? `Send a new code in ${waitText(waitSeconds)}` : 'Send a new code'}</>}
        </Button>
      )}
    </div>
  )
}
