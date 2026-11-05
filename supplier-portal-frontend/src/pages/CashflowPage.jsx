import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Landmark, Scale } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import { DataTable, Drawer, Facts, FilterBar, KPI_GRID, KpiCard, LoadState, PageHeader, Panel, StatementButtons, StatusPill, SubHeading, Unavailable } from '../components/finance/FinanceUi'
import { CategoryBars, MonthlyChart, NetTrendChart } from '../components/finance/Charts'
import { CHART_COLORS, disbursementsOf, filterRows, formatDate, formatMoney, label, useFinance } from '../utils/finance'

// Money moved (disbursements and the customer's receipts) and charges billed (interest, fees and GST SAP posted).
const TYPES = ['disbursement', 'principal_repayment', 'interest_payment', 'fee_payment', 'payment', 'reversal', 'interest_charge', 'fee_charge']
const STATUSES = ['posted', 'pending', 'scheduled', 'rejected', 'cancelled']
const EMPTY = { from: '', to: '', type: '', disbursement: '', status: '', search: '' }
// Which rows the screen shows: actual (posted) money, money still on its way, or both.
const VIEWS = [['posted', 'Actual'], ['open', 'Pending & scheduled'], ['all', 'All']]

// What a row moved or billed: + paid out to the customer, − paid by them, or a charge billed (no money moved yet).
const amountOf = (t) => (t.inflow ? `+${formatMoney(t.inflow, t.currency)}` : t.outflow ? `−${formatMoney(t.outflow, t.currency)}` : t.charged ? formatMoney(t.charged, t.currency) : '—')

// One transaction, and the history it belongs to: every other movement and charge on the same drawdown (or receipt).
function TransactionDetail({ tx, all, onClose }) {
  const related = all.filter((t) => t.id !== tx.id && (tx.disbursementNo ? t.disbursementNo === tx.disbursementNo : t.reference === tx.reference && t.type !== 'disbursement'))
  return (
    <Drawer title="Transaction details" titleId="tx-title" onClose={onClose} status={<StatusPill status={tx.status} />}>
      <Facts rows={[
        ['Date', formatDate(tx.date)], ['Reference', tx.reference], ['Sanction No.', tx.sanctionNo || '—'], ['Disbursement No.', tx.disbursementNo || '—'],
        ['Type', label(tx.type)], ['Description', tx.description], ['Inflow', tx.inflow ? formatMoney(tx.inflow, tx.currency) : '—'],
        ['Outflow', tx.outflow ? formatMoney(tx.outflow, tx.currency) : '—'], ...(tx.charged ? [['Charged', formatMoney(tx.charged, tx.currency)]] : []),
        ['Payment reference / UTR', tx.paymentReference || '—'],
      ]} />
      {tx.status !== 'posted' && <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">Not counted in your totals until it is posted.</p>}
      {tx.charged > 0 && <p className="mt-3 rounded-lg bg-[#f7f9fc] px-3 py-2 text-xs text-slate-600">A charge the bank has billed on your loan. It is paid from your receipts and is not counted as money moved.</p>}
      <SubHeading>{tx.disbursementNo ? `History of drawdown ${tx.disbursementNo}` : `History of receipt ${tx.reference}`}</SubHeading>
      {related.length ? (
        <ul className="max-h-56 divide-y divide-[#eef1f5] overflow-y-auto rounded-lg border border-[#e5eaf1] text-[12.5px]" aria-label="Related transactions">
          {[...related].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="min-w-0"><b className="block text-navy-900">{label(t.type)}</b><span className="block truncate text-[11px] text-slate-500">{formatDate(t.date)} · {t.description}</span></span>
              <b className="shrink-0 tabular-nums">{amountOf(t)}</b>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">Nothing else recorded on it yet.</p>}
    </Drawer>
  )
}

// Transactions: the money that moved between the customer and the bank under their LAS facilities, and the charges the
// bank billed on them.
export default function CashflowPage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  const [view, setView] = useState('posted')
  const [detail, setDetail] = useState(null)

  return (
    <AppShell breadcrumb="Transactions">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Transactions" subtitle="Disbursements, your payments and the charges billed under your loan facilities, as the bank records them." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => (
          <>
            <Body data={data} filters={filters} setFilters={setFilters} view={view} setView={setView} onOpen={setDetail} />
            {detail && <TransactionDetail tx={detail} all={data.transactions} onClose={() => setDetail(null)} />}
          </>
        )}</LoadState>
      </PageContainer>
    </AppShell>
  )
}

function Body({ data, filters, setFilters, view, setView, onOpen }) {
  const s = data.summary
  const all = data.transactions
  const inView = useMemo(() => all.filter((t) => view === 'all' || (view === 'posted' ? t.status === 'posted' : t.status !== 'posted')), [all, view])
  const rows = useMemo(() => filterRows(inView, filters, { dateField: 'date', typeField: 'type', searchFields: ['reference', 'paymentReference', 'description', 'disbursementNo', 'sanctionNo', 'type'] }), [inView, filters])
  const breakdown = useMemo(() => TYPES.map((t) => ({ label: label(t), value: all.filter((x) => x.status === 'posted' && x.type === t).reduce((a, x) => a + (x.inflow || x.outflow || x.charged || 0), 0) })), [all])
  const columns = [
    { key: 'date', label: 'Date', render: (t) => formatDate(t.date) },
    { key: 'reference', label: 'Reference' },
    { key: 'sanctionNo', label: 'Sanction No.', render: (t) => t.sanctionNo || '—' },
    { key: 'disbursementNo', label: 'Disbursement No.', render: (t) => t.disbursementNo || '—' },
    { key: 'type', label: 'Type', render: (t) => label(t.type) },
    { key: 'description', label: 'Description', nowrap: false },
    { key: 'inflow', label: 'Inflow', align: 'right', render: (t) => (t.inflow ? <span className="font-semibold text-emerald-700">+{formatMoney(t.inflow, t.currency)}</span> : '—') },
    { key: 'outflow', label: 'Outflow', align: 'right', render: (t) => (t.outflow ? <span className="font-semibold text-navy-900">−{formatMoney(t.outflow, t.currency)}</span> : '—') },
    { key: 'charged', label: 'Charged', align: 'right', render: (t) => (t.charged ? formatMoney(t.charged, t.currency) : '—'), sort: (t) => t.charged ?? 0 },
    { key: 'status', label: 'Status', render: (t) => <StatusPill status={t.status} /> },
    { key: 'paymentReference', label: 'UTR', render: (t) => t.paymentReference || '—' },
  ]
  return (
    <>
      <div className={KPI_GRID}>
        <KpiCard label="Total inflows" value={formatMoney(s.inflows)} caption="Disbursements posted to you" icon={ArrowDownLeft} tone="blue" unavailable={!data.available.flows} />
        <KpiCard label="Total outflows" value={formatMoney(s.outflows)} caption={s.pendingPayments ? `${formatMoney(s.pendingPayments)} more being verified` : 'Your confirmed payments'} icon={ArrowUpRight} tone="amber" unavailable={!data.available.payments} />
        <KpiCard label="Net cashflow" value={formatMoney(s.net)} caption="Actual inflows − actual outflows" icon={Scale} tone="navy" unavailable={!data.available.flows || !data.available.payments} />
        <KpiCard label="Current outstanding" value={formatMoney(s.outstanding)} caption="Principal + interest and charges already due" icon={Landmark} tone="red" unavailable={s.outstanding === null} />
      </div>
      {(!data.available.flows || !data.available.payments) && <Unavailable what="Some of your money movements" />}

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Monthly inflow vs outflow" subtitle="Posted money only, last 12 months">
          <MonthlyChart monthly={s.monthly} />
        </Panel>
        <div className="grid min-w-0 gap-3">
          <Panel title="Net cashflow trend" subtitle="Inflow − outflow, by month"><NetTrendChart monthly={s.monthly} /></Panel>
          <Panel title="By transaction type" subtitle="Posted amounts"><CategoryBars rows={breakdown} color={CHART_COLORS.inflow} /></Panel>
        </div>
      </div>

      <Panel title="Transaction history" subtitle="Open a row for its drawdown's history. Pending and scheduled items, and charges billed, are never counted in the money totals." action={<StatementButtons section="transactions" filters={{ ...filters, status: filters.status || (view === 'posted' ? 'posted' : '') }} />}>
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
        <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} onRowClick={onOpen} minWidth={1080} caption="Transaction history"
          initialSort={{ key: 'date', dir: 'desc' }} empty={all.length ? 'No transactions match these filters.' : 'No transactions yet. Disbursements, your payments and charges appear here once the bank records them.'} />
      </Panel>
    </>
  )
}
