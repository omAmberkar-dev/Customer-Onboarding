import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Landmark, Percent } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import { DataTable, FilterBar, KpiCard, LoadState, PageHeader, Panel, StatementButtons, StatusPill, Unavailable } from '../components/finance/FinanceUi'
import { disbursementsOf, filterRows, formatDate, formatMoney, instalmentsOf, label, useFinance } from '../utils/finance'

const STATUSES = ['overdue', 'due', 'partially_paid', 'upcoming', 'paid']
const EMPTY = { from: '', to: '', disbursement: '', status: '', search: '' }

// Repayment Schedule: each instalment's principal, interest and charges, what is paid and what is left, from the dues
// the bank's system wrote for each drawdown. Nothing is projected here: a due appears only once LAS holds it.
export default function RepaymentSchedulePage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  return (
    <AppShell breadcrumb="Repayment Schedule">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Repayment Schedule" subtitle="Your instalments as the bank's loan servicing records hold them." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => (data.schedule === null ? <Unavailable what="Your repayment schedule" /> : <Body data={data} filters={filters} setFilters={setFilters} />)}</LoadState>
      </PageContainer>
    </AppShell>
  )
}

function Body({ data, filters, setFilters }) {
  const s = data.summary
  const instalments = useMemo(() => instalmentsOf(data.schedule), [data.schedule])
  const rows = useMemo(() => filterRows(instalments, filters, { dateField: 'dueDate', searchFields: ['disbursementNo', 'sanctionNo', 'status'] }), [instalments, filters])
  const next = s.nextDue
  const columns = [
    { key: 'disbursementNo', label: 'Disbursement No.', render: (r) => <b className="text-navy-900">{r.disbursementNo}</b> },
    { key: 'instalment', label: 'Instalment', align: 'right', sort: (r) => r.instalment },
    { key: 'dueDate', label: 'Due date', render: (r) => formatDate(r.dueDate) },
    { key: 'principal', label: 'Principal', align: 'right', render: (r) => formatMoney(r.principal, r.currency) },
    { key: 'interest', label: 'Interest', align: 'right', render: (r) => formatMoney(r.interest, r.currency) },
    { key: 'charges', label: 'Fees / charges', align: 'right', render: (r) => formatMoney(r.charges, r.currency) },
    { key: 'total', label: 'Total payable', align: 'right', render: (r) => <b>{formatMoney(r.total, r.currency)}</b> },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => formatMoney(r.paid, r.currency) },
    { key: 'outstanding', label: 'Outstanding', align: 'right', render: (r) => <span className={r.status === 'overdue' ? 'font-bold text-red-700' : ''}>{formatMoney(r.outstanding, r.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} />, sort: (r) => STATUSES.indexOf(r.status) },
  ]
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <Panel title="Instalments" subtitle="Paid amounts are what the bank has applied from your confirmed payments." action={<StatementButtons section="schedule" filters={filters} />}>
        <div className="mb-2">
          <FilterBar filters={filters} onChange={setFilters} dateLabel="Due" selects={[
            { key: 'disbursement', label: 'Disbursement No.', options: disbursementsOf(instalments).map((d) => [d, d]) },
            { key: 'status', label: 'Status', options: STATUSES.map((st) => [st, label(st)]) },
          ]} />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} minWidth={1060} caption="Instalments" initialSort={{ key: 'dueDate', dir: 'asc' }}
          empty={instalments.length ? 'No instalments match these filters.' : 'No repayment schedule yet. It appears once a drawdown is disbursed.'} />
      </Panel>
    </>
  )
}
