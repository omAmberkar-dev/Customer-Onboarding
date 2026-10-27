import { useEffect, useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, FileCheck2, Mail, MessageSquareWarning, PenLine, RefreshCw, ShieldCheck, UserCheck } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import SignatureInput from './SignatureInput'
import AgreementSummaryCard from './AgreementSummaryCard'
import SignedPreviewPane from './SignedPreviewPane'
import { getAgreementCodeStatus, sendAgreementCode, signAgreement, verifyAgreementCode } from '../../api/vendorApi'
import { SMALL_BUTTON, keyTermTiles } from './agreementUtils'

const CODE_POLL_MS = 4000
const label = 'mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900'

// One step of the vertical stepper: a numbered badge on a rail, a title with its helper, then the content.
const Section = ({ number, title, helper, last = false, children }) => (
  <li className="relative pl-11">
    <span className="absolute left-0 top-0 grid size-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{number}</span>
    {!last && <span className="absolute -bottom-6 left-[13px] top-8 w-px bg-slate-200" aria-hidden="true" />}
    <h3 className="text-sm font-bold leading-7 text-navy-900">{title}</h3>
    {helper && <p className="-mt-0.5 text-xs leading-5 text-slate-500">{helper}</p>}
    <div className="mt-3">{children}</div>
  </li>
)

// Signer name and designation, the signature, the one-time code and the Sign button (in a sticky footer). `canSign`
// says whether the steps before this one are done; `onStale` is called when the agreement can no longer be signed and
// the vendor asks to refresh. With `fill` the agreement is shown beside the form and fills in live as the vendor types and
// signs. "Sign agreement" opens a final review of the agreement (with its certificate page); nothing is signed until the
// vendor confirms there, and then `onSigned` runs.
export default function AgreementSignPanel({ agreement, vendorName = '', canSign = true, blockedNote = '', onSigned, onStale, onDecline, footerStart = null, fill = false, onReviewingChange = null }) {
  const agreementId = agreement.agreement_id
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState('')
  const [signature, setSignature] = useState(null)
  const [sentTo, setSentTo] = useState('')
  const [otp, setOtp] = useState('')
  const [verified, setVerified] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => {
    onReviewingChange?.(reviewing)
    return () => onReviewingChange?.(false)
  }, [reviewing]) // eslint-disable-line react-hooks/exhaustive-deps
  const [codeError, setCodeError] = useState('')
  const [signError, setSignError] = useState('')
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (countdown <= 0) return undefined
    const tick = setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => clearTimeout(tick)
  }, [countdown])

  // The email carries the code and a link; opening the link confirms the address too (the shared service records it). While a code is
  // pending, ask now and then - and when the tab is shown again - so the step completes by itself, whether the link was opened on this
  // device or another. A missed check is simply asked again.
  useEffect(() => {
    if (!sentTo || verified || stale) return undefined
    let ignore = false
    const check = () => {
      if (document.visibilityState !== 'visible') return
      getAgreementCodeStatus(agreementId)
        .then((result) => { if (!ignore && result?.verified) { setVerified(true); setCodeError('') } })
        .catch(() => {})
    }
    const timer = setInterval(check, CODE_POLL_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      ignore = true
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [sentTo, verified, stale, agreementId])

  const sendCode = async () => {
    setSending(true)
    setCodeError('')
    setSignError('')
    try {
      const result = await sendAgreementCode(agreementId)
      setSentTo(result?.sent_to || 'your registered email')
      setCountdown(Number(result?.resend_after_seconds) || 60)
      setOtp('')
      setVerified(false)
    } catch (err) {
      if (err.status === 429) setCountdown(err.retryAfter || 60)
      setCodeError(err.message)
      if (err.status === 409 || err.status === 410) setStale(true)
    } finally {
      setSending(false)
    }
  }

  const verify = async () => {
    setVerifying(true)
    setCodeError('')
    try {
      await verifyAgreementCode(agreementId, otp)
      setVerified(true)
    } catch (err) {
      const left = err.body?.attempts_left
      setCodeError(Number.isFinite(left) ? `${err.message} ${left} ${left === 1 ? 'attempt' : 'attempts'} left.` : err.message)
      if (err.status === 409 || err.status === 410) setStale(true)
    } finally {
      setVerifying(false)
    }
  }

  const ready = canSign && name.trim() && designation.trim() && signature && verified && !stale

  const sign = async () => {
    setSigning(true)
    setSignError('')
    try {
      const result = await signAgreement(agreementId, {
        signer_name: name.trim(),
        signer_designation: designation.trim(),
        method: signature.method,
        signature: signature.dataUrl,
        details_confirmed: true,
      })
      setDone(true)
      onSigned?.(result)
    } catch (err) {
      if (err.status === 403) {
        setVerified(false)
        setReviewing(false)
        setSignError(err.message || 'Please verify the code sent to your email, then sign again.')
      } else {
        if (err.status === 409 || err.status === 410) { setStale(true); setReviewing(false) }
        setSignError(err.message)
      }
    } finally {
      setSigning(false)
    }
  }

  if (done) {
    return (
      <div className="grid min-h-[300px] place-items-center text-center" role="status">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={30} /></span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.03em] text-navy-950">Agreement signed</h2>
          <p className="mt-1 text-sm text-slate-600">Thank you. Taking you to the status page…</p>
        </div>
      </div>
    )
  }

  const missing = [
    !canSign && 'earlier steps',
    !name.trim() && 'signer name',
    !designation.trim() && 'designation',
    !signature && 'signature',
    !verified && 'email code',
  ].filter(Boolean)
  const complete = ready && missing.length === 0

  const previewPayload = { signer_name: name, signer_designation: designation, method: signature?.method, signature: signature?.dataUrl }

  const checks = [!!name.trim(), !!designation.trim(), !!signature, verified]
  const doneCount = checks.filter(Boolean).length
  const footer = (
    <div className={`border-t border-slate-200 bg-white ${fill ? '-mx-4 -mb-3 shrink-0 px-4 sm:-mx-6 sm:px-6' : 'sticky bottom-0 z-10 mt-4 px-1'}`}>
      <div className={`flex w-full flex-wrap items-center gap-2 py-2 ${fill ? '' : 'mx-auto max-w-3xl'}`}>
        {footerStart}
        {onDecline && (
          <Button variant="danger" className={`${SMALL_BUTTON} whitespace-nowrap`} onClick={onDecline}><MessageSquareWarning size={15} /> Decline agreement</Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {complete ? (
            <p className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-emerald-700" role="status"><CheckCircle2 size={15} /> {doneCount} of {checks.length} completed</p>
          ) : (
            <p className="hidden whitespace-nowrap text-xs font-semibold text-slate-500 sm:block" title={!canSign ? blockedNote : `Still needed: ${missing.join(', ')}`}>{doneCount} of {checks.length} completed</p>
          )}
          <Button className={`${SMALL_BUTTON} shrink-0`} onClick={() => { setSignError(''); setReviewing(true) }} disabled={!ready}>
            <PenLine size={15} /> Sign agreement
          </Button>
        </div>
      </div>
      {!complete && missing.length > 0 && (
        <p className="w-full pb-2 text-[11px] text-slate-500 sm:hidden">Still needed: {missing.join(', ')}</p>
      )}
    </div>
  )

  const body = (
    <div className={`w-full pb-4 ${fill ? '' : 'mx-auto max-w-3xl'}`}>
      <div className="min-w-0 flex-1 space-y-3">
      <AgreementSummaryCard agreement={agreement} vendorName={vendorName} />

      <section className="rounded-xl border border-[#d8e0e9] bg-white px-5 py-5">
        <ol className="space-y-6">
          <Section number="1" title="Your details">
            <div className="space-y-3">
              <div>
                <label htmlFor="signer-name" className={label}>Signer name <span className="text-red-600" aria-hidden="true">*</span></label>
                <input id="signer-name" className="app-field h-10" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="signer-designation" className={label}>Designation <span className="text-red-600" aria-hidden="true">*</span></label>
                <input id="signer-designation" className="app-field h-10" value={designation} maxLength={120} placeholder="e.g. Director, Proprietor" onChange={(event) => setDesignation(event.target.value)} />
              </div>
            </div>
          </Section>

          <Section number="2" title="Verify your email" helper="We email a 6-digit code to your registered email. Enter it here, or just open the link in that email. It is valid for 10 minutes.">
            {verified ? (
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[13px] font-bold text-emerald-700" role="status"><Check size={15} /> Email verified</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant={sentTo ? 'secondary' : 'primary'} className={SMALL_BUTTON} onClick={sendCode} disabled={sending || countdown > 0 || stale}>
                    {sending ? <Loader /> : sentTo ? <RefreshCw size={15} /> : <Mail size={15} />}
                    {sentTo ? (countdown > 0 ? `Resend in ${countdown}s` : 'Resend code') : 'Send code'}
                  </Button>
                  {sentTo && <p className="text-xs text-slate-500" role="status">Code sent to <b className="font-bold text-navy-900">{sentTo}</b></p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="agreement-otp" className="sr-only">Enter the 6-digit code</label>
                  <input
                    id="agreement-otp"
                    className="app-field h-10 w-[180px] text-center font-mono text-base tracking-[0.35em]"
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    disabled={!sentTo}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(event) => { if (event.key === 'Enter' && otp.length === 6 && !verifying) verify() }}
                  />
                  <Button className={SMALL_BUTTON} onClick={verify} disabled={!sentTo || otp.length !== 6 || verifying}>{verifying ? <Loader /> : null} Verify code</Button>
                </div>
              </div>
            )}
            {codeError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{codeError}</p>}
          </Section>

          <Section number="3" title="Your signature" helper="Draw, type or upload your signature." last>
            <SignatureInput defaultText={name} onChange={setSignature} />
          </Section>
        </ol>
      </section>

      {signError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{signError}</p>}
      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs leading-5 text-amber-900">This agreement can no longer be signed. Refresh to see its latest status.</p>
          <Button variant="secondary" className={SMALL_BUTTON} onClick={() => onStale?.()}><RefreshCw size={15} /> Refresh</Button>
        </div>
      )}
      </div>
    </div>
  )

  // The final review: the whole agreement exactly as it will be signed. Nothing is saved until the vendor confirms.
  if (reviewing) {
    const method = { draw: 'Drawn', type: 'Typed', upload: 'Uploaded image' }[signature?.method] || ''
    const summary = [['Signer', name.trim()], ['Designation', designation.trim()], ['Signature', method], ['Agreement', agreement.agreement_no ? `${agreement.agreement_no}${agreement.version ? ` · Version ${agreement.version}` : ''}` : ''], ...keyTermTiles(agreement)].filter(([, value]) => value)
    return (
      <div className={`flex flex-col ${fill ? 'min-h-0 flex-1' : ''}`}>
        <div className={`grid gap-3 ${fill ? 'min-h-0 flex-1 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]'}`}>
          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
            <section className="rounded-xl border border-[#b3c3e4] bg-[#eef2fb] px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-brand-700"><CheckCircle2 size={14} /> One last check</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">This is exactly what will be signed. Nothing is signed until you press <b className="text-navy-900">Confirm agreement</b>.</p>
            </section>

            <section className="rounded-xl border border-[#d8e0e9] bg-white" aria-label="Your signing details">
              <dl className="divide-y divide-slate-100">
                {summary.map(([term, value]) => (
                  <div key={term} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                    <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">{term}</dt>
                    <dd className="min-w-0 break-words text-right text-[13px] font-semibold text-navy-900">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Email</dt>
                  <dd className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700"><Check size={13} /> Verified</dd>
                </div>
              </dl>
              {signature?.dataUrl && (
                <div className="border-t border-slate-100 px-3.5 py-2.5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Your signature</p>
                  <div className="grid h-20 place-items-center rounded-lg border border-dashed border-slate-200 bg-white px-2">
                    <img src={signature.dataUrl} alt="Your signature" className="max-h-16 max-w-full object-contain" />
                  </div>
                </div>
              )}
            </section>

            <section aria-label="What happens next">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">What happens when you confirm</p>
              <ol className="space-y-2">
                {[
                  [PenLine, 'Your signature is added and the time of signing is recorded'],
                  [FileCheck2, 'A certificate page is added, and the signed copy is saved for you to view or download any time'],
                  [UserCheck, 'It goes to our team for the final approval of your account'],
                ].map(([Icon, text]) => (
                  <li key={text} className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon size={13} /></span>
                    <span className="text-xs leading-5 text-slate-600">{text}</span>
                  </li>
                ))}
              </ol>
            </section>
            <p className="flex items-start gap-1.5 px-1 text-[11px] leading-5 text-slate-500"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-slate-400" /> By confirming, you sign this agreement electronically. It is legally binding on your company.</p>
          </aside>

          <div className={fill ? 'min-h-0' : 'h-[70vh] min-h-[420px]'}>
            <SignedPreviewPane agreementId={agreementId} payload={previewPayload} final debounceMs={0} label="Final agreement" hint="Read it from the top. The certificate page is last." fileName={`${agreement.agreement_no || 'agreement'}_preview.pdf`} />
          </div>
        </div>
        {signError && <p role="alert" className="mt-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{signError}</p>}
        <div className={`mt-2 shrink-0 border-t border-slate-200 bg-white ${fill ? '-mx-4 -mb-3 px-4 sm:-mx-6 sm:px-6' : 'px-1'}`}>
          <div className="flex w-full flex-wrap items-center gap-2 py-2">
            <Button variant="secondary" className={`${SMALL_BUTTON} whitespace-nowrap`} onClick={() => { setSignError(''); setReviewing(false) }} disabled={signing}><ArrowLeft size={15} /> Back to edit</Button>
            <div className="ml-auto">
              <Button className={`${SMALL_BUTTON} shrink-0`} onClick={sign} disabled={signing} aria-busy={signing}>
                {signing ? <><Loader /> Confirming…</> : <><CheckCircle2 size={15} /> Confirm agreement</>}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // `fill`: the panel fills a fixed-height parent, the form (left) and the live agreement (right) scroll on their own and
  // the footer bar stays put. The live agreement is left out on small screens; the final review shows it there.
  return fill ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto pr-1 [scrollbar-width:thin]">{body}</div>
        <div className="hidden min-h-0 pb-3 lg:block">
          <SignedPreviewPane agreementId={agreementId} payload={previewPayload} hint="Updates as you type and sign" />
        </div>
      </div>
      {footer}
    </div>
  ) : (
    <div>
      {body}
      {footer}
    </div>
  )
}
