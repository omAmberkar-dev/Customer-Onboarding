import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Info, ListChecks, Wallet } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import { DataTable, Drawer, Facts, FilterBar, KPI_GRID, KpiCard, LoadState, PageHeader, Panel, StatementButtons, StatusPill, SubHeading, Unavailable } from '../components/finance/FinanceUi'
import { ALLOCATION_LABELS, disbursementsOf, filterRows, formatDate, formatMoney, label, useFinance } from '../utils/finance'

const ALLOCATION = ['pending_approval', 'unallocated', 'partially_allocated', 'allocated', 'rejected', 'cancelled']
// `type` is the allocation filter here (the statement's too: customer_finance.py SECTIONS payments).
const EMPTY = { from: '', to: '', disbursement: '', type: '', search: '' }
const cents = (v) => Math.round((Number(v) || 0) * 100)
const total = (rows, pick) => rows.reduce((a, r) => a + cents(pick(r)), 0) / 100
const CONFIRMED = ['confirmed', 'allocated']
const AllocationPill = ({ status }) => <StatusPill status={status} text={ALLOCATION_LABELS[status]} />

// One receipt: its details, where it stands, and each part of it the bank applied: which sanction, drawdown and due.
function ReceiptDetail({ receipt: p, onClose }) {
  return (
    <Drawer title={`Receipt ${p.receiptNo}`} titleId="receipt-title" onClose={onClose} status={<><StatusPill status={p.status} />{p.allocationStatus && <AllocationPill status={p.allocationStatus} />}</>}>
      <Facts rows={[
        ['Payment date', formatDate(p.paymentDate)], ['Amount', formatMoney(p.amount, p.currency)],
        ['Payment reference / UTR', p.reference || '—'], ['Mode', p.referenceType || '—'],
        ['Purpose', p.purpose || '—'], ['Sanction No.', p.sanctionNo || '—'], ['Disbursement No.', p.disbursementNo || '—'],
        ['Recorded by the bank', formatDate(p.recordedOn)], ['Confirmed', formatDate(p.confirmedOn)], ['Last allocated', formatDate(p.allocatedOn)],
        ['Applied to dues', p.applied === null ? 'Can’t be shown now' : formatMoney(p.applied, p.currency)], ['Not yet applied', formatMoney(p.unapplied, p.currency)],
      ]} />
      <SubHeading>Allocation history</SubHeading>
      {p.allocations?.length ? (
        <ul className="divide-y divide-[#eef1f5] rounded-lg border border-[#e5eaf1] text-[12.5px]" aria-label="Allocation history">
          {p.allocations.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="min-w-0">
                <b className="block text-navy-900">{label(a.kind)} · due {formatDate(a.dueDate)}</b>
                <span className="block text-[11px] text-slate-500">{[a.description, a.sanctionNo && `Sanction ${a.sanctionNo}`, a.disbursementNo && `Drawdown ${a.disbursementNo}`, a.appliedOn && `applied ${formatDate(a.appliedOn)}`].filter(Boolean).join(' · ')}</span>
              </span>
              <b className="shrink-0 tabular-nums">{formatMoney(a.amount, p.currency)}</b>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">{p.status === 'pending' ? 'It is applied to your dues once the bank has approved it.' : p.allocations === null ? 'The allocation can’t be shown right now.' : 'Not applied to any due yet.'}</p>}
    </Drawer>
  )
}

// Receipts: the payments the bank has received from the customer, their approval and allocation, and what each paid.
// A receipt counts as received only once the bank's checker has approved it.
export default function PaymentsPage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  const [detail, setDetail] = useState(null)
  return (
    <AppShell breadcrumb="Receipts">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Receipts" subtitle="Payments the bank has received from you, and how each was allocated to your dues." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => (data.payments === null ? <Unavailable what="Your receipts" /> : <Body data={data} filters={filters} setFilters={setFilters} onOpen={setDetail} />)}</LoadState>
      </PageContainer>
      {detail && <ReceiptDetail receipt={detail} onClose={() => setDetail(null)} />}
    </AppShell>
  )
}

function Body({ data, filters, setFilters, onOpen }) {
  const all = data.payments
  const rows = useMemo(() => filterRows(all, filters, { dateField: 'paymentDate', typeField: 'allocationStatus', searchFields: ['receiptNo', 'reference', 'disbursementNo', 'sanctionNo'] }), [all, filters])
  const confirmed = all.filter((p) => CONFIRMED.includes(p.status))
  const columns = [
    { key: 'paymentDate', label: 'Payment date', render: (p) => formatDate(p.paymentDate) },
    { key: 'receiptNo', label: 'Receipt No.', render: (p) => <b className="text-navy-900">{p.receiptNo}</b> },
    { key: 'reference', label: 'UTR', render: (p) => p.reference || '—' },
    { key: 'sanctionNo', label: 'Sanction No.', render: (p) => p.sanctionNo || '—' },
    { key: 'disbursementNo', label: 'Disbursement No.', render: (p) => p.disbursementNo || '—' },
    { key: 'amount', label: 'Amount', align: 'right', render: (p) => formatMoney(p.amount, p.currency) },
    { key: 'applied', label: 'Allocated', align: 'right', render: (p) => (p.applied === null ? '—' : formatMoney(p.applied, p.currency)), sort: (p) => p.applied ?? -1 },
    { key: 'unapplied', label: 'Unallocated', align: 'right', render: (p) => formatMoney(p.unapplied, p.currency) },
    { key: 'allocationStatus', label: 'Status', render: (p) => <AllocationPill status={p.allocationStatus} />, sort: (p) => ALLOCATION.indexOf(p.allocationStatus) },
  ]
  return (
    <>
      <div className={KPI_GRID}>
        <KpiCard label="Received" value={formatMoney(total(confirmed, (p) => p.amount))} caption={`${confirmed.length} approved by the bank`} icon={CheckCircle2} tone="green" />
        <KpiCard label="Pending approval" value={formatMoney(total(all.filter((p) => p.status === 'pending'), (p) => p.amount))} caption="Not counted until approved" icon={Clock} tone="amber" />
        <KpiCard label="Allocated to dues" value={formatMoney(total(confirmed, (p) => p.applied))} caption="Principal, interest and charges paid" icon={ListChecks} unavailable={!data.available.allocations} />
        <KpiCard label="Unallocated" value={formatMoney(total(confirmed, (p) => p.unapplied))} caption="Held for your next dues" icon={Wallet} tone="navy" />
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-[#d8e0e9] bg-white px-3 py-2 text-xs text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
        <span>The bank records each payment when it reaches its account, approves it, then allocates it to your dues. To tell us about a payment you have made, <Link to="/support" className="font-semibold text-brand-700 hover:underline">contact support</Link>.</span>
      </p>
      <Panel title="Payment history" subtitle="Open a receipt to see its details and which drawdown and due it paid." action={<StatementButtons section="payments" filters={filters} />}>
        <div className="mb-2">
          <FilterBar filters={filters} onChange={setFilters} dateLabel="Paid" selects={[
            { key: 'disbursement', label: 'Disbursement No.', options: disbursementsOf(all).map((d) => [d, d]) },
            { key: 'type', label: 'Allocation', options: ALLOCATION.map((st) => [st, ALLOCATION_LABELS[st]]) },
          ]} />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={onOpen} minWidth={900} caption="Payment history" initialSort={{ key: 'paymentDate', dir: 'desc' }}
          empty={all.length ? 'No receipts match these filters.' : 'No payments received yet.'} />
      </Panel>
    </>
  )
}
