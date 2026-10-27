import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, CheckCircle2, MessageSquareWarning, RefreshCw } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Button from '../components/common/Button'
import Loader from '../components/common/Loader'
import AgreementSignPanel from '../components/agreement/AgreementSignPanel'
import DeclineDialog from '../components/agreement/DeclineDialog'
import RequestChangesModal from '../components/vendor-request/RequestChangesModal'
import DetailsReview from '../components/agreement/DetailsReview'
import AgreementUpdated from '../components/agreement/AgreementUpdated'
import AgreementWelcome from '../components/agreement/AgreementWelcome'
import AgreementReadStep from '../components/agreement/AgreementReadStep'
import { SMALL_BUTTON } from '../components/agreement/agreementUtils'
import { getMyAgreements } from '../api/vendorApi'
import useAuth from '../hooks/useAuth'

const STEPS = [
  { id: 1, title: 'Review your details', heading: 'Review your details', intro: 'Please check that the details we hold for you are correct before you sign.' },
  { id: 2, title: 'Read the agreement', heading: 'Read the agreement', intro: 'Read the whole agreement. You can open it in a new tab or download a copy.' },
  { id: 3, title: 'Sign', heading: 'Sign the agreement', intro: 'Add your name, your signature and the code we email you.' },
]
// The vendor reviews their details, reads the agreement and signs it. At onboarding that is the stage "agreement"; a renewed agreement
// (route /agreements/:id/sign, the vendor already active) goes through exactly the same steps.
export default function AgreementSigningPage() {
  const { profile, user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const renewal = Boolean(id)
  // A renewal opens at once with the agreement the vendor clicked (handed over by the Agreement page), and is checked again in the background.
  const [renewalAgreement, setRenewalAgreement] = useState(() => location.state?.agreement ?? undefined) // undefined = loading, null = not signable
  const agreement = renewal ? renewalAgreement || null : profile?.agreement || null
  const selfService = profile?.source === 'self_service'
  const [step, setStep] = useState(0)
  const [details, setDetails] = useState(null) // the list entry for this agreement (it carries the key terms)
  const [detailsOk, setDetailsOk] = useState(false)
  const [readOk, setReadOk] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [reviewing, setReviewing] = useState(false) // the final review of the signed agreement, before the vendor confirms
  const [changeSent, setChangeSent] = useState(false) // "Request changes" at the details review: sent as a change request
  const [moving, setMoving] = useState(false)
  const [refreshError, setRefreshError] = useState('')

  useEffect(() => {
    if (!renewal) return undefined
    let ignore = false
    getMyAgreements()
      .then((list) => { if (!ignore) setRenewalAgreement(list.find((item) => String(item.agreement_id) === String(id) && item.can_sign) || null) })
      .catch(() => { if (!ignore) setRenewalAgreement((current) => current ?? null) })
    return () => { ignore = true }
  }, [renewal, id])

  const agreementId = agreement?.agreement_id
  useEffect(() => {
    if (!agreementId) return undefined
    let ignore = false
    getMyAgreements().then((list) => { if (!ignore) setDetails(list.find((item) => item.agreement_id === agreementId) || null) }).catch(() => {})
    return () => { ignore = true }
  }, [agreementId])
  const shown = agreement ? { ...details, ...agreement, key_terms: agreement.key_terms || details?.key_terms, company_name: agreement.company_name || details?.company_name } : null
  // A re-issued agreement (version 2 or later) opens on what changed, then goes through every step again.
  const updateInfo = shown?.update_info || null
  const firstStep = 1

  const vendorName = profile?.vendor_legal_name || profile?.name || ''

  // After signing or declining the stage changes, so the profile is reloaded and the vendor lands on the status page.
  const leave = async () => {
    if (renewal) { navigate('/agreements', { replace: true }); return }
    setMoving(true)
    setRefreshError('')
    try {
      await refreshProfile()
      navigate('/application-status', { replace: true })
    } catch {
      setRefreshError('Unable to refresh. Please try again.')
      setMoving(false)
    }
  }
  const onSigned = async () => {  // runs right after the vendor confirms on the final review
    if (renewal) { navigate('/agreements', { replace: true }); return }
    await refreshProfile().catch(() => {})
    navigate('/application-status', { replace: true })
  }

  if (renewal && renewalAgreement === undefined) {
    return (
      <AppShell breadcrumb="Customer agreement">
        <PageContainer className="max-w-xl">
          <section className="rounded-2xl border border-[#b3c3e4]/80 bg-white px-6 py-10 text-center shadow-[0_22px_60px_rgba(40,83,130,0.1)]">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-600"><Loader /> Opening your renewed agreement…</p>
          </section>
        </PageContainer>
      </AppShell>
    )
  }

  if (declined || changeSent) {
    return (
      <AppShell breadcrumb="Customer agreement">
        <PageContainer className="max-w-xl">
          <section className="rounded-2xl border border-[#b3c3e4]/80 bg-white px-6 py-10 text-center shadow-[0_22px_60px_rgba(40,83,130,0.1)] sm:px-10">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-100 text-brand-700"><CheckCircle2 size={26} /></span>
            <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.03em] text-navy-950">{changeSent ? 'Your change request is with our team' : 'Thanks, we have told our team'}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{changeSent ? 'They will send your application back so you can correct those details, then issue a new agreement for you to sign.' : 'Our team will look at what you reported and send you a corrected agreement. You will get an email when it is ready.'}</p>
            {refreshError && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{refreshError}</p>}
            <Button className={`${SMALL_BUTTON} mt-6`} onClick={leave} disabled={moving}>{moving ? <Loader /> : null} Continue</Button>
          </section>
        </PageContainer>
      </AppShell>
    )
  }

  if (!agreement) {
    return (
      <AppShell breadcrumb="Customer agreement">
        <PageContainer className="max-w-xl">
          <section className="rounded-2xl border border-[#b3c3e4]/80 bg-white px-6 py-10 text-center shadow-[0_22px_60px_rgba(40,83,130,0.1)]">
            <h1 className="text-xl font-extrabold text-navy-950">{renewal ? 'This agreement is not waiting for your signature' : 'Your agreement is not available right now'}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">It may have been withdrawn or replaced by our team. Refresh to see where your application stands.</p>
            {refreshError && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{refreshError}</p>}
            <Button className={`${SMALL_BUTTON} mt-6`} onClick={leave} disabled={moving}>{moving ? <Loader /> : <RefreshCw size={15} />} Refresh</Button>
          </section>
        </PageContainer>
      </AppShell>
    )
  }

  const current = STEPS.find((item) => item.id === step)
  const back = step > firstStep ? <Button variant="secondary" className={`${SMALL_BUTTON} whitespace-nowrap`} onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Back</Button> : null

  return (
    <AppShell breadcrumb="Customer agreement">
      <PageContainer wide className="vendor-workspace h-full">
        <section className="vendor-workspace__card grid min-h-0 overflow-hidden rounded-xl border border-[#b3c3e4]/80 bg-white shadow-[0_12px_36px_rgba(40,83,130,0.08)] lg:h-[calc(100svh-6rem)] lg:min-h-[600px] lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-[#dce6ff] bg-[#eef2fb] p-5 lg:flex xl:p-6">
            <div>
              {renewal && <Link to="/agreements" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-navy-900"><ArrowLeft size={15} /> Back to your agreement</Link>}
              <p className="eyebrow">{renewal ? 'Renewed agreement' : 'Customer agreement'}</p>
              <h1 className="mt-3 text-2xl font-extrabold leading-[1.12] tracking-[-0.035em] text-navy-950">{renewal ? 'Sign your renewed agreement' : 'Sign your customer agreement'}</h1>
              <p className="mt-3 text-xs leading-5 text-slate-600">{renewal ? 'Go through the same steps as before: check your details, read the agreement and sign it. Your current agreement stays in force until the new one starts.' : 'Sign the agreement to move on to the final approval.'}</p>
              <p className="mt-3 rounded-lg border border-[#b3c3e4]/80 bg-white/75 px-3 py-2 text-[11px] font-bold text-navy-900">{agreement.agreement_no}{agreement.version ? ` · Version ${agreement.version}` : ''}</p>
            </div>
            <div className="mt-auto pt-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Progress</p>
              <ol className="mt-3 space-y-2">
                <li className="flex items-center gap-3" aria-current={step === 0 ? 'step' : undefined}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${step > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-600 text-white'}`}>
                    {step > 0 ? <BadgeCheck size={14} /> : <span className="size-1.5 rounded-full bg-white" />}
                  </span>
                  <span className={`text-xs font-semibold ${step === 0 ? 'text-navy-900' : 'text-slate-500'}`}>{renewal ? 'Renewed agreement' : updateInfo ? 'Updated agreement' : 'Welcome'}</span>
                </li>
                {STEPS.map((item) => (
                  <li key={item.id} className="flex items-center gap-3" aria-current={item.id === step ? 'step' : undefined}>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${item.id < step ? 'bg-emerald-100 text-emerald-700' : item.id === step ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-500'}`}>
                      {item.id < step ? <BadgeCheck size={14} /> : item.id}
                    </span>
                    <span className={`text-xs font-semibold ${item.id === step ? 'text-navy-900' : 'text-slate-500'}`}>{item.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          <div key={step} className="flex min-h-0 min-w-0 animate-[step-in_.28s_ease-out] flex-col px-4 py-3 sm:px-6 xl:px-7">
            {step === 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {updateInfo
                  ? <AgreementUpdated agreement={shown} renewal={renewal} onStart={() => setStep(firstStep)} />
                  : <AgreementWelcome vendorName={vendorName} email={user?.email} selfService={selfService} agreement={shown} onStart={() => setStep(1)} />}
              </div>
            ) : step === 2 ? (
              <AgreementReadStep
                agreement={shown}
                readOk={readOk}
                onReadChange={setReadOk}
                onBack={back ? () => setStep(1) : null}
                onContinue={() => setStep(3)}
                onDecline={() => setDeclineOpen(true)}
              />
            ) : (
              <>
                <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-slate-100 pb-2">
                  <p className="w-full text-xs font-bold uppercase tracking-wider text-brand-600 lg:hidden">Step {step} of {STEPS.length}</p>
                  <h2 className="text-xl font-extrabold tracking-[-0.03em] text-navy-950">{step === 3 && reviewing ? 'Review and confirm' : current.heading}</h2>
                  <p className="text-xs text-slate-600">{step === 3 && reviewing ? 'Check the final agreement. Nothing is signed until you confirm.' : current.intro}</p>
                </header>

                <div className={`flex min-h-0 flex-1 flex-col ${step === 3 ? '' : 'overflow-y-auto'}`}>
                  {step === 1 && (
                    <>
                      {updateInfo?.details_changed && <p className="mb-2 inline-flex self-start rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">Details changed since the last version</p>}
                      <DetailsReview profile={profile} updateInfo={updateInfo} />
                    </>
                  )}
                  {step === 3 && (
                    <AgreementSignPanel
                      agreement={shown}
                      vendorName={vendorName}
                      canSign={detailsOk && readOk}
                      blockedNote="Confirm your details and tick “I have read the agreement” in the earlier steps to sign."
                      onSigned={onSigned}
                      onStale={leave}
                      footerStart={back}
                      fill
                      onReviewingChange={setReviewing}
                    />
                  )}
                </div>

                {step === 1 && (
                  <footer className="mt-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#d8e0e9] bg-[#f7f9fc] px-3 py-2 transition hover:border-slate-300 sm:flex-1">
                        <input type="checkbox" className="size-4.5 shrink-0 accent-brand-600" checked={detailsOk} onChange={(event) => setDetailsOk(event.target.checked)} />
                        <span className="text-[13px] font-semibold leading-5 text-navy-900">These details are correct</span>
                      </label>
                      <Button className={SMALL_BUTTON} onClick={() => setStep(2)} disabled={!detailsOk}>Continue</Button>
                    </div>
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 px-1 text-[11.5px] leading-5 text-slate-500">
                      Is any of your information incorrect? Tell us what needs to be corrected.
                      <button type="button" onClick={() => setDeclineOpen(true)} className="inline-flex items-center gap-1 rounded-md px-1 text-[11.5px]! font-bold! text-amber-700 underline-offset-2 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30">
                        <MessageSquareWarning size={13} aria-hidden="true" /> Request changes
                      </button>
                    </p>
                  </footer>
                )}
              </>
            )}
          </div>
        </section>
      </PageContainer>
      <RequestChangesModal
        open={declineOpen && step === 1 && !renewal}
        agreementId={agreement.agreement_id}
        onClose={() => setDeclineOpen(false)}
        onSent={() => { setDeclineOpen(false); setChangeSent(true) }}
      />
      <DeclineDialog
        open={declineOpen && (step !== 1 || renewal)}
        agreementId={agreement.agreement_id}
        title={step === 1 ? 'Request changes' : 'Decline agreement'}
        description={renewal ? 'Tell us what needs to change. Our team will review it and may send you a corrected agreement. Your current agreement stays in force.' : undefined}
        atStep={step === 1 ? 'review' : 'sign'}
        onClose={() => setDeclineOpen(false)}
        onDeclined={() => { setDeclineOpen(false); if (renewal) navigate('/agreements', { replace: true }); else setDeclined(true) }}
      />
    </AppShell>
  )
}
