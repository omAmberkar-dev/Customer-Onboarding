import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Banknote, FileCheck2, Landmark, ReceiptText, RefreshCw } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Button from '../components/common/Button'
import Loader from '../components/common/Loader'
import JourneySteps from '../components/loans/JourneySteps'
import LoanDocumentDialog from '../components/loans/LoanDocumentDialog'
import { DrawdownCard, InvoiceCard, SanctionCard } from '../components/loans/LoanCards'
import { getMyLoans } from '../api/vendorApi'
import useAuth from '../hooks/useAuth'
import { STAGES, homeForStage } from '../utils/stages'

const card = 'rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)]'

// Before there is anything to show: onboarding not approved yet, or approved but not yet set up for loans.
function EmptyState({ active, stage }) {
  return (
    <section className={`${card} px-5 py-12 text-center`}>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><Landmark size={24} /></span>
      <p className="mt-3 text-sm font-bold text-navy-900">{active ? 'Your loan account is being set up.' : 'Your loans will appear here once your onboarding is approved.'}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
        {active
          ? 'As soon as it is ready you can follow your loan application, sanction, drawdowns and invoices here.'
          : 'We are still reviewing your application. You can follow its progress on your application status page.'}
      </p>
      {!active && (
        <Link to={homeForStage(stage)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#c2cdda] bg-white px-4 text-[13px] font-semibold text-navy-900 transition hover:border-brand-600 hover:bg-[#eef2fb] hover:text-brand-700">
          <ArrowLeft size={16} /> Back to my application
        </Link>
      )}
    </section>
  )
}

// A titled list of cards, or a line saying there are none yet.
function Section({ icon: Icon, title, items, empty, notice, children }) {
  return (
    <section aria-labelledby={`loans-${title}`} className="min-w-0">
      <h2 id={`loans-${title}`} className="mb-2 flex items-center gap-2 px-1 text-[13px] font-extrabold text-[#000000]">
        <Icon size={16} className="text-brand-600" /> {title}
        {items.length > 0 && <span className="rounded-full bg-[#eef2fb] px-2 py-0.5 text-[11px] font-bold text-brand-700">{items.length}</span>}
      </h2>
      {notice && <p role="status" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice}</p>}
      {items.length ? <div className="grid gap-3 xl:grid-cols-2">{children}</div> : <p className={`${card} px-4 py-5 text-xs text-slate-500`}>{empty}</p>}
    </section>
  )
}

// My loans: the customer's loan journey as LAS carries it out, from onboarding to invoices, with each document to view
// or download. Built phone first: one column, cards instead of tables, 44px tap targets.
export default function MyLoansPage() {
  const { stage } = useAuth()
  const [journey, setJourney] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)
  const closeViewer = useCallback(() => setViewing(null), [])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getMyLoans()
      .then(setJourney)
      .catch((err) => setError(err.message || 'Unable to load your loans. Please try again.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const active = stage === STAGES.active
  return (
    <AppShell breadcrumb="My loans">
      <PageContainer className="pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-[#000000]">My loans</h1>
            <p className="mt-1 text-xs text-[#5f5f5f]">Follow your loan from application to invoices, and keep a copy of every document.</p>
          </div>
          {journey?.onboarded && (
            <Button variant="secondary" className="px-4! text-[13px]!" onClick={load} disabled={loading}>{loading ? <Loader /> : <RefreshCw size={16} />} Refresh</Button>
          )}
        </div>

        <div className="mt-4">
          {loading && !journey ? (
            <div role="status" className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-600"><Loader /> Loading your loans…</div>
          ) : error && !journey ? (
            <section className={`${card} px-5 py-10 text-center`}>
              <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
              <Button variant="secondary" className="mt-4" onClick={load}><RefreshCw size={16} /> Try again</Button>
            </section>
          ) : !journey?.onboarded ? (
            <EmptyState active={active} stage={stage} />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-start">
              <section className={`${card} p-4 lg:sticky lg:top-20`} aria-labelledby="loans-journey">
                <h2 id="loans-journey" className="mb-3 text-[13px] font-extrabold text-[#000000]">Your journey</h2>
                {journey.customerName && <p className="-mt-2 mb-3 break-words text-xs text-slate-500">{journey.customerName}{journey.customerNo ? ` · Customer No. ${journey.customerNo}` : ''}</p>}
                <JourneySteps steps={journey.steps} />
              </section>

              <div className="grid min-w-0 gap-5">
                {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
                <Section icon={FileCheck2} title="Sanctions" items={journey.sanctions} empty="No loan application yet. Your relationship manager raises it for you.">
                  {journey.sanctions.map((s) => <SanctionCard key={s.id} sanction={s} onView={setViewing} />)}
                </Section>
                <Section icon={Banknote} title="Drawdowns" items={journey.drawdowns} empty="No drawdowns yet. Once a sanction is approved, drawdowns you request appear here.">
                  {journey.drawdowns.map((d) => <DrawdownCard key={d.id} drawdown={d} onView={setViewing} />)}
                </Section>
                <Section
                  icon={ReceiptText}
                  title="Invoices"
                  items={journey.invoices}
                  empty="No invoices yet. They appear here as your dues and charges are raised."
                  notice={journey.invoicesAvailable ? '' : 'Your invoices can’t be shown right now. Please check again later.'}
                >
                  {journey.invoices.map((i) => <InvoiceCard key={i.id} invoice={i} onView={setViewing} />)}
                </Section>
              </div>
            </div>
          )}
        </div>
      </PageContainer>
      <LoanDocumentDialog document={viewing} onClose={closeViewer} />
    </AppShell>
  )
}
