import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, ChevronDown, Landmark, Percent } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import { DataTable, FilterBar, KPI_GRID, KpiCard, LoadState, PageHeader, Panel, StatementButtons, StatusPill, Unavailable } from '../components/finance/FinanceUi'
import { disbursementsOf, filterRows, formatDate, formatMoney, instalmentsOf, label, scheduleBySanction, useFinance } from '../utils/finance'

const STATUSES = ['overdue', 'due', 'partially_paid', 'upcoming', 'paid']
const EMPTY = { from: '', to: '', disbursement: '', status: '', search: '' }

const COLUMNS = [
  { key: 'instalment', label: 'No.', align: 'right', sort: (r) => r.instalment },
  { key: 'dueDate', label: 'Due date', render: (r) => formatDate(r.dueDate) },
  { key: 'principal', label: 'Principal', align: 'right', render: (r) => formatMoney(r.principal, r.currency) },
  { key: 'interest', label: 'Interest', align: 'right', render: (r) => formatMoney(r.interest, r.currency) },
  { key: 'charges', label: 'Fees / charges', align: 'right', render: (r) => formatMoney(r.charges, r.currency) },
  { key: 'total', label: 'Amount due', align: 'right', render: (r) => <b>{formatMoney(r.total, r.currency)}</b> },
  { key: 'paid', label: 'Paid', align: 'right', render: (r) => formatMoney(r.paid, r.currency) },
  { key: 'outstanding', label: 'Remaining', align: 'right', render: (r) => <span className={r.status === 'overdue' ? 'font-bold text-red-700' : ''}>{formatMoney(r.outstanding, r.currency)}</span> },
  { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} />, sort: (r) => STATUSES.indexOf(r.status) },
]

// Due, paid and remaining of a sanction or drawdown, in one line.
const Totals = ({ g }) => (
  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-slate-600">
    <span>Due <b className="text-navy-900">{formatMoney(g.total)}</b></span>
    <span>Paid <b className="text-navy-900">{formatMoney(g.paid)}</b></span>
    <span>Remaining <b className={g.outstanding > 0 ? 'text-navy-950' : 'text-emerald-700'}>{formatMoney(g.outstanding)}</b></span>
  </span>
)

// Cashflows: the repayment schedule loan by loan (sanction, then drawdown), each instalment's principal, interest and
// charges, what is paid and what is left, from the dues the bank's system wrote for each drawdown. Nothing is projected
// here: a due appears only once LAS holds it.
export default function RepaymentSchedulePage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  return (
    <AppShell breadcrumb="Cashflows">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Cashflows" subtitle="Your repayment schedule, loan by loan, as the bank's loan servicing records hold it." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => (data.schedule === null ? <Unavailable what="Your repayment schedule" /> : <Body data={data} filters={filters} setFilters={setFilters} />)}</LoadState>
      </PageContainer>
    </AppShell>
  )
}

function Body({ data, filters, setFilters }) {
  const s = data.summary
  const instalments = useMemo(() => instalmentsOf(data.schedule), [data.schedule])
  const rows = useMemo(() => filterRows(instalments, filters, { dateField: 'dueDate', searchFields: ['disbursementNo', 'sanctionNo', 'status'] }), [instalments, filters])
  const loans = useMemo(() => scheduleBySanction(rows), [rows])
  const next = s.nextDue
  return (
    <>
      <div className={KPI_GRID}>
        <KpiCard label="Next payment" value={next ? formatMoney(next.total) : '—'} caption={next ? `Due ${formatDate(next.date)}` : 'Nothing scheduled'} icon={CalendarClock} />
        <KpiCard label="Overdue amount" value={formatMoney(s.overdue)} caption={s.overdue ? 'Past its due date, still unpaid' : 'Nothing overdue'} icon={AlertTriangle} tone={s.overdue ? 'red' : 'green'} />
        <KpiCard label="Outstanding principal" value={formatMoney(s.outstandingPrincipal)} caption={`${formatMoney(s.principalRepaid)} principal repaid`} icon={Landmark} tone="navy" />
        <KpiCard label="Interest paid" value={formatMoney(s.interestPaid)} caption={`${formatMoney(s.interestCharged)} interest charged so far`} icon={Percent} tone="amber" />
      </div>

      <Panel title="Upcoming payment" subtitle="The next due date across your drawdowns">
        {next ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[['Due date', formatDate(next.date)], ['Principal due', formatMoney(next.principal)], ['Interest due', formatMoney(next.interest)], ['Other charges', formatMoney(next.charges)], ['Total payable', formatMoney(next.total)]].map(([term, value]) => (
              <div key={term} className="rounded-lg bg-[#f7f9fc] px-2.5 py-1.5"><dt className="text-[10.5px] font-semibold text-slate-500">{term}</dt><dd className="text-sm font-extrabold text-navy-950">{value}</dd></div>
            ))}
          </dl>
        ) : <p className="text-xs text-slate-500">No upcoming payment is scheduled.</p>}
      </Panel>

      <Panel title="Repayment schedule" subtitle="By sanction, then drawdown. Paid amounts are what the bank has applied from your approved payments." action={<StatementButtons section="schedule" filters={filters} />}>
        <div className="mb-2">
          <FilterBar filters={filters} onChange={setFilters} dateLabel="Due" selects={[
            { key: 'disbursement', label: 'Disbursement No.', options: disbursementsOf(instalments).map((d) => [d, d]) },
            { key: 'status', label: 'Status', options: STATUSES.map((st) => [st, label(st)]) },
          ]} />
        </div>
        {!loans.length ? (
          <p className="rounded-lg bg-[#f7f9fc] px-3 py-4 text-center text-xs text-slate-500">{instalments.length ? 'No instalments match these filters.' : 'No repayment schedule yet. It appears once a drawdown is disbursed.'}</p>
        ) : (
          <div className="grid gap-2.5">
            {loans.map((loan) => (
              <section key={loan.sanctionNo || 'none'} aria-label={loan.sanctionNo ? `Sanction ${loan.sanctionNo}` : 'Sanction not known'} className="min-w-0 rounded-lg border border-[#e5eaf1]">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5eaf1] bg-[#f7f9fc] px-3 py-1.5">
                  <h3 className="text-[13px] font-extrabold text-navy-950">{loan.sanctionNo ? `Sanction ${loan.sanctionNo}` : 'Sanction not known'}</h3>
                  <Totals g={loan} />
                </header>
                <div className="grid gap-1 p-1.5">
                  {loan.drawdowns.map((d) => (
                    <details key={d.disbursementNo} open={d.outstanding > 0} className="group min-w-0 rounded-md">
                      <summary className="flex min-h-9 cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-[#eef2fb]/60">
                        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-navy-900"><ChevronDown size={14} className="-rotate-90 transition group-open:rotate-0" aria-hidden="true" />Drawdown {d.disbursementNo}<span className="font-medium text-slate-500">· {d.instalments.length} instalment{d.instalments.length === 1 ? '' : 's'}</span></span>
                        <Totals g={d} />
                      </summary>
                      <div className="px-1 pb-1">
                        <DataTable columns={COLUMNS} rows={d.instalments} rowKey={(r) => r.id} minWidth={820} caption={`Instalments of drawdown ${d.disbursementNo}`} initialSort={{ key: 'dueDate', dir: 'asc' }} empty="No instalments." />
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
