import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarClock as RenewalIcon, AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, CalendarPlus, CalendarClock, CalendarRange, Download, Eye, FilePenLine, FileSignature, PenLine, RefreshCw, Send } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Button from '../components/common/Button'
import Loader from '../components/common/Loader'
import AgreementViewDialog from '../components/agreement/AgreementViewDialog'
import RenewalRequestDialog from '../components/agreement/RenewalRequestDialog'
import { SMALL_BUTTON, STATE_BADGES, daysLeft, formatDate, formatPeriod } from '../components/agreement/agreementUtils'
import { cancelRenewal, downloadAgreement, getMyAgreements, getRenewal } from '../api/vendorApi'
import useAuth from '../hooks/useAuth'
import { STAGES } from '../utils/stages'

const EXPIRY_WARNING_DAYS = 60
const BTN = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg! px-3.5 text-[13px]! font-semibold! leading-none! transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-not-allowed disabled:opacity-50 border'
const BTN_PRIMARY = 'border-brand-600 bg-brand-600 text-white hover:border-brand-700 hover:bg-brand-700'
const BTN_SECONDARY = 'border-[#c2cdda] bg-white text-navy-900 hover:border-brand-600 hover:bg-[#eef2fb] hover:text-brand-700'
const card = 'shrink-0 overflow-hidden rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)]'
const cardHeading = 'flex items-center gap-2 border-b border-[#d8e0e9] bg-[#fbfcfe] px-4 py-3 text-[13px] font-extrabold text-[#000000] sm:px-5'

function StateBadge({ state }) {
  const [text, style] = STATE_BADGES[state] || [state || '—', STATE_BADGES.replaced[1]]
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${style}`}>{text}</span>
}

// The one line under a history entry: its period and what happened to it (signed, declined and why, starting later...).
function historyLine(item) {
  const parts = [formatPeriod(item)]
  if (item.derived_state === 'declined') {
    const review = item.decline_step === 'review'
    const when = item.declined_at ? ` on ${formatDate(item.declined_at)}` : ''
    parts.push(`${review ? 'You asked for corrections' : 'You declined it after reading it'}${when}${item.decline_reason ? `: “${item.decline_reason}”` : ''}`)
  } else if (item.signed_at) {
    parts.push(`You signed it on ${formatDate(item.signed_at)}${item.signer_name ? ` (${item.signer_name})` : ''}`)
    if (item.derived_state === 'scheduled') parts.push(`Starts ${formatDate(item.start_iso)}`)
  }
  return parts.join(' · ')
}

// Share of the term (start to end) that has passed, 0 to 100.
function termProgress(agreement) {
  const start = agreement?.start_iso ? new Date(agreement.start_iso).getTime() : NaN
  const end = agreement?.end_iso ? new Date(agreement.end_iso).getTime() : NaN
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0
  return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100))
}

const renewalDue = (agreement) => {
  const end = agreement?.end_iso ? new Date(agreement.end_iso) : null
  if (!end || Number.isNaN(end.getTime())) return null
  end.setDate(end.getDate() - EXPIRY_WARNING_DAYS)
  return end
}

// All of the vendor's agreements: the one in force, a renewal waiting for a signature, and the history.
export default function AgreementsPage() {
  const { stage } = useAuth()
  const navigate = useNavigate()
  const [agreements, setAgreements] = useState(null)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [renewalInfo, setRenewalInfo] = useState(null)
  const [renewalOpen, setRenewalOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [params, setParams] = useSearchParams()
  const isActive = stage === STAGES.active

  const load = useCallback(async () => {
    setError('')
    try { setAgreements(await getMyAgreements()) } catch (err) { setError(err.message); setAgreements((value) => value || []) }
  }, [])
  useEffect(() => { load() }, [load])

  // The renewal window, the open request and the last outcome (active vendors only).
  const loadRenewal = useCallback(async () => {
    try { setRenewalInfo(await getRenewal()) } catch { setRenewalInfo(null) }
  }, [])
  useEffect(() => { if (stage === STAGES.active) loadRenewal() }, [stage, loadRenewal])
  // The banner's "Request renewal" link opens the dialog straight away.
  useEffect(() => {
    if (params.get('renew') && renewalInfo) {
      if (renewalInfo.can_request) setRenewalOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, renewalInfo, setParams])
  const withdrawRenewal = async () => {
    setCancelling(true)
    try { setRenewalInfo(await cancelRenewal()) } catch (err) { setError(err.message) } finally { setCancelling(false) }
  }

  const download = async (item) => {
    setBusyId(item.agreement_id)
    try { await downloadAgreement(item.agreement_id, item.agreement_no) } catch (err) { setError(err.message) } finally { setBusyId(null) }
  }

  const list = agreements || []
  const current = list.find((item) => item.is_current) || list.find((item) => item.status === 'signed' && item.derived_state === 'active') || null
  const renewal = list.find((item) => item.can_sign && item.status === 'sent' && item.agreement_id !== current?.agreement_id) || null
  // A signed renewal that starts later: the earliest one is "next". With nothing in force yet it becomes the main card.
  const scheduled = list.filter((item) => item.derived_state === 'scheduled').sort((a, b) => String(a.start_iso).localeCompare(String(b.start_iso)))
  const next = scheduled[0] || null
  const hero = current || next
  const heroScheduled = !current && Boolean(next)
  const showNext = Boolean(current && next)
  // The next agreement and a renewal waiting for a signature have their own cards above, so they are not in the history too.
  const history = list.filter((item) => item.agreement_id !== hero?.agreement_id && item.agreement_id !== next?.agreement_id && item.agreement_id !== renewal?.agreement_id)
  const remaining = hero && !heroScheduled ? daysLeft(hero) : null
  const expired = hero && !heroScheduled ? hero.derived_state === 'expired' || (remaining !== null && remaining < 0) : false
  const expiring = !expired && remaining !== null && remaining < EXPIRY_WARNING_DAYS
  const accent = heroScheduled ? 'bg-[#474747]' : expired ? 'bg-red-500' : expiring ? 'bg-amber-500' : 'bg-emerald-500'
  const declinedCount = list.filter((item) => item.derived_state === 'declined').length
  const progress = hero && !heroScheduled ? termProgress(hero) : 0
  const due = hero ? renewalDue(hero) : null
  const startsIn = next?.start_iso ? Math.ceil((new Date(next.start_iso).getTime() - Date.now()) / 86400000) : 0
  // One line that answers the vendor's question: where does my agreement stand, and is anything needed from me?
  const standing = (() => {
    if (heroScheduled) return { color: '#0046dc', title: `Your next agreement starts on ${formatDate(hero.start_iso)}`, detail: '' }
    if (hero && expired) return { color: '#bf4252', title: `Your agreement ended on ${formatDate(hero.end_iso)}`, detail: 'Contact us to arrange a renewal' }
    if (hero && expiring) return { color: '#936716', title: `Your agreement ends on ${formatDate(hero.end_iso)}`, detail: `${remaining} ${remaining === 1 ? 'day' : 'days'} left · contact us to arrange a renewal` }
    if (hero) return { color: '#1f7c64', title: 'Your agreement is in force', detail: `until ${formatDate(hero.end_iso)}${remaining !== null ? ` · ${remaining} days left` : ''}` }
    return { color: '#5f5f5f', title: 'No signed agreement yet', detail: declinedCount > 0 ? 'Our team has been told and will review it' : '' }
  })()

  // Same two actions everywhere: read it on screen, or keep a PDF. In the history the download is an icon so the row stays light.
  const downloading = (item) => busyId === item.agreement_id
  const actions = (item) => (
    <div className="flex shrink-0 items-center justify-end gap-2">
      <button type="button" onClick={() => setViewing(item)} className={`${BTN} ${BTN_SECONDARY}`}><Eye size={15} /> View</button>
      <button type="button" onClick={() => download(item)} disabled={downloading(item)} title="Download PDF" aria-label={`Download PDF of ${item.agreement_no}`} className={`${BTN} ${BTN_SECONDARY} w-9 px-0!`}>
        {downloading(item) ? <Loader /> : <Download size={15} />}
      </button>
    </div>
  )

  // The agreement's dates in order, as a timeline: [icon, label, date]. A date that has passed is drawn as done.
  const keyDates = hero ? [
    [Send, 'Sent to you', hero.issued_at],
    [PenLine, 'You signed', hero.signed_at],
    [CalendarRange, 'Valid from', hero.start_iso],
    [CalendarCheck, 'Valid until', hero.end_iso],
    // With a signed renewal the fifth card is when it starts (its own card is below); otherwise when the renewal window opens.
    ...(!heroScheduled ? [showNext ? [CalendarPlus, 'Next agreement starts', next.start_iso] : [CalendarClock, 'Renewal window opens', due]] : []),
  ] : []
  const passed = (value) => { const time = value ? new Date(value).getTime() : NaN; return !Number.isNaN(time) && time <= Date.now() }


  return (
    <AppShell breadcrumb="Agreement">
      <PageContainer wide className="vendor-workspace h-full">
        <div className="mx-auto flex h-full max-w-[1820px] min-h-0 flex-col gap-4 overflow-y-auto px-1 pb-4 sm:px-2">
          <div className="shrink-0 px-1">
            {!isActive && (
              <Link to="/application-status" className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 transition hover:text-navy-900"><ArrowLeft size={15} /> Back to application status</Link>
            )}
            <h1 className="text-lg font-extrabold text-[#000000]">Your agreement</h1>
            <p className="mt-1 text-xs text-[#5f5f5f]">Your customer agreement with us: how long it runs, a copy to keep, and what happened with any earlier versions.</p>
            {agreements !== null && list.length > 0 && (
              <p className="mt-3 inline-flex items-center gap-2 text-xs text-[#5f5f5f]" aria-label="Where your agreement stands">
                <i className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: standing.color }} />
                <span><b className="font-bold text-[#000000]">{standing.title}</b>{standing.detail ? ` · ${standing.detail}` : ''}</span>
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {error}
              <Button variant="secondary" className={SMALL_BUTTON} onClick={load}><RefreshCw size={15} /> Retry</Button>
            </p>
          )}

          {renewal && (
            <section className="shrink-0 overflow-hidden rounded-xl border border-brand-600/40 bg-white shadow-[0_8px_24px_rgba(23,105,232,0.12)]" aria-label="Renewed agreement ready for your signature">
              <div className="flex">
                <span className="w-1.5 shrink-0 bg-brand-600" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-[#b3c3e4]"><FilePenLine size={20} /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700">Action needed</p>
                      <h2 className="mt-0.5 text-base font-extrabold text-navy-950">Your renewed agreement is ready to sign</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {renewal.agreement_no} · Version {renewal.version}. It runs <b className="font-bold text-navy-900">{formatPeriod(renewal)}</b>
                        {current ? ', and your current agreement stays in force until then.' : '.'} Your details are unchanged, so it only needs to be read and signed.
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setViewing(renewal)} className={`${BTN} ${BTN_SECONDARY}`}><Eye size={15} /> Read it first</button>
                    <button type="button" onClick={() => navigate(`/agreements/${renewal.agreement_id}/sign`, { state: { agreement: renewal } })} className={`${BTN} ${BTN_PRIMARY}`}><PenLine size={15} /> Review and sign</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {renewalInfo && (renewalInfo.can_request || renewalInfo.open_request || renewalInfo.last_outcome) && (
            <section className={`${card} shrink-0`} aria-label="Renewal">
              <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><RenewalIcon size={18} /></span>
                  <div className="min-w-0 text-xs leading-5 text-slate-600">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">Renewal</h2>
                    {renewalInfo.open_request ? (
                      <>
                        <p className="mt-0.5 text-[13px] font-bold text-navy-900">Requested{renewalInfo.open_request.requested_at ? ` on ${formatDate(renewalInfo.open_request.requested_at)}` : ''}</p>
                        <p>Start {formatDate(renewalInfo.open_request.start_date)} · {renewalInfo.open_request.term_months} {Number(renewalInfo.open_request.term_months) === 1 ? 'month' : 'months'}</p>
                        {renewalInfo.open_request.note && <p className="mt-0.5 break-words italic">“{renewalInfo.open_request.note}”</p>}
                      </>
                    ) : renewalInfo.last_outcome ? (
                      <p className="mt-0.5 text-[13px] font-semibold text-navy-900">
                        {renewalInfo.last_outcome.status === 'declined' ? `Declined${renewalInfo.last_outcome.reason ? `: ${renewalInfo.last_outcome.reason}` : ''}` : renewalInfo.last_outcome.status === 'fulfilled' ? 'Renewal issued' : 'Cancelled'}
                        {renewalInfo.last_outcome.at && <span className="ml-1.5 text-xs font-medium text-slate-500">{formatDate(renewalInfo.last_outcome.at)}</span>}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[13px] font-semibold text-navy-900">Your agreement is ending. Ask for a renewal.</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {renewalInfo.open_request && (
                    <button type="button" onClick={withdrawRenewal} disabled={cancelling} className={`${BTN} ${BTN_SECONDARY}`}>{cancelling ? <Loader /> : null} Cancel request</button>
                  )}
                  {renewalInfo.can_request && <button type="button" onClick={() => setRenewalOpen(true)} className={`${BTN} ${BTN_PRIMARY}`}>Request renewal</button>}
                </div>
              </div>
            </section>
          )}

          {agreements === null ? (
            <div className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-600"><Loader /> Loading your agreements…</div>
          ) : list.length === 0 && !error ? (
            <section className={`${card} px-6 py-14 text-center`}>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><FileSignature size={24} /></span>
              <p className="mt-3 text-sm font-bold text-navy-900">No agreement on file yet.</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Once an agreement is issued and signed, it appears here with its dates and every version.</p>
            </section>
          ) : (
            <>
              {hero && (
                <div>
                  <div className="flex flex-col gap-4">
                  <section className={`${card} flex flex-1 flex-col`} aria-label="Current agreement">
                    <div className={`h-1.5 ${accent}`} aria-hidden="true" />
                    <div className="flex-1 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">{heroScheduled ? 'Your next agreement' : 'Your current agreement'}</p>
                          <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-navy-950">{hero.agreement_no}</h2>
                          <p className="text-xs font-semibold text-slate-500">Version {hero.version}</p>
                        </div>
                        <StateBadge state={expired ? 'expired' : hero.derived_state || 'active'} />
                      </div>

                      <div className="mt-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                          <span className="font-bold text-navy-900">{formatPeriod(hero)}</span>
                          {heroScheduled && <span className="inline-flex items-center gap-1 font-bold text-[#474747]">Starts {formatDate(hero.start_iso)}</span>}
                          {remaining !== null && (
                            <span className={`inline-flex items-center gap-1 font-bold ${expired ? 'text-red-700' : expiring ? 'text-amber-800' : 'text-emerald-700'}`}>
                              {(expired || expiring) && <AlertTriangle size={13} />}
                              {remaining < 0 ? 'Ended' : remaining === 1 ? '1 day left' : `${remaining} days left`}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label="How much of the term has passed">
                          <div className={`h-full rounded-full ${accent}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>

                      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Key dates">
                        {keyDates.map(([Icon, label, value]) => {
                          const done = passed(value)
                          const current = !done && keyDates.find(([, , date]) => !passed(date))?.[1] === label
                          const away = value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000) : null
                          return (
                            <li key={label} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${current ? 'border-brand-600 bg-[#eef2fb] shadow-[0_0_0_1px_var(--primary)]' : 'border-[#d8e0e9] bg-[#f7f9fc]'}`}>
                              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${done ? 'bg-brand-600 text-white' : current ? 'bg-white text-brand-700 ring-1 ring-brand-600' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}><Icon size={15} /></span>
                              <div className="min-w-0">
                                <p className={`truncate text-[10px] font-bold uppercase tracking-[0.06em] ${current ? 'text-brand-700' : 'text-slate-500'}`}>{label}</p>
                                <p className={`text-[13px] font-bold ${done || current ? 'text-navy-900' : 'text-slate-500'}`}>{value ? formatDate(value) : '—'}</p>
                                {current && away !== null && away > 0 && <p className="text-[11px] text-brand-700">in {away} {away === 1 ? 'day' : 'days'}</p>}
                              </div>
                            </li>
                          )
                        })}
                      </ol>

                      <p className="mt-3 text-xs text-slate-600">Signed for you by <b className="font-bold text-navy-900">{hero.signer_name || '—'}</b>{hero.signed_at ? ` on ${formatDate(hero.signed_at)}` : ''}.</p>

                      {(expiring || expired) && !showNext && (
                        <p className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${expired ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                          {expired ? 'This agreement has ended. To arrange a renewal, write to support@fourthsignal.com and mention your agreement number.' : 'This agreement ends soon. To arrange a renewal, write to support@fourthsignal.com and mention your agreement number.'}
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end gap-1.5 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5">
                      <button type="button" onClick={() => setViewing(hero)} className={`${BTN} ${BTN_PRIMARY}`}><Eye size={15} /> View agreement</button>
                      <button type="button" onClick={() => download(hero)} disabled={downloading(hero)} className={`${BTN} ${BTN_SECONDARY}`}>
                        {downloading(hero) ? <Loader /> : <Download size={15} />} Download PDF
                      </button>
                    </div>
                  </section>

                  {showNext && (
                    <section className={card} aria-label="Upcoming renewal">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce6ff] bg-[#eef2fb] px-5 py-2.5">
                        <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-[#000000]"><CalendarPlus size={15} className="text-brand-600" aria-hidden="true" /> Upcoming renewal</h2>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#b3c3e4] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#052e86]">
                          {startsIn > 0 ? `Starts in ${startsIn} ${startsIn === 1 ? 'day' : 'days'}` : `Starts ${formatDate(next.start_iso)}`}
                        </span>
                      </div>
                      <div className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-extrabold tracking-[-0.02em] text-navy-950">{next.agreement_no}</h3>
                            <p className="text-xs font-semibold text-slate-500">Version {next.version}{next.key_terms?.term_months != null ? ` · ${next.key_terms.term_months} ${Number(next.key_terms.term_months) === 1 ? 'month' : 'months'}` : ''}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button type="button" onClick={() => setViewing(next)} className={`${BTN} ${BTN_SECONDARY}`}><Eye size={15} /> View agreement</button>
                            <button type="button" onClick={() => download(next)} disabled={downloading(next)} title="Download PDF" aria-label={`Download PDF of ${next.agreement_no}`} className={`${BTN} ${BTN_SECONDARY} w-9 px-0!`}>
                              {downloading(next) ? <Loader /> : <Download size={15} />}
                            </button>
                          </div>
                        </div>

                        <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch" aria-label="How the renewal follows your current agreement">
                          <li className="flex-1 rounded-lg border border-[#d8e0e9] bg-[#f7f9fc] px-3.5 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">Your current agreement ends</p>
                            <p className="text-[13px] font-bold text-navy-900">{formatDate(hero.end_iso)}</p>
                          </li>
                          <li className="hidden items-center text-slate-300 sm:flex" aria-hidden="true"><ArrowRight size={18} /></li>
                          <li className="flex-1 rounded-lg border border-brand-600 bg-[#eef2fb] px-3.5 py-2.5 shadow-[0_0_0_1px_var(--primary)]">
                            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-brand-700">Renewal runs</p>
                            <p className="text-[13px] font-bold text-navy-900">{formatPeriod(next)}</p>
                          </li>
                        </ol>

                        <dl className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-3">
                          {[
                            ['Sent to you', formatDate(next.issued_at)],
                            ['Signed for you by', next.signer_name || '—'],
                            ['You signed on', formatDate(next.signed_at)],
                          ].map(([term, value]) => (
                            <div key={term} className="min-w-0">
                              <dt className="text-[11px] font-semibold text-slate-500">{term}</dt>
                              <dd className="text-[13px] font-bold text-navy-900">{value}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 size={14} aria-hidden="true" /> Already signed. Nothing to do: it takes over automatically when your current agreement ends.</p>
                      </div>
                    </section>
                  )}
                  </div>
                </div>
              )}

              <section className={card} aria-label="Agreement history">
                <h2 className={cardHeading}>Agreement history <span className="grid min-w-5 place-items-center rounded-full bg-[#f1f4f8] px-1.5 py-0.5 text-[11px] font-bold text-[#0046dc]">{history.length}</span></h2>
                {history.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs font-medium text-slate-500">No earlier versions.</p>
                ) : (
                  <ol className="max-h-[440px] overflow-y-auto p-4 [scrollbar-width:thin] sm:p-5">
                    {history.map((item, index) => {
                      const dot = { declined: 'bg-red-500', active: 'bg-emerald-500', scheduled: 'bg-[#0046dc]', awaiting: 'bg-amber-500' }[item.derived_state] || 'bg-slate-300'
                      return (
                        <li key={item.agreement_id} className="relative pl-7">
                          {index < history.length - 1 && <span className="absolute left-[5px] top-4 -bottom-3 w-px bg-slate-200" aria-hidden="true" />}
                          <span className={`absolute left-0 top-[18px] size-[11px] rounded-full ring-4 ring-white ${dot}`} aria-hidden="true" />
                          <div className="mb-3 flex flex-col gap-3 rounded-lg border border-[#d8e0e9] bg-white px-4 py-3 transition hover:border-[#c2cdda] hover:bg-[#f9fbfe] sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <span className="text-[13px] font-extrabold text-navy-900">{item.agreement_no}</span>
                                <span className="text-xs font-semibold text-slate-500">Version {item.version}</span>
                                <StateBadge state={item.derived_state === 'declined' && item.decline_step === 'review' ? 'corrections' : item.derived_state} />
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-600">{historyLine(item)}</p>
                            </div>
                            {actions(item)}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </PageContainer>
      <AgreementViewDialog
        agreement={viewing}
        onClose={() => setViewing(null)}
        onSign={viewing && viewing.can_sign && viewing.status === 'sent' ? () => navigate(`/agreements/${viewing.agreement_id}/sign`, { state: { agreement: viewing } }) : null}
      />
      <RenewalRequestDialog open={renewalOpen} renewal={renewalInfo} onClose={() => setRenewalOpen(false)} onDone={loadRenewal} />
    </AppShell>
  )
}
