import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, BadgeCheck, Banknote, CalendarClock, ChevronRight, Clock3, FileCheck2, FilePlus2, FileText,
  Handshake, Landmark, LifeBuoy, Replace, RefreshCw, Scale, UserRound, Wallet,
} from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Loader from '../components/common/Loader'
import { KpiCard as FinanceKpi, Panel } from '../components/finance/FinanceUi'
import { MonthlyChart, UtilisationChart } from '../components/finance/Charts'
import { getMyActivity, getMyHome, getMyLoans } from '../api/vendorApi'
import useAuth from '../hooks/useAuth'
import { greetingName } from '../utils/customer'
import { formatLoanDate, formatMoney } from '../utils/loans'
import { instalmentsOf, useFinance } from '../utils/finance'
import { daysFrom, inDays, upcomingItems } from '../utils/home'
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

// The financial overview (Dashboard = Financial Overview): LAS's own figures, each "Unavailable" when its source was
// not read, never a zero in its place.
function FinanceOverview({ finance }) {
  const { data, error, loading, reload } = finance
  if (loading && !data) return <p className="flex items-center gap-2 px-1 text-xs text-slate-600"><Loader /> Loading your loan figures…</p>
  if (error) return <Unavailable what="Your loan figures" onRetry={reload} />
  if (!data?.onboarded) return <p className={`${card} px-3.5 py-3 text-xs text-slate-600`}>Your loan account is being set up. Your facilities and figures will appear here once it is ready.</p>
  const s = data.summary
  const next = s.nextDue
  return (
    <section aria-label="Financial overview" className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <FinanceKpi label="Total sanctioned" value={formatMoney(s.sanctioned)} caption={`${data.facilities.length} approved facilit${data.facilities.length === 1 ? 'y' : 'ies'}`} icon={Landmark} />
      <FinanceKpi label="Total disbursed" value={formatMoney(s.disbursed)} caption="Posted payouts" icon={Banknote} tone="navy" unavailable={!data.available.flows} />
      <FinanceKpi label="Total outstanding" value={formatMoney(s.outstanding)} caption="Principal + dues already due" icon={Scale} tone="amber" unavailable={s.outstanding === null} />
      <FinanceKpi label="Available limit" value={formatMoney(s.available)} caption="Drawing power, less pending" icon={Wallet} tone="green" />
      <FinanceKpi label="Upcoming payment" value={next ? formatMoney(next.total) : '—'} caption={next ? `Due ${formatLoanDate(next.date)}` : 'Nothing scheduled'} icon={CalendarClock} unavailable={next === null} />
      <FinanceKpi label="Overdue amount" value={formatMoney(s.overdue)} caption={s.overdue ? 'Past its due date' : 'Nothing overdue'} icon={AlertTriangle} tone={s.overdue ? 'red' : 'green'} unavailable={s.overdue === null} />
    </section>
  )
}

// Upcoming obligations: the next instalments not yet paid, principal, interest and charges apart.
function Obligations({ finance }) {
  const schedule = finance.data?.schedule
  const today = new Date().toISOString().slice(0, 10)
  const rows = schedule ? instalmentsOf(schedule).filter((r) => r.outstanding > 0 && r.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4) : []
  return (
    <Panel title="Upcoming obligations" subtitle="Your next instalments" action={<Link to="/repayments" className="inline-flex min-h-7 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">Schedule <ArrowRight size={13} /></Link>}>
      {!finance.data?.onboarded ? <p className="text-xs text-slate-500">Nothing scheduled yet.</p>
        : schedule === null ? <p className="text-xs text-slate-500">Your schedule can’t be shown right now.</p>
          : rows.length === 0 ? <p className="rounded-lg bg-[#f7f9fc] px-3 py-3 text-center text-xs text-slate-500">No upcoming instalments.</p>
            : (
              <ul className="grid gap-1.5">
                {rows.map((r) => (
                  <li key={r.id} className="rounded-lg border border-[#eef1f5] px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-[12.5px]"><b className="text-navy-900">{formatLoanDate(r.dueDate)}</b><b className="tabular-nums text-navy-950">{formatMoney(r.outstanding)}</b></div>
                    <p className="truncate text-[11px] text-slate-500">{r.disbursementNo} · principal {formatMoney(r.principal)} · interest {formatMoney(r.interest)}{r.charges ? ` · charges ${formatMoney(r.charges)}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
    </Panel>
  )
}

// What LAS records as loan activity, in the activity feed's shape: drawdowns approved, money disbursed, payments.
function financeEvents(data) {
  if (!data?.onboarded) return []
  const events = []
  for (const d of data.drawdowns || []) {
    if (d.approvedOn) events.push({ at: d.approvedOn, category: 'loan', title: 'Drawdown approved', reference: d.applicationNo })
    if (d.disbursedOn) events.push({ at: d.disbursedOn, category: 'loan', title: `${formatMoney(d.disbursedAmount, d.currency)} disbursed`, reference: d.disbursementNo })
  }
  for (const p of data.payments || []) {
    events.push({ at: p.paymentDate, category: 'payment', title: ['confirmed', 'allocated'].includes(p.status) ? 'Payment confirmed' : p.status === 'pending' ? 'Payment received, being verified' : 'Payment not accepted', reference: p.reference || p.receiptNo })
  }
  return events
}

const CATEGORY = {
  invoice: { icon: FileText, label: 'Invoice', tone: 'bg-brand-50 text-brand-700' },
  agreement: { icon: Handshake, label: 'Agreement', tone: 'bg-emerald-50 text-emerald-700' },
  change_request: { icon: Replace, label: 'Change request', tone: 'bg-violet-50 text-violet-700' },
  onboarding: { icon: BadgeCheck, label: 'Onboarding', tone: 'bg-amber-50 text-amber-700' },
  support: { icon: LifeBuoy, label: 'Support', tone: 'bg-sky-50 text-sky-700' },
  loan: { icon: Banknote, label: 'Loan', tone: 'bg-[#e6edff] text-[#002880]' },
  payment: { icon: Wallet, label: 'Payment', tone: 'bg-emerald-50 text-emerald-700' },
}

function RecentActivity({ finance }) {
  const [limit, setLimit] = useState(5)
  const load = useCallback(() => getMyActivity(limit), [limit])
  const { data, error, loading, reload } = useSection(load)
  const events = data ? [...data.events, ...financeEvents(finance)].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit) : []
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
  const finance = useFinance()
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

        <FinanceOverview finance={finance} />

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
            {finance.data?.onboarded && (
              <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
                <Panel title="Loan utilisation" subtitle="Sanctioned limit, utilised and available, by facility"><UtilisationChart facilities={finance.data.facilities} /></Panel>
                <Panel title="Monthly financial activity" subtitle="Posted inflows and outflows" action={<Link to="/cashflow" className="inline-flex min-h-7 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">Cashflow <ArrowRight size={13} /></Link>}>
                  <MonthlyChart monthly={finance.data.summary.monthly} height={160} />
                </Panel>
              </div>
            )}
            <RecentActivity finance={finance.data} />
          </div>
          <div className="grid min-w-0 gap-3">
            <Obligations finance={finance} />
            <Upcoming home={home} loans={loans} />
            <QuickActions />
          </div>
        </div>
      </PageContainer>
    </AppShell>
  )
}
