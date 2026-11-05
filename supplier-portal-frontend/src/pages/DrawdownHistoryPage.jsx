import { useCallback, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, Clock, Download, Eye, FileStack } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Loader from '../components/common/Loader'
import LoanDocumentDialog from '../components/loans/LoanDocumentDialog'
import { DataTable, Drawer, Facts, FilterBar, KPI_GRID, KpiCard, LoadState, PageHeader, Panel, StatusPill, SubHeading } from '../components/finance/FinanceUi'
import { downloadLoanDocument } from '../api/vendorApi'
import { APPROVAL_LABELS, approvalSteps, filterRows, formatDate, formatMoney, label, useFinance } from '../utils/finance'
import { DOCUMENTS } from '../utils/loans'

// The statuses LAS records for a drawdown. Draft and Cancelled are not kept by LAS, so they never appear.
const STATUSES = ['pending_approval', 'submitted', 'approved', 'disbursed', 'rejected']
const APPROVALS = ['maker', 'checker', 'approved', 'rejected']
// `type` filters the sanction here (filterRows' shared filter); `approval` is this screen's own.
const EMPTY = { from: '', to: '', type: '', approval: '', search: '' }
const cents = (v) => Math.round((Number(v) || 0) * 100)
const ApprovalPill = ({ approval }) => (approval ? <StatusPill status={approval} text={APPROVAL_LABELS[approval]} /> : '—')

// Maker → Checker → Approved (or Rejected), as chips: done, current or stopped.
function ApprovalTrack({ approval }) {
  const tone = { done: 'border-emerald-200 bg-emerald-50 text-emerald-800', current: 'border-brand-600 bg-brand-50 text-brand-700', upcoming: 'border-slate-200 bg-white text-slate-400', stopped: 'border-red-200 bg-red-50 text-red-700' }
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Approval">
      {approvalSteps(approval).map(([key, text, state], i) => (
        <li key={key} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-3 bg-[#c2cdda]" aria-hidden="true" />}
          <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${tone[state]}`} aria-current={state === 'current' ? 'step' : undefined}>{text}</span>
        </li>
      ))}
    </ol>
  )
}

// The Drawdown Memo of an approved drawdown: the same PDF Loans & Sanctions shows (GET /vendors/me/loans/documents).
function MemoActions({ drawdown: d, onView }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const doc = DOCUMENTS.drawdown({ id: d.documentId, drawdownNo: d.disbursementNo, requestNo: d.applicationNo })
  const save = async () => {
    setBusy(true)
    setError('')
    try { await downloadLoanDocument(doc.kind, doc.id, doc.fileName) } catch (err) { setError(err.message || 'Unable to download the document.') } finally { setBusy(false) }
  }
  const btn = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onView(doc)} className={`${btn} border-brand-600 bg-brand-600 text-white hover:bg-brand-700`}><Eye size={14} /> View Drawdown Memo</button>
      <button type="button" onClick={save} disabled={busy} className={`${btn} border-[#c2cdda] bg-white text-navy-900 hover:border-brand-600 hover:bg-[#eef2fb]`} aria-label="Download Drawdown Memo">{busy ? <Loader /> : <Download size={14} />} Download</button>
      {error && <p role="alert" className="w-full text-xs font-semibold text-red-700">{error}</p>}
    </div>
  )
}

// One drawdown: its facts, its approval steps, the money that moved on it, what is left to repay, and its memo.
function DrawdownDetail({ drawdown: d, data, onClose, onView }) {
  const moves = d.disbursementNo ? data.transactions.filter((t) => t.disbursementNo === d.disbursementNo) : []
  const dues = data.schedule && d.disbursementNo ? data.schedule.filter((l) => l.disbursementNo === d.disbursementNo) : null
  const sumOf = (pick) => dues.reduce((a, l) => a + cents(pick(l)), 0) / 100
  return (
    <Drawer wide title={d.disbursementNo ? `Drawdown ${d.disbursementNo}` : `Drawdown request ${d.applicationNo}`} titleId="drawdown-title" onClose={onClose} status={<><StatusPill status={d.status} /><ApprovalPill approval={d.approval} /></>}>
      <Facts rows={[
        ['Drawdown No.', d.disbursementNo || 'Given once approved'], ['Request No.', d.applicationNo], ['Sanction No.', d.sanctionNo || '—'],
        ['Requested', formatMoney(d.requestedAmount, d.currency)], ['Approved', d.approvedAmount === null ? '—' : formatMoney(d.approvedAmount, d.currency)],
        ['Disbursed', d.disbursedAmount === null ? '—' : formatMoney(d.disbursedAmount, d.currency)], ['Disbursed on', formatDate(d.disbursedOn)],
        ['Interest rate', d.rate === null ? '—' : `${Number(d.rate)}% p.a.`], ['Repay by', formatDate(d.maturityDate)],
      ]} />
      <SubHeading>Approval</SubHeading>
      <ApprovalTrack approval={d.approval} />
      {d.stageHistory?.length > 0 && (
        <ol className="mt-2 grid gap-1 border-l-2 border-[#d8e0e9] pl-3 text-[12px]" aria-label="Approval history">
          {d.stageHistory.map((s, i) => <li key={i} className="flex flex-wrap justify-between gap-x-3"><span className="font-semibold text-navy-900">{s.label}</span><span className="text-slate-500">{formatDate(s.on)}</span></li>)}
        </ol>
      )}
      <SubHeading>Transaction history</SubHeading>
      {moves.length ? (
        <ul className="divide-y divide-[#eef1f5] rounded-lg border border-[#e5eaf1] text-[12.5px]" aria-label="Transaction history">
          {moves.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="min-w-0"><b className="block text-navy-900">{label(t.type)}</b><span className="block text-[11px] text-slate-500">{formatDate(t.date)} · {t.description}{t.status !== 'posted' ? ` · ${label(t.status)}` : ''}</span></span>
              <b className="shrink-0 tabular-nums">{formatMoney(t.inflow || t.outflow || t.charged, t.currency)}</b>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">{d.disbursementNo ? 'No money has moved on this drawdown yet.' : 'Transactions start once the drawdown is approved and paid out.'}</p>}
      {dues && dues.length > 0 && (
        <>
          <SubHeading>Repayment</SubHeading>
          <Facts rows={[['Total due', formatMoney(sumOf((l) => l.amount), d.currency)], ['Paid', formatMoney(sumOf((l) => l.paid), d.currency)], ['Remaining', formatMoney(sumOf((l) => l.outstanding), d.currency)], ['Instalments', String(new Set(dues.map((l) => l.dueDate)).size)]]} />
        </>
      )}
      {d.disbursementNo && dues === null && <p className="mt-2 text-xs text-slate-500">The repayment figures can’t be shown right now.</p>}
      {d.documentId && <MemoActions drawdown={d} onView={onView} />}
    </Drawer>
  )
}

// Drawdown History: every drawdown request under the customer's facilities, its approval and its disbursement.
export default function DrawdownHistoryPage() {
  const finance = useFinance()
  const [filters, setFilters] = useState(EMPTY)
  const [detail, setDetail] = useState(null)
  const [viewing, setViewing] = useState(null)
  const closeViewer = useCallback(() => setViewing(null), [])
  return (
    <AppShell breadcrumb="Drawdown History">
      <PageContainer className="grid gap-3 pb-4">
        <PageHeader title="Drawdown History" subtitle="Your drawdown requests, from approval to disbursement." onRefresh={finance.reload} loading={finance.loading} />
        <LoadState finance={finance}>{(data) => (
          <>
            <Body data={data} filters={filters} setFilters={setFilters} onOpen={setDetail} />
            {detail && <DrawdownDetail drawdown={detail} data={data} onClose={() => setDetail(null)} onView={setViewing} />}
          </>
        )}</LoadState>
      </PageContainer>
      <LoanDocumentDialog document={viewing} onClose={closeViewer} />
    </AppShell>
  )
}

function Body({ data, filters, setFilters, onOpen }) {
  const all = data.drawdowns
  const rows = useMemo(() => filterRows(all, filters, { dateField: 'appliedOn', typeField: 'sanctionNo', searchFields: ['applicationNo', 'disbursementNo', 'sanctionNo'] })
    .filter((d) => !filters.approval || d.approval === filters.approval), [all, filters])
  const count = (st) => all.filter((d) => st.includes(d.status)).length
  const columns = [
    { key: 'disbursementNo', label: 'Drawdown No.', render: (d) => (d.disbursementNo ? <b className="text-navy-900">{d.disbursementNo}</b> : <span className="text-slate-500">Request {d.applicationNo}</span>), sort: (d) => d.disbursementNo || d.applicationNo },
    { key: 'sanctionNo', label: 'Sanction No.', render: (d) => d.sanctionNo || '—' },
    { key: 'requestedAmount', label: 'Requested', align: 'right', render: (d) => formatMoney(d.requestedAmount, d.currency) },
    { key: 'appliedOn', label: 'Requested on', render: (d) => formatDate(d.appliedOn) },
    { key: 'approval', label: 'Approval', render: (d) => <ApprovalPill approval={d.approval} />, sort: (d) => APPROVALS.indexOf(d.approval) },
    { key: 'disbursedAmount', label: 'Disbursed', align: 'right', render: (d) => (d.disbursedAmount === null ? '—' : formatMoney(d.disbursedAmount, d.currency)), sort: (d) => d.disbursedAmount ?? -1 },
    { key: 'disbursedOn', label: 'Disbursed on', render: (d) => formatDate(d.disbursedOn) },
    { key: 'status', label: 'Status', render: (d) => <StatusPill status={d.status} />, sort: (d) => STATUSES.indexOf(d.status) },
  ]
  return (
    <>
      <div className={KPI_GRID}>
        <KpiCard label="Requests" value={all.length} caption="All drawdown requests" icon={FileStack} />
        <KpiCard label="Pending approval" value={count(['pending_approval', 'submitted'])} caption="With the bank's maker or checker" icon={Clock} tone="amber" />
        <KpiCard label="Approved" value={count(['approved', 'disbursed'])} caption={`${count(['disbursed'])} disbursed`} icon={CheckCircle2} tone="green" />
        <KpiCard label="Disbursed amount" value={formatMoney(data.summary.disbursed)} caption="Posted payouts only" icon={Banknote} tone="navy" unavailable={!data.available.flows} />
      </div>
      <Panel title="Drawdown requests" subtitle="Open a drawdown for its approval steps, transactions and memo. Only a posted payout counts as disbursed.">
        <div className="mb-2">
          <FilterBar filters={filters} onChange={setFilters} dateLabel="Requested" selects={[
            { key: 'type', label: 'Sanction No.', options: [...new Set(all.map((d) => d.sanctionNo).filter(Boolean))].map((n) => [n, n]) },
            { key: 'approval', label: 'Approval', options: APPROVALS.map((a) => [a, APPROVAL_LABELS[a]]) },
          ]} />
        </div>
        <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} onRowClick={onOpen} minWidth={920} caption="Drawdown requests" initialSort={{ key: 'appliedOn', dir: 'desc' }}
          empty={all.length ? 'No drawdowns match these filters.' : 'No drawdown requests yet. Once a sanction is approved, your relationship manager raises drawdowns for you.'} />
      </Panel>
    </>
  )
}
