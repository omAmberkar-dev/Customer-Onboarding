import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Check, CheckCircle2, ChevronRight, Clock3, Eye, FileSignature, PencilLine, RefreshCw, Undo2 } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Button from '../components/common/Button'
import Loader from '../components/common/Loader'
import Modal from '../components/common/Modal'
import RequestChangesModal from '../components/vendor-request/RequestChangesModal'
import { cancelChangeRequest } from '../api/vendorApi'
import useAuth from '../hooks/useAuth'
import { OPEN_PROFILE_EVENT, OPEN_REQUEST_CHANGES_EVENT } from '../utils/events'
import { STAGES } from '../utils/stages'

const POLL_INTERVAL_MS = 5000

// Every step of the review, in order. `reached` says how far the application has got for each stage.
const STEPS = [
  { title: 'Application submitted', detail: 'We have received your details and documents.' },
  { title: 'Review', detail: 'Our team checks your company, tax and bank details.' },
  { title: 'Verification', detail: 'Your details are verified before your account is set up.' },
  { title: 'Customer account ready', detail: 'Your account is created and invoices are unlocked.' },
]

// The steps while a request to change details is open.
const CHANGE_STEPS = [
  { title: 'Application submitted', detail: 'We have received your details and documents.' },
  { title: 'Change request sent', detail: 'Our team has been told which details you want to change.' },
  { title: 'Application sent back to you', detail: 'You get access to edit the details you asked for.' },
  { title: 'You update and resubmit', detail: 'Your application then goes through review again.' },
]

// The steps once the vendor has signed the agreement and the final approval is pending.
const SIGNED_STEPS = [
  { title: 'Application submitted', detail: 'We have received your details and documents.' },
  { title: 'Agreement signed', detail: 'Your signed agreement is with our team.' },
  { title: 'Final approval', detail: 'Our team gives the final approval for your account.' },
  { title: 'Customer account ready', detail: 'Your account is created and invoices are unlocked.' },
]

// How many steps are complete for each stage; the next one is "in progress".
const COMPLETED_STEPS = {
  [STAGES.makerReview]: 1,
  [STAGES.checkerReview]: 2,
  [STAGES.approved]: 3,
  [STAGES.changeRequested]: 2,
  [STAGES.agreementSigned]: 2,
}

const HEADLINES = {
  [STAGES.makerReview]: ['Your application is under review', 'Our team is reviewing your details. This usually takes about 3 working days.'],
  [STAGES.checkerReview]: ['Almost there: verification in progress', 'Your details have been reviewed and are now being verified. We’ll email you as soon as your account is ready.'],
  [STAGES.agreementSigned]: ['Agreement signed', 'Thank you. Your signed agreement is with our team; your account goes live after the final approval.'],
  [STAGES.approved]: ['Approved: setting up your account', 'Your application is approved. We’re creating your customer account, which can take a little while.'],
  [STAGES.rejected]: ['Your application was not approved', 'Please contact support to discuss next steps.'],
  [STAGES.changeRequested]: ['Your change request has been sent', 'Our team will send your application back to you so you can make the changes yourself. You will get an email, and this page updates on its own.'],
}

const formatDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

const openProfile = () => window.dispatchEvent(new Event(OPEN_PROFILE_EVENT))

// What a vendor sees between submitting their application and being approved: progress only, nothing to do.
// Invoices and change requests stay locked until the vendor is active.
export default function ApplicationStatusPage() {
  const { profile, stage, refreshProfile, user, logout } = useAuth()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const [checkedAt, setCheckedAt] = useState(() => new Date())
  const [requestOpen, setRequestOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [actionError, setActionError] = useState('')
  const rejected = stage === STAGES.rejected
  const changeRequested = stage === STAGES.changeRequested
  const signed = stage === STAGES.agreementSigned
  const steps = changeRequested ? CHANGE_STEPS : signed ? SIGNED_STEPS : STEPS
  const requestedFields = profile?.change_request?.fields || []
  const completed = COMPLETED_STEPS[stage] ?? 0
  const [headline, subline] = HEADLINES[stage] || HEADLINES[STAGES.makerReview]
  const vendorName = profile?.vendor_legal_name || profile?.name || user?.email

  const refresh = async () => {
    setRefreshing(true)
    try { await refreshProfile(); setCheckedAt(new Date()) } catch { /* the next poll tries again */ } finally { setRefreshing(false) }
  }

  // The profile panel's "Request changes" button asks this page to open the dialog (only while it can be requested).
  const canRequest = stage === STAGES.makerReview || stage === STAGES.checkerReview
  useEffect(() => {
    if (!canRequest) return undefined
    const open = () => { setActionError(''); setRequestOpen(true) }
    window.addEventListener(OPEN_REQUEST_CHANGES_EVENT, open)
    return () => window.removeEventListener(OPEN_REQUEST_CHANGES_EVENT, open)
  }, [canRequest])

  // Keep the status current without a reload; when the stage changes, the route moves the vendor to the right page.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') refreshProfile().then(() => setCheckedAt(new Date())).catch(() => {}) }
    const timer = setInterval(check, POLL_INTERVAL_MS)
    // Coming back to the tab checks straight away rather than waiting for the next tick.
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [refreshProfile])

  // The application was rejected for good: signing out and starting a new one is the only way forward.
  const startNewApplication = () => {
    const email = user?.email
    logout()
    navigate('/', { replace: true, state: { startNewApplication: true, email } })
  }
  const withdrawRequest = async () => {
    setCancelling(true)
    setActionError('')
    try {
      await cancelChangeRequest()
      await refreshProfile()
      setCheckedAt(new Date())
      setCancelOpen(false)
    } catch (err) {
      setActionError(err.message || 'Unable to cancel your request.')
      setCancelOpen(false)
    } finally {
      setCancelling(false)
    }
  }

  const reasons = profile?.rejection?.items || []
  const overallRemark = profile?.rejection?.overall_remark

  // `open` rows open what was submitted.
  const details = [
    // The request ID means nothing to a vendor under review; a closed application needs it to talk to support.
    ...(rejected ? [['Request ID', `VR-${profile?.vendor_id}`]] : []),
    ['Customer', vendorName, true],
    ['Submitted', formatDate(profile?.submitted_at)],
    ['Status', rejected ? 'Not approved' : changeRequested ? 'Change requested' : signed ? 'Agreement signed' : 'In review'],
  ]

  return (
    <AppShell breadcrumb="Application status">
      {/* The shell's main area does not scroll on a tall screen, so the page scrolls here and always ends with room below the card. */}
      <div className="h-full min-h-0 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center py-6">
      <PageContainer className="max-w-4xl">
        <section className="overflow-hidden rounded-2xl border border-[#b3c3e4]/80 bg-white shadow-[0_22px_60px_rgba(40,83,130,0.1)]">
          <div className={`px-5 py-4 sm:px-7 ${rejected ? 'bg-red-50' : 'bg-[#eef2fb]'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${rejected ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'}`}>
                  {rejected ? <AlertCircle size={20} /> : signed ? <FileSignature size={20} /> : changeRequested ? <PencilLine size={20} /> : <Clock3 size={20} />}
                </span>
                <p className="eyebrow">{rejected ? 'Application closed' : changeRequested ? 'Change request' : signed ? 'Agreement' : 'Application status'}</p>
              </div>
              {(profile?.submission_round || 0) > 1 && !rejected && !changeRequested && !signed && (
                <p className="shrink-0 rounded-full border border-[#b3c3e4] bg-white px-3 py-1 text-xs font-bold text-brand-700">Resubmitted application</p>
              )}
            </div>
            <h1 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-navy-950 sm:text-2xl">{headline}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">{subline}</p>
          </div>

          <div className="grid items-start gap-6 p-5 sm:p-6 md:grid-cols-[1.2fr_1fr]">
            {!rejected && (
              <div>
              <ol className="space-y-5" aria-label="Review progress">
                {steps.map((step, index) => {
                  const done = index < completed
                  const current = index === completed
                  return (
                    <li key={step.title} className="flex gap-3" aria-current={current ? 'step' : undefined}>
                      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-600 text-white' : current ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'border border-slate-300 bg-white text-slate-500'}`}>
                        {done ? <Check size={15} /> : index + 1}
                      </span>
                      <div>
                        <p className={`text-sm font-bold ${done || current ? 'text-navy-900' : 'text-slate-500'}`}>
                          {step.title}{current && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">In progress</span>}
                        </p>
                        <p className="text-xs leading-5 text-slate-500">{step.detail}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
              </div>
            )}

            <div className={rejected ? 'md:col-span-2' : ''}>
              <dl className="grid grid-cols-2 gap-2">
                {details.map(([label, value, opens]) => (
                  <div key={label} className={`rounded-lg border border-slate-200 bg-slate-50/50 p-3 ${label === 'Customer' ? 'col-span-2' : ''}`}>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
                    <dd className="mt-0.5 break-words text-[13px] font-bold text-navy-900">
                      {opens ? (
                        <button type="button" onClick={openProfile} title="View your submitted details" className="group flex w-full items-center justify-between gap-2 text-left transition hover:text-brand-700">
                          <span className="break-words">{value}</span>
                          <ChevronRight size={16} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                        </button>
                      ) : value}
                    </dd>
                  </div>
                ))}
              </dl>
              {changeRequested && (
                <section className="mt-2.5 overflow-hidden rounded-lg border border-[#b3c3e4] bg-white" aria-label="Details you asked to change">
                  <div className="flex items-center gap-2.5 border-b border-[#dce6ff] bg-[#eef2fb] px-3 py-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-brand-700 ring-1 ring-[#dce6ff]"><PencilLine size={14} /></span>
                    <div>
                      <h2 className="text-[13px] font-extrabold text-navy-900">Your change request</h2>
                      <p className="text-xs leading-4 text-slate-600">Waiting for our team to send your application back to you.</p>
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Details you want to change</p>
                    <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                        {requestedFields.map((field) => (
                          <li key={field.field_key} className="rounded-md border border-[#dce6ff] bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{field.field_label}</li>
                        ))}
                      </ul>
                      <Button variant="danger" aria-label="Withdraw request" className="min-h-7! shrink-0 px-2.5! py-0.5! text-xs!" onClick={() => { setActionError(''); setCancelOpen(true) }}>
                        <Undo2 size={13} /> Withdraw request
                      </Button>
                    </div>
                  </div>
                </section>
              )}
              {rejected && (reasons.length > 0 || overallRemark) && (
                <section className="mt-2.5 overflow-hidden rounded-lg border border-red-200 bg-white" aria-label="Why the application was not approved">
                  <h2 className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-red-800">
                    Why it was not approved
                  </h2>
                  <ul className="divide-y divide-slate-100">
                    {reasons.map((item) => (
                      <li key={item.item_id} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                        <span className="text-xs font-bold text-navy-900">{item.field_label}</span>
                        <span className="text-xs leading-5 text-slate-700">{item.reason_label}{item.remark && <span className="text-slate-500"> ({item.remark})</span>}</span>
                      </li>
                    ))}
                    {overallRemark && (
                      <li className="grid gap-0.5 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                        <span className="text-xs font-bold text-navy-900">Note from our team</span>
                        <span className="whitespace-pre-line text-xs leading-5 text-slate-700">{overallRemark}</span>
                      </li>
                    )}
                  </ul>
                </section>
              )}
              {profile?.declined_agreement && stage === STAGES.checkerReview && (
                <p className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700" role="note">
                  You declined the agreement on {formatDate(profile.declined_agreement.declined_at)}: “{profile.declined_agreement.reason}”. Our team will review it and send you an updated agreement.
                </p>
              )}
              <div className="mt-2.5 flex flex-col gap-2.5 rounded-lg border border-[#b3c3e4] bg-brand-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-700">
                  <CheckCircle2 size={14} className="mr-1.5 inline -translate-y-px text-brand-600" />
                  {rejected
                    ? 'This application is closed and cannot be reopened. You can apply again with a new application. Questions? Write to support@fourthsignal.com and mention your request ID.'
                    : changeRequested
                      ? 'Your application stays on hold until our team sends it back to you. You can cancel the request any time before then.'
                      : signed
                        ? 'Our team now gives the final approval. We’ll email you as soon as your account is ready, and you can also come back to this page any time.'
                        : 'Your application is in progress. We’ll email you as soon as there is an update, and you can come back to this page any time.'}
                </p>
                {rejected && <Button className="shrink-0" onClick={startNewApplication}>Start a new application</Button>}
                {!rejected && (
                  <Button variant="secondary" className="min-h-9! shrink-0 px-4! py-1.5! text-[13px]!" onClick={refresh} disabled={refreshing}>
                    {refreshing ? <Loader /> : <RefreshCw size={15} />} Refresh status
                  </Button>
                )}
              </div>
              {actionError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{actionError}</p>}
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
                <Button variant="secondary" className="min-h-9! w-full py-1.5! text-[13px]!" onClick={openProfile}>
                  <Eye size={15} /> View submitted details
                </Button>
                {(signed || profile?.declined_agreement) && (
                  <Button variant="secondary" className="min-h-9! w-full py-1.5! text-[13px]!" onClick={() => navigate('/agreements')}>
                    <FileSignature size={15} /> {signed ? 'View agreement' : 'Agreement history'}
                  </Button>
                )}
                {!rejected && !changeRequested && !signed && (
                  <Button variant="secondary" className="min-h-9! w-full py-1.5! text-[13px]!" onClick={() => { setActionError(''); setRequestOpen(true) }}>
                    <PencilLine size={15} /> Request changes
                  </Button>
                )}
              </div>
              {!rejected && (
                <p className="mt-1.5 text-center text-[11px] text-slate-500" role="status">
                  Updated {checkedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · updates automatically
                </p>
              )}
            </div>
          </div>
        </section>
      </PageContainer>
      </div>
      </div>
      <RequestChangesModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onSent={() => {
          setRequestOpen(false)
          refresh()
        }}
      />
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={withdrawRequest}
        busy={cancelling}
        busyLabel="Withdrawing…"
        title="Withdraw your change request?"
        description="Only this change request is withdrawn. Your application stays in review exactly as you submitted it, and you can ask for changes again later."
        cancelLabel="Keep request"
        confirmLabel="Withdraw request"
        confirmVariant="primary"
      />
    </AppShell>
  )
}
