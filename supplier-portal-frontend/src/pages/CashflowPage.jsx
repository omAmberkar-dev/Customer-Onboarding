import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Landmark, Scale, X } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import { DataTable, FilterBar, KpiCard, LoadState, PageHeader, Panel, StatementButtons, StatusPill, Unavailable } from '../components/finance/FinanceUi'
import { CategoryBars, MonthlyChart, NetTrendChart } from '../components/finance/Charts'
import { CHART_COLORS, disbursementsOf, filterRows, formatDate, formatMoney, label, useFinance } from '../utils/finance'

const TYPES = ['disbursement', 'principal_repayment', 'interest_payment', 'fee_payment', 'payment', 'reversal']
const STATUSES = ['posted', 'pending', 'scheduled', 'rejected', 'cancelled']
const EMPTY = { from: '', to: '', type: '', disbursement: '', status: '', search: '' }
// Which rows the screen shows: actual (posted) money, money still on its way, or both.
const VIEWS = [['posted', 'Actual'], ['open', 'Pending & scheduled'], ['all', 'All']]

function TransactionDetail({ tx, onClose }) {
  if (!tx) return null
  const rows = [
    ['Date', formatDate(tx.date)], ['Reference', tx.reference], ['Disbursement No.', tx.disbursementNo || '—'], ['Sanction No.', tx.sanctionNo || '—'],
    ['Type', label(tx.type)], ['Description', tx.description], ['Inflow', tx.inflow ? formatMoney(tx.inflow, tx.currency) : '—'],
    ['Outflow', tx.outflow ? formatMoney(tx.outflow, tx.currency) : '—'], ['Payment reference / UTR', tx.paymentReference || '—'],
  ]
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="tx-title" className="w-full max-w-md rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h2 id="tx-title" className="text-sm font-extrabold text-navy-950">Transaction details</h2>
            <div className="mt-1"><StatusPill status={tx.status} /></div>
          </div>
          <button type="button" onClick={onClose} className="interactive-icon" aria-label="Close"><X size={18} /></button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
          {rows.map(([term, value]) => <div key={term} className="min-w-0"><dt className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-slate-500">{term}</dt><dd className="break-words font-semibold text-navy-900">{value}</dd></div>)}
        </dl>
        {tx.status !== 'posted' && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">Not counted in your totals until it is posted.</p>}
      </div>
    </div>
  )
}

// Cashflow & Transactions: the money that moved between the customer and the bank under their LAS facilities.
export default function CashflowPage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  const [view, setView] = useState('posted')
  const [detail, setDetail] = useState(null)

  return (
    <AppShell breadcrumb="Cashflow & Transactions">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Cashflow & Transactions" subtitle="Money paid out to you and paid by you under your loan facilities, as the bank records it." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => <Body data={data} filters={filters} setFilters={setFilters} view={view} setView={setView} onOpen={setDetail} />}</LoadState>
      </PageContainer>
      <TransactionDetail tx={detail} onClose={() => setDetail(null)} />
    </AppShell>
  )
}

function Body({ data, filters, setFilters, view, setView, onOpen }) {
  const s = data.summary
  const all = data.transactions
  const inView = useMemo(() => all.filter((t) => view === 'all' || (view === 'posted' ? t.status === 'posted' : t.status !== 'posted')), [all, view])
  const rows = useMemo(() => filterRows(inView, filters, { dateField: 'date', typeField: 'type', searchFields: ['reference', 'paymentReference', 'description', 'disbursementNo', 'type'] }), [inView, filters])
  const breakdown = useMemo(() => TYPES.map((t) => ({ label: label(t), value: all.filter((x) => x.status === 'posted' && x.type === t).reduce((a, x) => a + (x.inflow || x.outflow), 0) })), [all])
  const columns = [
    { key: 'date', label: 'Date', render: (t) => formatDate(t.date) },
    { key: 'reference', label: 'Reference' },
    { key: 'disbursementNo', label: 'Disbursement No.', render: (t) => t.disbursementNo || '—' },
    { key: 'type', label: 'Type', render: (t) => label(t.type) },
    { key: 'description', label: 'Description', nowrap: false },
    { key: 'inflow', label: 'Inflow', align: 'right', render: (t) => (t.inflow ? <span className="font-semibold text-emerald-700">+{formatMoney(t.inflow, t.currency)}</span> : '—') },
    { key: 'outflow', label: 'Outflow', align: 'right', render: (t) => (t.outflow ? <span className="font-semibold text-navy-900">−{formatMoney(t.outflow, t.currency)}</span> : '—') },
    { key: 'currency', label: 'Currency' },
    { key: 'status', label: 'Status', render: (t) => <StatusPill status={t.status} /> },
    { key: 'paymentReference', label: 'UTR', render: (t) => t.paymentReference || '—' },
  ]
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total inflows" value={formatMoney(s.inflows)} caption="Disbursements posted to you" icon={ArrowDownLeft} tone="blue" unavailable={!data.available.flows} />
        <KpiCard label="Total outflows" value={formatMoney(s.outflows)} caption={s.pendingPayments ? `${formatMoney(s.pendingPayments)} more being verified` : 'Your confirmed payments'} icon={ArrowUpRight} tone="amber" unavailable={!data.available.payments} />
        <KpiCard label="Net cashflow" value={formatMoney(s.net)} caption="Actual inflows − actual outflows" icon={Scale} tone="navy" unavailable={!data.available.flows || !data.available.payments} />
        <KpiCard label="Current outstanding" value={formatMoney(s.outstanding)} caption="Principal + interest and charges already due" icon={Landmark} tone="red" unavailable={s.outstanding === null} />
      </div>
      {(!data.available.flows || !data.available.payments) && <Unavailable what="Some of your money movements" />}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Monthly inflow vs outflow" subtitle="Posted money only, last 12 months">
          <MonthlyChart monthly={s.monthly} />
        </Panel>
        <div className="grid gap-3">
          <Panel title="Net cashflow trend" subtitle="Inflow − outflow, by month"><NetTrendChart monthly={s.monthly} /></Panel>
          <Panel title="By transaction type" subtitle="Posted amounts"><CategoryBars rows={breakdown} color={CHART_COLORS.inflow} /></Panel>
        </div>
      </div>

      <Panel title="Transaction history" subtitle="Pending and scheduled items are shown apart and never counted in the totals." action={<StatementButtons section="transactions" filters={{ ...filters, status: filters.status || (view === 'posted' ? 'posted' : '') }} />}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Which transactions">
          {VIEWS.map(([value, text]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)} className={`rounded-full border px-3 py-1 text-xs transition ${view === value ? 'border-brand-600 bg-brand-600 font-bold text-white' : 'border-[#c2cdda] bg-white font-medium text-navy-900 hover:bg-brand-50'}`}>{text}</button>
          ))}
        </div>
        <div className="mb-2">
          <FilterBar filters={filters} onChange={setFilters} selects={[
            { key: 'type', label: 'Type', options: TYPES.map((t) => [t, label(t)]) },
            { key: 'disbursement', label: 'Disbursement No.', options: disbursementsOf(all).map((d) => [d, d]) },
            { key: 'status', label: 'Status', options: STATUSES.map((t) => [t, label(t)]) },
          ]} />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} onRowClick={onOpen} minWidth={1000} caption="Transaction history"
          initialSort={{ key: 'date', dir: 'desc' }} empty={all.length ? 'No transactions match these filters.' : 'No transactions yet. Disbursements and your payments appear here once the bank records them.'} />
      </Panel>
    </>
  )
}
