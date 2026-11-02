import { useMemo, useState } from 'react'
import { Banknote, CheckCircle2, Clock, FileStack } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import { DataTable, FilterBar, KpiCard, LoadState, PageHeader, Panel, StatusPill } from '../components/finance/FinanceUi'
import { filterRows, formatDate, formatMoney, label, useFinance } from '../utils/finance'

// The statuses LAS records for a drawdown. Draft and Cancelled are not kept by LAS, so they never appear.
const STATUSES = ['pending_approval', 'approved', 'disbursed', 'rejected']
const EMPTY = { from: '', to: '', type: '', status: '', search: '' }

// Drawdown History: every drawdown application under the customer's facilities and where it stands.
export default function DrawdownHistoryPage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  return (
    <AppShell breadcrumb="Drawdown History">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Drawdown History" subtitle="Your drawdown applications, from request to disbursement." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => <Body data={data} filters={filters} setFilters={setFilters} />}</LoadState>
      </PageContainer>
    </AppShell>
  )
}

function Body({ data, filters, setFilters }) {
  const all = data.drawdowns
  // The sanction filter rides on the shared `type` filter (sanctionNo is a drawdown's type here).
  const rows = useMemo(() => filterRows(all, filters, { dateField: 'appliedOn', typeField: 'sanctionNo', searchFields: ['applicationNo', 'disbursementNo', 'sanctionNo', 'status'] }), [all, filters])
  const count = (st) => all.filter((d) => st.includes(d.status)).length
  const columns = [
    { key: 'applicationNo', label: 'Application No.', render: (d) => <b className="text-navy-900">{d.applicationNo}</b> },
    { key: 'disbursementNo', label: 'Disbursement No.', render: (d) => d.disbursementNo || '—' },
    { key: 'sanctionNo', label: 'Sanction No.', render: (d) => d.sanctionNo || '—' },
    { key: 'requestedAmount', label: 'Requested', align: 'right', render: (d) => formatMoney(d.requestedAmount, d.currency) },
    { key: 'approvedAmount', label: 'Approved', align: 'right', render: (d) => (d.approvedAmount === null ? '—' : formatMoney(d.approvedAmount, d.currency)), sort: (d) => d.approvedAmount ?? -1 },
    { key: 'disbursedAmount', label: 'Disbursed', align: 'right', render: (d) => (d.disbursedAmount === null ? '—' : formatMoney(d.disbursedAmount, d.currency)), sort: (d) => d.disbursedAmount ?? -1 },
    { key: 'appliedOn', label: 'Applied on', render: (d) => formatDate(d.appliedOn) },
    { key: 'approvedOn', label: 'Approved on', render: (d) => formatDate(d.approvedOn) },
    { key: 'disbursedOn', label: 'Disbursed on', render: (d) => formatDate(d.disbursedOn) },
    { key: 'rate', label: 'Rate', align: 'right', render: (d) => (d.rate === null ? '—' : `${Number(d.rate)}% p.a.`), sort: (d) => d.rate ?? -1 },
    { key: 'status', label: 'Status', render: (d) => <StatusPill status={d.status} /> },
  ]
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Applications" value={all.length} caption="All drawdown requests" icon={FileStack} />
        <KpiCard label="Pending approval" value={count(['pending_approval', 'submitted'])} caption="With the bank's checker" icon={Clock} tone="amber" />
        <KpiCard label="Approved" value={count(['approved', 'disbursed'])} caption={`${count(['disbursed'])} disbursed`} icon={CheckCircle2} tone="green" />
        <KpiCard label="Disbursed amount" value={formatMoney(data.summary.disbursed)} caption="Posted payouts only" icon={Banknote} tone="navy" unavailable={!data.available.flows} />
      </div>
      <Panel title="Drawdown applications" subtitle="Only a posted payout counts as disbursed; an approved drawdown waits for its payout.">
        <div className="mb-2">
          <FilterBar filters={filters} onChange={setFilters} dateLabel="Applied" selects={[
            { key: 'type', label: 'Sanction No.', options: [...new Set(all.map((d) => d.sanctionNo).filter(Boolean))].map((n) => [n, n]) },
            { key: 'status', label: 'Status', options: STATUSES.map((st) => [st, label(st)]) },
          ]} />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} minWidth={1080} caption="Drawdown applications" initialSort={{ key: 'appliedOn', dir: 'desc' }}
          empty={all.length ? 'No drawdowns match these filters.' : 'No drawdown requests yet. Once a sanction is approved, your relationship manager raises drawdowns for you.'} />
      </Panel>
    </>
  )
}
