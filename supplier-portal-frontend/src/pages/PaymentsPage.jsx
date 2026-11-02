import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Info, ListChecks, Wallet, X } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import { DataTable, FilterBar, KpiCard, LoadState, PageHeader, Panel, StatementButtons, StatusPill, Unavailable } from '../components/finance/FinanceUi'
import { disbursementsOf, filterRows, formatDate, formatMoney, label, useFinance } from '../utils/finance'

const STATUSES = ['pending', 'confirmed', 'allocated', 'rejected', 'cancelled']
const EMPTY = { from: '', to: '', disbursement: '', status: '', search: '' }
const cents = (v) => Math.round((Number(v) || 0) * 100)
const total = (rows, pick) => rows.reduce((a, r) => a + cents(pick(r)), 0) / 100

function PaymentDetail({ payment: p, onClose }) {
  if (!p) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="pay-title" className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h2 id="pay-title" className="text-sm font-extrabold text-navy-950">Receipt {p.receiptNo}</h2>
            <div className="mt-1"><StatusPill status={p.status} /></div>
          </div>
          <button type="button" onClick={onClose} className="interactive-icon" aria-label="Close"><X size={18} /></button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
          {[['Payment date', formatDate(p.paymentDate)], ['Amount', formatMoney(p.amount, p.currency)], ['Payment reference / UTR', p.reference || '—'], ['Mode', p.referenceType || '—'],
            ['Disbursement No.', p.disbursementNo || '—'], ['Sanction No.', p.sanctionNo || '—'], ['Applied to dues', p.applied === null ? 'Can’t be shown now' : formatMoney(p.applied, p.currency)], ['Not yet applied', formatMoney(p.unapplied, p.currency)]]
            .map(([term, value]) => <div key={term} className="min-w-0"><dt className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-slate-500">{term}</dt><dd className="break-words font-semibold text-navy-900">{value}</dd></div>)}
        </dl>
        <h3 className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">How it was applied</h3>
        {p.allocations?.length ? (
          <ul className="divide-y divide-[#eef1f5] rounded-lg border border-[#e5eaf1] text-[12.5px]">
            {p.allocations.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                <span className="min-w-0"><b className="block text-navy-900">{label(a.kind)}</b><span className="text-[11px] text-slate-500">{a.description} · due {formatDate(a.dueDate)}{a.disbursementNo ? ` · ${a.disbursementNo}` : ''}</span></span>
                <b className="tabular-nums">{formatMoney(a.amount, p.currency)}</b>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-slate-500">{p.status === 'pending' ? 'It is applied to your dues once the bank has verified it.' : p.allocations === null ? 'The split can’t be shown right now.' : 'Not applied to any due yet.'}</p>}
      </div>
    </div>
  )
}

// Payments & Receipts: the payments the bank has received from the customer, their verification and how each was
// applied. A payment counts as confirmed only once the bank's checker has approved it.
export default function PaymentsPage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  const [detail, setDetail] = useState(null)
  return (
    <AppShell breadcrumb="Payments & Receipts">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Payments & Receipts" subtitle="Payments you have made towards your loans, and how the bank applied them." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => (data.payments === null ? <Unavailable what="Your payments" /> : <Body data={data} filters={filters} setFilters={setFilters} onOpen={setDetail} />)}</LoadState>
      </PageContainer>
      <PaymentDetail payment={detail} onClose={() => setDetail(null)} />
    </AppShell>
  )
}

function Body({ data, filters, setFilters, onOpen }) {
  const all = data.payments
  const rows = useMemo(() => filterRows(all, filters, { dateField: 'paymentDate', searchFields: ['receiptNo', 'reference', 'disbursementNo', 'status'] }), [all, filters])
  const confirmed = all.filter((p) => ['confirmed', 'allocated'].includes(p.status))
  const columns = [
    { key: 'paymentDate', label: 'Payment date', render: (p) => formatDate(p.paymentDate) },
    { key: 'receiptNo', label: 'Receipt No.', render: (p) => <b className="text-navy-900">{p.receiptNo}</b> },
    { key: 'reference', label: 'Payment reference / UTR', render: (p) => p.reference || '—' },
    { key: 'disbursementNo', label: 'Disbursement No.', render: (p) => p.disbursementNo || '—' },
    { key: 'referenceType', label: 'Mode', render: (p) => p.referenceType || '—' },
    { key: 'amount', label: 'Amount', align: 'right', render: (p) => formatMoney(p.amount, p.currency) },
    { key: 'applied', label: 'Applied', align: 'right', render: (p) => (p.applied === null ? '—' : formatMoney(p.applied, p.currency)), sort: (p) => p.applied ?? -1 },
    { key: 'status', label: 'Status', render: (p) => <StatusPill status={p.status} /> },
  ]
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Confirmed payments" value={formatMoney(total(confirmed, (p) => p.amount))} caption={`${confirmed.length} verified by the bank`} icon={CheckCircle2} tone="green" />
        <KpiCard label="Being verified" value={formatMoney(total(all.filter((p) => p.status === 'pending'), (p) => p.amount))} caption="Not counted until confirmed" icon={Clock} tone="amber" />
        <KpiCard label="Applied to dues" value={data.available.allocations ? formatMoney(total(confirmed, (p) => p.applied)) : '—'} caption="Principal, interest and charges paid" icon={ListChecks} unavailable={!data.available.allocations} />
        <KpiCard label="Not yet applied" value={formatMoney(total(confirmed, (p) => p.unapplied))} caption="Held for your next dues" icon={Wallet} tone="navy" />
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-[#d8e0e9] bg-white px-3 py-2 text-xs text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
        <span>The bank records each payment when it reaches its account and confirms it after verification. To tell us about a payment you have made, or to ask for a receipt, <Link to="/support" className="font-semibold text-brand-700 hover:underline">contact support</Link>.</span>
      </p>
      <Panel title="Payment history" subtitle="Open a payment to see how it was applied to your dues." action={<StatementButtons section="payments" filters={filters} />}>
        <div className="mb-2">
          <FilterBar filters={filters} onChange={setFilters} dateLabel="Paid" selects={[
            { key: 'disbursement', label: 'Disbursement No.', options: disbursementsOf(all).map((d) => [d, d]) },
            { key: 'status', label: 'Status', options: STATUSES.map((st) => [st, label(st)]) },
          ]} />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={onOpen} minWidth={900} caption="Payment history" initialSort={{ key: 'paymentDate', dir: 'desc' }}
          empty={all.length ? 'No payments match these filters.' : 'No payments recorded yet.'} />
      </Panel>
    </>
  )
}
