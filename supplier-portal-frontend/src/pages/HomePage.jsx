import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BadgeCheck, CalendarClock, ChevronRight, Clock3, FileCheck2, FilePlus2, FileText, Handshake, Landmark,
  LifeBuoy, Replace, RefreshCw, UserRound, Wallet,
} from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Loader from '../components/common/Loader'
import { getMyActivity, getMyHome, getMyLoans } from '../api/vendorApi'
import useAuth from '../hooks/useAuth'
import { greetingName } from '../utils/customer'
import { formatLoanDate, formatMoney } from '../utils/loans'
import { daysFrom, inDays, loansSummary, upcomingItems } from '../utils/home'
import { OPEN_PROFILE_EVENT } from '../utils/events'

const card = 'rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)]'
const openProfile = () => window.dispatchEvent(new Event(OPEN_PROFILE_EVENT))

// One request's state: { data, error, loading }, with reload.
function useSection(load) {
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    load().then((data) => setState({ data, error: '', loading: false })).catch((err) => setState({ data: null, error: err.message || 'Unable to load this.', loading: false }))
  }, [load])
  useEffect(() => { reload() }, [reload])
  return { ...state, reload }
}

// A section that could not be loaded: says so (never a zero) and offers to retry.
function Unavailable({ what, onRetry }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      {what} can’t be shown right now.
      {onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-8 items-center gap-1 font-semibold text-brand-700 hover:underline"><RefreshCw size={13} /> Try again</button>}
    </p>
  )
}

const dateTime = (iso) => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
}
// A compact KPI: icon, label over figure, and an arrow to the list behind it.
function KpiCard({ icon: Icon, tone, label, value, to, linkLabel, unavailable }) {
  return (
    <article className={`${card} flex items-center gap-3 px-3 py-2.5`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={18} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-xs font-semibold text-slate-600">{label}</h2>
        {unavailable ? <p className="text-[13px] font-semibold text-slate-500">Unavailable</p> : <p className="break-words text-lg font-extrabold leading-6 text-navy-950">{value}</p>}
      </div>
      <Link to={to} aria-label={linkLabel} title={linkLabel} className="grid size-8 shrink-0 place-items-center rounded-lg text-brand-700 transition hover:bg-[#eef2fb]"><ArrowRight size={15} /></Link>
    </article>
  )
}

// Loans at a glance (utils/home.js loansSummary): counting and adding only.
function LoansSummary({ loans }) {
  const { data, error, loading, reload } = loans
  let body
  if (loading && !data) body = <p className="flex items-center gap-2 text-xs text-slate-600"><Loader /> Loading your loans…</p>
  else if (error) body = <Unavailable what="Your loans" onRetry={reload} />
  else if (!data?.onboarded) body = <p className="text-xs text-slate-600">Your loan account is being set up. Your sanctions and drawdowns will appear here.</p>
  else {
    const s = loansSummary(data)
    const facts = [
      ['Approved sanctions', String(s.approvedSanctions)],
      ['Sanctioned limit', s.limit !== null ? formatMoney(s.limit, s.currency) : s.approvedSanctions ? 'Several currencies' : '—'],
      ['Drawdowns approved', String(s.drawdownsApproved)],
      ['Drawdowns under review', String(s.drawdownsInReview)],
    ]
    body = (
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {facts.map(([term, value]) => (
          <div key={term} className="min-w-0 rounded-lg bg-[#f7f9fc] px-2.5 py-1.5">
            <dt className="truncate text-[11px] font-semibold text-slate-500">{term}</dt>
            <dd className="break-words text-sm font-extrabold text-navy-950">{value}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <section className={`${card} px-3.5 py-3`} aria-labelledby="home-loans">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="home-loans" className="flex items-center gap-2 text-sm font-extrabold text-navy-950"><Landmark size={16} className="text-brand-600" /> Loans &amp; Sanctions</h2>
        <Link to="/loans" className="inline-flex min-h-7 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">View loans <ArrowRight size={13} /></Link>
      </div>
      {body}
    </section>
  )
}

const CATEGORY = {
  invoice: { icon: FileText, label: 'Invoice', tone: 'bg-brand-50 text-brand-700' },
  agreement: { icon: Handshake, label: 'Agreement', tone: 'bg-emerald-50 text-emerald-700' },
  change_request: { icon: Replace, label: 'Change request', tone: 'bg-violet-50 text-violet-700' },
  onboarding: { icon: BadgeCheck, label: 'Onboarding', tone: 'bg-amber-50 text-amber-700' },
  support: { icon: LifeBuoy, label: 'Support', tone: 'bg-sky-50 text-sky-700' },
}

function RecentActivity() {
  const [limit, setLimit] = useState(5)
  const load = useCallback(() => getMyActivity(limit), [limit])
  const { data, error, loading, reload } = useSection(load)
  const events = data?.events || []
  return (
    <section className={`${card} min-w-0 px-3.5 py-3`} aria-labelledby="home-activity">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 id="home-activity" className="flex items-center gap-2 text-sm font-extrabold text-navy-950"><Clock3 size={16} className="text-brand-600" /> Recent activity</h2>
        {events.length >= 5 && limit === 5 && <button type="button" onClick={() => setLimit(50)} className="inline-flex min-h-7 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">View all <ArrowRight size={13} /></button>}
      </div>
      {loading && !data ? <p className="flex items-center gap-2 text-xs text-slate-600"><Loader /> Loading your activity…</p>
        : error ? <Unavailable what="Your recent activity" onRetry={reload} />
          : events.length === 0 ? <p className="rounded-lg bg-[#f7f9fc] px-4 py-4 text-center text-xs text-slate-500">No activity yet. Your uploads, agreements and requests will appear here.</p>
            : (
              <div className={`overflow-x-auto ${limit > 5 ? 'max-h-72 overflow-y-auto' : ''}`}>
                <table className="w-full min-w-[520px] text-left text-[12.5px]">
                  <thead><tr className="border-b border-[#e5eaf1] text-[11px] font-semibold text-slate-500"><th className="py-1.5 pr-3 font-semibold">Date &amp; time</th><th className="py-1.5 pr-3 font-semibold">Activity</th><th className="py-1.5 pr-3 font-semibold">Type</th><th className="py-1.5 font-semibold">Reference</th></tr></thead>
                  <tbody>
                    {events.map((e, index) => {
                      const c = CATEGORY[e.category] || CATEGORY.onboarding
                      return (
                        <tr key={`${e.at}-${e.title}-${index}`} className="border-b border-[#f0f3f7] last:border-0">
                          <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600"><span className="flex items-center gap-2"><span className={`grid size-6 place-items-center rounded-md ${c.tone}`}><c.icon size={13} aria-hidden="true" /></span>{dateTime(e.at)}</span></td>
                          <td className="py-1.5 pr-3 font-semibold text-navy-900">{e.title}</td>
                          <td className="py-1.5 pr-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${c.tone}`}>{c.label}</span></td>
                          <td className="py-1.5 font-medium text-slate-700">{e.reference || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
      {data?.unavailable?.length > 0 && <p className="mt-2 text-[11.5px] text-slate-500">Some activity can’t be shown right now.</p>}
    </section>
  )
}

const UPCOMING_ICON = { dues: Wallet, invoice: FileText, change_request: Replace }

function Upcoming({ home, loans }) {
  const items = upcomingItems(home.data, loans.data)
  return (
    <section className={`${card} px-3.5 py-3`} aria-labelledby="home-upcoming">
      <h2 id="home-upcoming" className="mb-2 flex items-center gap-2 text-sm font-extrabold text-navy-950"><CalendarClock size={16} className="text-brand-600" /> Upcoming &amp; important</h2>
      {home.loading && !home.data ? <p className="flex items-center gap-2 text-xs text-slate-600"><Loader /> Loading…</p>
        : items.length === 0 ? <p className="rounded-lg bg-[#f7f9fc] px-3 py-3 text-center text-xs text-slate-500">{home.error ? 'Some details can’t be checked right now.' : 'Nothing needs your attention right now.'}</p>
          : (
            <ul className="grid gap-1.5">
              {items.map((item) => {
                const Icon = UPCOMING_ICON[item.kind]
                return (
                <li key={`${item.title}-${item.detail}`}>
                  <Link to={item.to} className="flex min-h-11 items-center gap-2.5 rounded-lg border border-[#eef1f5] px-2.5 py-1.5 transition hover:border-brand-100 hover:bg-[#f7f9fc]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><Icon size={14} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold text-navy-900">{item.title}</span>
                      <span className="block truncate text-[11.5px] text-slate-500">{[item.detail, item.date && formatLoanDate(item.date)].filter(Boolean).join(' · ')}</span>
                    </span>
                    {item.date && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">{inDays(daysFrom(item.date))}</span>}
                  </Link>
                </li>
                )
              })}
            </ul>
          )}
    </section>
  )
}

const QUICK_ACTIONS = [
  { icon: FilePlus2, title: 'Upload invoice', text: 'Submit your invoice for processing', to: '/invoices' },
  { icon: Landmark, title: 'View loans', text: 'Your sanctions, drawdowns and their memos', to: '/loans' },
  { icon: Replace, title: 'Request a change', text: 'Ask to update your details', profile: true },
  { icon: UserRound, title: 'View profile', text: 'Your account and company details', profile: true },
]

// Quick actions as a 2 x 2 grid of small tiles: the title shows, the longer text is the tooltip.
function QuickActions() {
  return (
    <section className={`${card} px-3.5 py-3`} aria-labelledby="home-actions">
      <h2 id="home-actions" className="mb-2 text-sm font-extrabold text-navy-950">Quick actions</h2>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((a) => {
          const inner = (
            <>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><a.icon size={15} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-navy-900">{a.title}</span>
            </>
          )
          const cls = 'flex min-h-11 w-full items-center gap-2 rounded-lg border border-[#e5eaf1] px-2.5 py-1.5 text-left transition hover:border-brand-100 hover:bg-[#f7f9fc]'
          return a.profile
            ? <button key={a.title} type="button" onClick={openProfile} title={a.text} className={cls}>{inner}</button>
            : <Link key={a.title} to={a.to} title={a.text} className={cls}>{inner}</Link>
        })}
      </div>
    </section>
  )
}

// Home: the active customer's dashboard (the reference image), every figure from the portal or from LAS.
export default function HomePage() {
  const { profile, user } = useAuth()
  const home = useSection(getMyHome)
  const loans = useSection(getMyLoans)
  const h = home.data
  const unavailable = (key) => Boolean(home.error) || Boolean(h?.unavailable?.includes(key))

  return (
    <AppShell>
      <PageContainer className="grid gap-3 pb-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="relative overflow-hidden rounded-xl border border-[#d8e0e9] bg-gradient-to-br from-[#f4f7ff] to-[#e8efff] px-5 py-4">
            <h1 className="break-words text-xl font-extrabold text-navy-950">Hello, {greetingName(profile, user)}!</h1>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-slate-700">Welcome to your Customer Central portal. Follow your loans, invoices and requests, all in one place.</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><BadgeCheck size={15} aria-hidden="true" /> Your account is active.</p>
            <FileCheck2 size={80} strokeWidth={1.2} className="pointer-events-none absolute -bottom-3 right-6 hidden text-brand-600/15 sm:block" aria-hidden="true" />
          </section>
          <section className={`${card} px-3.5 py-2.5`} aria-labelledby="home-account">
            <button type="button" onClick={openProfile} className="mb-1 flex min-h-8 w-full items-center justify-between gap-2 text-left">
              <h2 id="home-account" className="text-sm font-extrabold text-navy-950">Account overview</h2>
              <ChevronRight size={16} className="text-slate-400" aria-hidden="true" /><span className="sr-only">Open profile</span>
            </button>
            <dl className="grid gap-1.5 text-[12.5px]">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Customer ID</dt><dd className="font-semibold text-navy-900">{profile?.vendor_id ?? '—'}</dd></div>
              {loans.data?.customerNo && <div className="flex justify-between gap-3"><dt className="text-slate-500">Loan customer no.</dt><dd className="font-semibold text-navy-900">{loans.data.customerNo}</dd></div>}
              <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Account status</dt><dd><span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-bold text-emerald-800">Active</span></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Customer since</dt><dd className="font-semibold text-navy-900">{formatLoanDate(profile?.created_at)}</dd></div>
            </dl>
          </section>
        </div>

        {home.error && <Unavailable what="Your summary" onRetry={home.reload} />}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={FileText} tone="bg-brand-50 text-brand-700" label="Total invoices" value={h?.invoices?.total ?? '…'} to="/invoices" linkLabel="View all invoices" unavailable={unavailable('invoices')} />
          <KpiCard icon={Clock3} tone="bg-amber-50 text-amber-700" label="Invoices in review" value={h?.invoices?.in_review ?? '…'} to="/invoices" linkLabel="View invoices" unavailable={unavailable('invoices')} />
          <KpiCard icon={FileCheck2} tone="bg-emerald-50 text-emerald-700" label="Approved invoices" value={h?.invoices?.approved ?? '…'} to="/invoices" linkLabel="View invoices" unavailable={unavailable('invoices')} />
          <KpiCard icon={Replace} tone="bg-violet-50 text-violet-700" label="Open change requests" value={h?.change_requests?.open ?? '…'} to="/update-requests" linkLabel="View requests" unavailable={unavailable('change_requests')} />
        </div>

        {/* Left: loans and activity; right: what needs attention and the quick actions, so no band sits below. */}
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
          <div className="grid min-w-0 gap-3">
            <LoansSummary loans={loans} />
            <RecentActivity />
          </div>
          <div className="grid min-w-0 gap-3">
            <Upcoming home={home} loans={loans} />
            <QuickActions />
          </div>
        </div>
      </PageContainer>
    </AppShell>
  )
}
