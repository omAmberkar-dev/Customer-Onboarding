import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import Loader from '../components/common/Loader'
import AgreementPdfViewer from '../components/agreement/AgreementPdfViewer'
import LoanDocumentDialog from '../components/loans/LoanDocumentDialog'
import { card } from '../components/finance/FinanceUi'
import { downloadLoanDocument, downloadStatement, fetchLoanDocumentUrl, getMyLoans } from '../api/vendorApi'
import { DOCUMENTS } from '../utils/loans'
import { formatDate, formatMoney } from '../utils/finance'

const STATEMENTS = [
  ['transactions', 'Account statement'],
  ['schedule', 'Repayment schedule'],
  ['payments', 'Payments & receipts'],
]

// Every PDF LAS has issued for the signed-in customer (GET /vendors/me/loans, scoped by LAS), newest first: the same
// Sanction Memos, Drawdown Memos and invoices the approval emails carry. Items not issued yet are simply not listed.
function documentsOf(journey) {
  const rows = [
    ...(journey?.sanctions || []).filter((s) => s.hasDocument).map((s) => ({ doc: DOCUMENTS.sanction(s), date: s.decidedOn || s.appliedOn, amount: s.limit, currency: s.currency })),
    ...(journey?.drawdowns || []).filter((d) => d.hasDocument).map((d) => ({ doc: DOCUMENTS.drawdown(d), date: d.startDate || d.requestedOn, amount: d.amount, currency: d.currency })),
    ...(journey?.invoices || []).filter((i) => i.hasDocument).map((i) => ({ doc: DOCUMENTS.invoice(i), date: i.dueDate, amount: i.amount, currency: i.currency })),
  ]
  return rows.map((r) => ({ ...r, key: `${r.doc.kind}:${r.doc.id}` })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

// Whether the preview pane is on screen (large screens); elsewhere a document opens full screen.
function useWide() {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const list = window.matchMedia(query)
    const change = () => setWide(list.matches)
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [])
  return wide
}

// One document, as an email attachment: the PDF tile, its name and reference, its date and amount, and Download.
function Attachment({ row, selected, onOpen }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { doc } = row
  const save = async (e) => {
    e.stopPropagation()
    setBusy(true)
    setError('')
    try { await downloadLoanDocument(doc.kind, doc.id, doc.fileName) } catch (err) { setError(err.message || 'Unable to download the document.') } finally { setBusy(false) }
  }
  return (
    <li>
      <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${selected ? 'border-brand-600 bg-[#eef2fb]' : 'border-[#e5eaf1] bg-white hover:border-[#c2cdda] hover:bg-[#f7f9fc]'}`}>
        <button type="button" onClick={() => onOpen(row)} aria-current={selected ? 'true' : undefined} aria-label={`Open ${doc.title} ${doc.subtitle}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40">
          <span className="relative grid h-11 w-9 shrink-0 place-items-end rounded-[5px] border border-red-200 bg-red-50 pb-1 text-red-700" aria-hidden="true">
            <FileText size={18} className="absolute left-1/2 top-1.5 -translate-x-1/2" />
            <b className="w-full text-center text-[8.5px] font-extrabold tracking-wide">PDF</b>
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[13px] font-bold text-navy-950">{doc.title}</b>
            <span className="block truncate text-[11.5px] text-slate-500">{[doc.subtitle, formatDate(row.date)].filter(Boolean).join(' · ')}</span>
          </span>
          {row.amount != null && <span className="hidden shrink-0 text-[12px] font-semibold tabular-nums text-navy-900 sm:block">{formatMoney(row.amount, row.currency)}</span>}
        </button>
        <button type="button" onClick={save} disabled={busy} aria-label={`Download ${doc.title} ${doc.subtitle}`} title="Download" className="grid size-10 shrink-0 place-items-center rounded-lg text-brand-700 transition hover:bg-white disabled:opacity-50">
          {busy ? <Loader /> : <Download size={17} />}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 px-1 text-[11.5px] font-semibold text-red-700">{error}</p>}
    </li>
  )
}

// A statement as PDF or Excel, made by the backend from LAS's records.
function StatementRow({ section, name }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const get = async (format) => {
    setBusy(format)
    setError('')
    try { await downloadStatement(section, format, {}) } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const btn = 'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#c2cdda] bg-white px-2.5 text-[12px] font-semibold text-navy-900 transition hover:border-brand-600 hover:bg-[#eef2fb] disabled:opacity-50 sm:min-h-8'
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-navy-900">{name}</span>
        <span className="flex gap-1.5">
          <button type="button" className={btn} disabled={!!busy} onClick={() => get('pdf')} aria-label={`${name} as PDF`}>{busy === 'pdf' ? <Loader /> : <Download size={14} />} PDF</button>
          <button type="button" className={btn} disabled={!!busy} onClick={() => get('xlsx')} aria-label={`${name} as Excel`}>{busy === 'xlsx' ? <Loader /> : <FileSpreadsheet size={14} />} Excel</button>
        </span>
      </div>
      {error && <p role="alert" className="mt-1 text-[11.5px] font-semibold text-red-700">{error}</p>}
    </li>
  )
}

// Documents: every PDF of the customer's loans in one place, like the attachments of the approval emails — the list on
// the left, the chosen PDF open beside it (on a phone it opens full screen).
export default function DocumentsPage() {
  const wide = useWide()
  const [state, setState] = useState({ journey: null, error: '', loading: true })
  const [selectedKey, setSelectedKey] = useState('')
  const [phoneDoc, setPhoneDoc] = useState(null)
  const closePhone = useCallback(() => setPhoneDoc(null), [])

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }))
    getMyLoans().then((journey) => setState({ journey, error: '', loading: false })).catch((err) => setState((s) => ({ ...s, error: err.message || 'Unable to load your documents.', loading: false })))
  }, [])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => documentsOf(state.journey), [state.journey])
  const selected = rows.find((r) => r.key === selectedKey) || rows[0] || null
  const source = useMemo(() => selected && {
    key: selected.key,
    label: [selected.doc.title, selected.doc.subtitle].filter(Boolean).join(' · '),
    load: () => fetchLoanDocumentUrl(selected.doc.kind, selected.doc.id),
    download: () => downloadLoanDocument(selected.doc.kind, selected.doc.id, selected.doc.fileName),
  }, [selected])
  const open = (row) => { setSelectedKey(row.key); if (!wide) setPhoneDoc(row.doc) }

  const { journey, error, loading } = state
  let body
  if (loading && !journey) body = <div role="status" className="flex items-center gap-2 px-1 py-6 text-sm font-semibold text-slate-600"><Loader /> Loading your documents…</div>
  else if (error && !journey) {
    body = (
      <section className={`${card} px-5 py-8 text-center`}>
        <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
        <button type="button" onClick={load} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#c2cdda] bg-white px-3 text-xs font-semibold text-navy-900 hover:bg-[#eef2fb]"><RefreshCw size={14} /> Try again</button>
      </section>
    )
  } else if (!journey?.onboarded) {
    body = <section className={`${card} px-5 py-8 text-center text-sm text-slate-600`}>Your loan account is being set up. Your sanction and drawdown memos and invoices will appear here as soon as they are issued.</section>
  } else {
    body = (
      <div className="grid gap-3 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-3">
          <section className={`${card} px-3 py-3`} aria-labelledby="docs-list">
            <h2 id="docs-list" className="mb-2 px-1 text-sm font-extrabold text-navy-950">Your documents <span className="ml-1 rounded-full bg-[#eef2fb] px-2 py-0.5 text-[11px] font-bold text-brand-700">{rows.length}</span></h2>
            {journey.invoicesAvailable === false && <p role="status" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Your invoices can’t be shown right now. Please check again later.</p>}
            {rows.length
              ? <ul className="grid gap-1.5" aria-label="Documents">{rows.map((r) => <Attachment key={r.key} row={r} selected={wide && selected?.key === r.key} onOpen={open} />)}</ul>
              : <p className="rounded-lg bg-[#f7f9fc] px-3 py-6 text-center text-xs text-slate-500">No documents yet. Your Sanction Memo appears here once your sanction is approved, then each Drawdown Memo and invoice as it is issued.</p>}
          </section>
          <section className={`${card} px-3.5 py-2`} aria-labelledby="docs-statements">
            <h2 id="docs-statements" className="pt-1 text-sm font-extrabold text-navy-950">Statements</h2>
            <ul className="divide-y divide-[#eef1f5]">{STATEMENTS.map(([section, name]) => <StatementRow key={section} section={section} name={name} />)}</ul>
          </section>
        </div>
        {wide && (
          <section className={`${card} sticky top-20 hidden min-w-0 flex-col p-3 lg:flex`} aria-label="Preview">
            {source
              ? <AgreementPdfViewer source={source} className="h-[calc(100svh-12rem)] min-h-[480px] p-2!" />
              : <p className="grid min-h-[480px] place-items-center text-sm text-slate-500">Choose a document to preview it here.</p>}
          </section>
        )}
      </div>
    )
  }

  return (
    <AppShell breadcrumb="Documents">
      <PageContainer className="grid gap-3 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-extrabold text-[#000000]">Documents</h1>
            <p className="text-xs text-[#5f5f5f]">The PDFs sent with your approval emails, all in one place. Open one to read it, or download it.</p>
          </div>
          {journey?.onboarded && (
            <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c2cdda] bg-white px-3 text-[12.5px] font-semibold text-navy-900 transition hover:border-brand-600 hover:bg-[#eef2fb] disabled:opacity-50">
              {loading ? <Loader /> : <RefreshCw size={14} />} Refresh
            </button>
          )}
        </div>
        {error && journey && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
        {body}
      </PageContainer>
      <LoanDocumentDialog document={phoneDoc} onClose={closePhone} />
    </AppShell>
  )
}
