import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Columns2,
  Eye,
  FileText,
  Inbox,
  LoaderCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { getInvoiceReturnReasons, replaceInvoice } from '../../api/vendorApi'
import useAuth from '../../hooks/useAuth'
import { displayProfileValue } from '../layout/profileFields'
import { statusDetails } from '../../utils/invoiceStatus'
import ReplaceInvoiceModal from './ReplaceInvoiceModal'
import VendorDocumentsTab from './VendorDocumentsTab'
import useAgreementHold, { HOLD_TOOLTIP } from '../../hooks/useAgreementHold'
import useInvoiceVersions from '../../hooks/useInvoiceVersions'
import { VersionHeaderActions, VersionLabel, VersionPill } from './InvoiceVersionBar'
import InvoicePagination from './InvoicePagination'
import { CompareOverlay, loadInvoicePdfUrl, pdfSrc } from './InvoiceCompare'
import { pick, display, numberValue, amount, dateValue, invoiceNumber, vendorName, vendorGstin, vendorGstinVerified, totalValue, FlaggedContext, tabOfField } from './invoiceFields'
import { DetailSection, Overview, Amounts } from './invoiceDetailViews'
import SortableHeaderCell from '../../utils/SortableHeaderCell'
import { nextSortState, sortRows } from '../../utils/tableSort'

// The global `button { font: inherit }` rule beats Tailwind's font utilities (they are layered), so button text sizes are set inline.
// Table links are buttons too, so they need the same inline sizing.
const LINK_XS = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 400 }
const LINK_XS_BOLD = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 700 }
const BTN_XS_BOLD = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }
const BTN_11_SEMI = { fontSize: '0.6875rem', lineHeight: '1rem', fontWeight: 600 }


// Most recently uploaded or actioned (returned, replaced, status changed) first; then the newest upload, then the (numeric) id when timestamps
// are equal or missing.
const timeOf = (value) => new Date(value).getTime() || 0
const byNewestUpload = (a, b) => {
  const activityDiff = timeOf(b.activityAt ?? b.uploadedAt) - timeOf(a.activityAt ?? a.uploadedAt)
  if (activityDiff) return activityDiff
  const uploadDiff = timeOf(b.uploadedAt) - timeOf(a.uploadedAt)
  if (uploadDiff) return uploadDiff
  return (Number(b.id) || 0) - (Number(a.id) || 0)
}

const uploaderType = (invoice) => (invoice.uploaded_by_type === 'maker' ? 'maker' : 'vendor')

const SOURCE_TABS = [
  ['all', 'All Invoices'],
  ['vendor', 'Uploaded by Me'],
  ['maker', 'Uploaded by Relationship Manager'],
]

const uploadedByLabel = (invoice, uploadedBy) => (uploaderType(invoice) === 'maker' ? 'Relationship Manager' : pick(invoice, ['uploaded_by', 'uploadedBy'], uploadedBy || ''))

const EMPTY_ADVANCED ={ dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' }

const isoDate = (value) => {
  if (!value) return ''
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function matchesAdvanced(invoice, { dateFrom, dateTo, minAmount, maxAmount }) {
  if (dateFrom || dateTo) {
    const date = isoDate(pick(invoice, ['invoice_date']))
    if (!date || (dateFrom && date < dateFrom) || (dateTo && date > dateTo)) return false
  }
  if (minAmount !== '' || maxAmount !== '') {
    const total = numberValue(totalValue(invoice))
    if (total === null || (minAmount !== '' && total < Number(minAmount)) || (maxAmount !== '' && total > Number(maxAmount))) return false
  }
  return true
}

export default function InvoiceList({ invoices, isLoading = false, error = '', uploadedBy = '', uploadSignal = 0, onReplaced = async () => [] }) {
  // While the vendor's agreement has expired the server refuses replacements, so the control says so instead of looking broken.
  const { onHold } = useAgreementHold()
  const [replacing, setReplacing] = useState(null)
  // The invoice whose vendor details are open (from the vendor name in the table).
  const [vendorInfo, setVendorInfo] = useState(null)
  const [replaceBusy, setReplaceBusy] = useState(false)
  const [replaceError, setReplaceError] = useState('')
  // After a successful replace from the popup: the refreshed invoice, shown once the user chooses to look at it.
  const [replacedInvoice, setReplacedInvoice] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('vendor')
  const [advanced, setAdvanced] = useState(EMPTY_ADVANCED)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(5)
  const [sort, setSort] = useState(null)
  const [preview, setPreview] = useState(null)
  const extractingInvoice = invoices.find((invoice) => invoice.extractionStatus === 'extracting')

  const sourceCounts = useMemo(() => ({
    all: invoices.length,
    vendor: invoices.filter((invoice) => uploaderType(invoice) === 'vendor').length,
    maker: invoices.filter((invoice) => uploaderType(invoice) === 'maker').length,
  }), [invoices])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matching = [...invoices].sort(byNewestUpload).filter((invoice) => {
      const matchesSource = sourceFilter === 'all' || uploaderType(invoice) === sourceFilter
      const matchesStatus = filter === 'all' || statusDetails(invoice).filter === filter
      const text = `${vendorName(invoice)} ${vendorGstin(invoice)} ${invoiceNumber(invoice)} ${invoice.name}`.toLowerCase()
      return matchesSource && matchesStatus && matchesAdvanced(invoice, advanced) && (!term || text.includes(term))
    })
    // Sort the full filtered set before pagination; raw values (not the formatted display text) are compared.
    return sortRows(matching, sort, (invoice, key) => {
      switch (key) {
        case 'vendor': return vendorName(invoice)
        case 'uploadedBy': return uploadedByLabel(invoice, uploadedBy)
        case 'invoiceNo': return invoiceNumber(invoice)
        case 'invoiceDate': return isoDate(pick(invoice, ['invoice_date']))
        case 'dueDate': return isoDate(pick(invoice, ['due_date']))
        case 'paymentTerm': return pick(invoice, ['payment_term', 'payment_terms'])
        case 'amount': return numberValue(totalValue(invoice))
        case 'status': return statusDetails(invoice).label
        default: return ''
      }
    })
  }, [advanced, filter, invoices, search, sort, sourceFilter, uploadedBy])

  const activeAdvancedCount = Object.values(advanced).filter((value) => value !== '').length
  // Status/source tabs are views, not filters: they neither enable nor get cleared by Reset.
  const hasCriteria = Boolean(search.trim()) || activeAdvancedCount > 0 || sort !== null
  const resetFilters = () => {
    setSort(null)
    setAdvanced(EMPTY_ADVANCED)
    setSearch('')
    setPage(1)
  }
  const sortHeader = (key, label, className, align) => (
    <SortableHeaderCell label={label} className={className} align={align} active={sort?.key === key} direction={sort?.direction} onSort={() => setSort((current) => nextSortState(current, key))} />
  )

  useEffect(() => setPage(1), [filter, search, sourceFilter, advanced, sort, rowsPerPage])

  // After an upload, jump to "Uploaded by Me" so the new invoice is visible right away.
  useEffect(() => {
    if (!uploadSignal) return
    setSourceFilter('vendor')
    setFilter('all')
    setSearch('')
    setAdvanced(EMPTY_ADVANCED)
  }, [uploadSignal])

  useEffect(() => {
    if (!filterOpen) return undefined
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !filterRef.current?.contains(event.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [filterOpen])
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const closePreview = () => setPreview((current) => {
    if (current?.url?.startsWith('blob:') && current.invoice?.source !== 'local') URL.revokeObjectURL(current.url)
    return null
  })

  const openPreview = async (invoice) => {
    setPreview({ invoice, loading: true, url: '', error: '' })
    try {
      if (invoice.source === 'local' && invoice.url) {
        setPreview({ invoice, loading: false, url: invoice.url, error: '' })
        return
      }
      const url = await loadInvoicePdfUrl(invoice)
      setPreview({ invoice, loading: false, url, error: '' })
    } catch (previewError) {
      const message = previewError instanceof TypeError ? 'The invoice document could not be loaded. Please try again later.' : previewError?.message
      setPreview({ invoice, loading: false, url: '', error: message || 'Unable to open this invoice.' })
    }
  }

  // Replacing from inside the invoice popup: the popup stays open with a spinner until the invoice has been read again
  // and its details (and document) have been overwritten, then shows the new version.
  const replaceFromPopup = async (invoice, file) => {
    setReplaceBusy(true)
    setReplaceError('')
    try {
      await replaceInvoice(invoice.id, file)
      const fresh = (await onReplaced()).find((item) => item.id === invoice.id)
      setReplacedInvoice(fresh ?? invoice)
    } catch (e) {
      setReplaceError(e?.message || 'Unable to replace the invoice.')
    } finally {
      setReplaceBusy(false)
    }
  }
  // "View updated invoice": show the overwritten details in the same popup.
  const viewReplaced = async () => {
    const fresh = replacedInvoice
    setReplacedInvoice(null)
    if (fresh) await openPreview(fresh)
  }
  // The replaced invoice is waiting for approval again, so it is under Processing (in Uploaded by Me).
  const showReplacedInvoice = () => {
    setSourceFilter('vendor')
    setFilter('processing')
    setSearch('')
    setAdvanced(EMPTY_ADVANCED)
    setPage(1)
  }
  // "Done": close the popup and show the invoice in its new place.
  const finishReplace = () => {
    setReplacedInvoice(null)
    closePreview()
    showReplacedInvoice()
  }

  const emptyCopy = hasCriteria
    ? { title: 'No matching invoices', detail: 'Nothing matches your search and filters right now. Try adjusting them, or use Reset to start over.' }
    : filter === 'correction'
      ? { title: 'Nothing needs correction', detail: 'Invoices sent back to you for correction will show up here.' }
      : filter === 'processing'
        ? { title: 'Nothing is processing', detail: 'Invoices waiting for approval will show up here.' }
        : filter === 'approved'
          ? { title: 'No approved invoices', detail: 'Invoices that complete approval will show up here.' }
          : filter === 'rejected'
            ? { title: 'No rejected invoices', detail: 'Invoices that were rejected will show up here.' }
              : { title: 'No invoices found', detail: 'There are no invoices to show for this view.' }

  // Invoices sent back to the vendor, within the current Uploaded by tab.
  const correctionCount = invoices.filter((invoice) => statusDetails(invoice).filter === 'correction' && (sourceFilter === 'all' || uploaderType(invoice) === sourceFilter)).length

  const filters = [
    ['all', 'All Status'],
    ['processing', 'Processing'],
    ['correction', 'Needs correction'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
  ]

  return (
    <>
      <section className={`shrink-0 overflow-hidden rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)] ${filterOpen ? 'min-h-[440px]' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-0 pt-3 sm:px-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-extrabold text-[#000000]">Invoice Inbox</h2>
            <span className="grid min-w-5 place-items-center rounded-full bg-[#f1f4f8] px-1.5 py-0.5 text-[11px] font-bold text-[#0046dc]">{invoices.length}</span>
          </div>
        </div>

        {/* Buttons/inputs get `font: inherit` from index.css, so size is set on the parent and weight on an inner span. */}
        <div className="mt-2 flex gap-2 overflow-x-auto px-4 text-xs sm:px-5" role="tablist" aria-label="Uploaded by">
          {SOURCE_TABS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={sourceFilter === value} onClick={() => setSourceFilter(value)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 transition ${sourceFilter === value ? 'border-[#0046dc] bg-[#0046dc] text-white' : 'border-[#c2cdda] bg-white text-[#5f5f5f] hover:border-[#0046dc] hover:text-[#0046dc]'}`}>
              <span className={sourceFilter === value ? 'font-bold' : 'font-medium'}>{label}</span>
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${sourceFilter === value ? 'bg-white/20 text-white' : 'bg-[#f1f4f8] text-[#0046dc]'}`}>{sourceCounts[value]}</span>
            </button>
          ))}
        </div>

        <div className="mt-1 flex gap-5 overflow-x-auto border-b border-[#d8e0e9] px-4 text-xs sm:px-5">
          {filters.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 border-b-2 px-0.5 py-2 transition ${filter === value ? 'border-[#0046dc] text-[#0046dc]' : 'border-transparent text-[#5f5f5f] hover:text-[#0046dc]'}`}>
              <span className={filter === value ? 'font-bold' : 'font-medium'}>{label}</span>
              {value === 'correction' && correctionCount > 0 && <span className="ml-1.5 inline-block min-w-[17px] rounded-full bg-[#bf4252] px-[5px] text-center align-middle text-[10.5px] font-bold leading-[17px] text-white">{correctionCount}</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[#d8e0e9] bg-[#fbfcfe] px-4 py-2 sm:px-5">
          <label className="relative block w-full max-w-[340px] text-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5f5f]" />
            <span className="sr-only">Search invoices</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by customer, invoice no. or id..." className="h-8 w-full rounded-full border border-[#c2cdda] bg-white pl-9 pr-3 text-xs text-[#474747] outline-none transition placeholder:text-[#5f5f5f] focus:border-[#0046dc] focus:ring-2 focus:ring-[#dce6ff]" />
          </label>
          <div className="flex h-8 items-center gap-2">
            <span className="rounded-md border border-[#b3c3e4] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#474747]">{filtered.length} total</span>
            <div ref={filterRef} className="relative text-xs">
              <button type="button" title="Filter invoices" aria-label="Filter invoices" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)} className={`relative grid size-8 place-items-center rounded-md border text-[#0046dc] transition ${filterOpen || activeAdvancedCount ? 'border-[#0046dc] bg-[#eef2fb]' : 'border-[#b3c3e4] bg-white hover:bg-[#eef2fb]'}`}>
                <SlidersHorizontal size={14} />
                {activeAdvancedCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-[#0046dc] text-[9px] font-bold text-white">{activeAdvancedCount}</span>}
              </button>
              {filterOpen && (
                <div role="dialog" aria-label="Filter invoices" className="absolute right-0 top-10 z-20 w-72 rounded-xl border border-[#d8e0e9] bg-white p-4 shadow-[0_12px_32px_rgba(40,83,130,0.16)]">
                  <FilterGroup title="Invoice date">
                    <FilterInput label="From" type="date" value={advanced.dateFrom} max={advanced.dateTo || undefined} onChange={(value) => setAdvanced((current) => ({ ...current, dateFrom: value }))} />
                    <FilterInput label="To" type="date" value={advanced.dateTo} min={advanced.dateFrom || undefined} onChange={(value) => setAdvanced((current) => ({ ...current, dateTo: value }))} />
                  </FilterGroup>
                  <FilterGroup title="Amount">
                    <FilterInput label="Min" type="number" min="0" placeholder="0" value={advanced.minAmount} onChange={(value) => setAdvanced((current) => ({ ...current, minAmount: value }))} />
                    <FilterInput label="Max" type="number" min="0" placeholder="Any" value={advanced.maxAmount} onChange={(value) => setAdvanced((current) => ({ ...current, maxAmount: value }))} />
                  </FilterGroup>
                  <div className="mt-3 flex items-center justify-between">
                    <button type="button" disabled={!activeAdvancedCount} onClick={() => setAdvanced(EMPTY_ADVANCED)} className="text-[#0046dc] disabled:text-slate-300"><span className="font-bold">Clear all</span></button>
                    <button type="button" onClick={() => setFilterOpen(false)} className="rounded-md bg-[#0046dc] px-3 py-1.5 text-white hover:bg-[#052e86]"><span className="font-bold">Done</span></button>
                  </div>
                </div>
              )}
            </div>
            {hasCriteria && (
              <button type="button" onClick={resetFilters} title="Reset search, filters and sorting" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#b3c3e4] bg-white px-2.5 py-[5px] text-[#474747] transition hover:bg-[#eef2fb]">
                <RotateCcw size={12} />
                <span className="text-[11px] font-semibold">Reset</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm font-semibold text-slate-600"><LoaderCircle size={18} className="animate-spin text-brand-600" /> Loading invoices...</div>
        ) : error ? (
          <div role="alert" className="m-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-800"><AlertCircle size={18} /> {error}</div>
        ) : invoices.length === 0 ? (
          <EmptyState title="No invoices uploaded yet" detail="Add PDF invoices above and they will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse text-left">
                <thead className="bg-[#f7f9fc] text-[9px] font-extrabold uppercase tracking-[0.04em] text-[#5f5f5f]">
                  <tr>
                    {sortHeader('vendor', 'Customer', 'px-5 py-2')}
                    {sortHeader('uploadedBy', 'Uploaded By', 'px-4 py-2')}
                    {sortHeader('invoiceNo', 'Invoice No.', 'px-4 py-2')}
                    {sortHeader('invoiceDate', 'Invoice Date', 'px-4 py-2')}
                    {sortHeader('dueDate', 'Due Date', 'px-4 py-2')}
                    {sortHeader('paymentTerm', 'Payment Term', 'px-4 py-2')}
                    {sortHeader('amount', 'Amount', 'px-4 py-2 text-right', 'right')}
                    {sortHeader('status', 'Status', 'px-4 py-2')}
                    <th className="px-5 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f4f8]">
                  {visible.map((invoice) => {
                    const status = statusDetails(invoice)
                    const canPreview = invoice.source === 'api' || Boolean(invoice.url)
                    return (
                      <tr key={invoice.id} className="transition hover:bg-[#eef2fb]/35">
                        <td className="px-5 py-2 align-middle">
                          <button type="button" title="View customer details" onClick={() => setVendorInfo(invoice)} className="block max-w-64 truncate text-left text-xs font-bold text-[#474747] transition hover:text-[#0046dc] hover:underline" style={LINK_XS_BOLD}>{vendorName(invoice)}</button>
                          {vendorGstin(invoice) && (
                            <p className="mt-1 flex items-center gap-1 text-[9px] font-medium tracking-[0.04em] text-[#5f5f5f]">
                              GST: {vendorGstin(invoice)}
                              {vendorGstinVerified(invoice) && <ShieldCheck size={11} className="text-emerald-600" />}
                            </p>
                          )}
                        </td>
                        <td className="max-w-40 truncate px-4 py-2 text-xs text-[#000000]">{uploadedByLabel(invoice, uploadedBy)}</td>
                        <td className="px-4 py-2 text-xs text-[#000000]">
                          {canPreview
                            ? <button type="button" title="View invoice" onClick={() => openPreview(invoice)} className="text-left text-xs text-[#000000] transition hover:text-[#0046dc] hover:underline" style={LINK_XS}>{display(invoiceNumber(invoice))}</button>
                            : display(invoiceNumber(invoice))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-[#000000]">{dateValue(pick(invoice, ['invoice_date']))}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-[#000000]">{dateValue(pick(invoice, ['due_date']))}</td>
                        <td className="px-4 py-2 text-xs text-[#000000]">{display(pick(invoice, ['payment_term', 'payment_terms']))}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-xs font-extrabold text-[#000000]">{amount(totalValue(invoice), pick(invoice, ['currency'], 'INR'))}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-bold ${status.tone}`}>•&nbsp; {status.label}</span>
                          {Number(invoice.submission_round) > 0 && (
                            <span title={`Replaced ${invoice.submission_round} ${Number(invoice.submission_round) === 1 ? 'time' : 'times'}. Open the invoice to see the earlier versions.`} className="ml-1.5 inline-flex rounded-md border border-[#b3c3e4] bg-[#eef2fb] px-1.5 py-0.5 text-[10px] font-bold text-[#052e86]">v{Number(invoice.submission_round) + 1}</span>
                          )}
                        </td>
                        <td className="px-5 py-2">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* The same actions on every row of a tab, in the same places; Replace is greyed out unless the invoice needs correction. */}
                            <ActionButton title={canPreview ? 'View invoice' : 'Preview unavailable'} disabled={!canPreview} onClick={() => openPreview(invoice)}><Eye size={15} /></ActionButton>
                            {/* Replace only appears where an invoice can need correcting: All Status and Needs correction. */}
                            {(filter === 'all' || filter === 'correction') && (
                              <ActionButton title={onHold ? HOLD_TOOLTIP : invoice.status === 'Returned to Vendor' ? 'Correct and replace invoice' : 'Replace invoice (only when it needs correction)'} disabled={onHold || invoice.status !== 'Returned to Vendor'} onClick={() => setReplacing(invoice)}><Upload size={14} /></ActionButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!filtered.length && <EmptyState title={emptyCopy.title} detail={emptyCopy.detail} />}
          </>
        )}

        <InvoicePagination total={filtered.length} page={currentPage} rowsPerPage={rowsPerPage} onPageChange={setPage} onRowsPerPageChange={setRowsPerPage} />
      </section>

      {vendorInfo && <VendorInfoModal invoice={vendorInfo} onClose={() => setVendorInfo(null)} />}
      <InvoiceDetailModal preview={preview} onClose={replacedInvoice ? finishReplace : closePreview} onReplace={replaceFromPopup} replaceBusy={replaceBusy} replaceError={replaceError} clearReplaceError={() => setReplaceError('')} replaceDone={Boolean(replacedInvoice)} onViewReplaced={viewReplaced} onFinishReplace={finishReplace} />
      {replacing && <ReplaceInvoiceModal invoice={replacing} onClose={() => setReplacing(null)} onReplaced={onReplaced} onFinished={() => { setReplacing(null); showReplacedInvoice() }} />}
      <ExtractionProgressModal invoice={extractingInvoice} />
    </>
  )
}

function FilterGroup({ title, children }) {
  return (
    <fieldset className="mb-3 last:mb-0">
      <legend className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.04em] text-[#5f5f5f]">{title}</legend>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </fieldset>
  )
}

function FilterInput({ label, onChange, ...props }) {
  return (
    <label className="block text-[11px] font-medium text-[#5f5f5f]">
      {label}
      <input {...props} onChange={(event) => onChange(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-[#c2cdda] bg-white px-2 text-xs text-[#474747] outline-none transition focus:border-[#0046dc] focus:ring-2 focus:ring-[#dce6ff]" />
    </label>
  )
}

function ExtractionProgressModal({ invoice }) {
  if (!invoice) return null
  const progress = Math.round(invoice.extractionProgress ?? 0)
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]" role="presentation">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="extraction-progress-title">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#eef2fb] text-[#0046dc]">
          <LoaderCircle size={26} className="animate-spin" />
        </div>
        <h2 id="extraction-progress-title" className="mt-4 text-base font-extrabold text-[#000000]">Extracting invoice data…</h2>
        <p className="mt-1 truncate text-xs text-[#5f5f5f]">{invoice.name}</p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#dce6ff]">
          <div className="h-full rounded-full bg-[#0046dc] transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-sm font-bold tabular-nums text-[#0046dc]">{progress}%</p>
        <p className="mt-3 text-[11px] text-[#5f5f5f]">This can take up to a minute. Please don&apos;t close this page.</p>
      </div>
    </div>
  )
}

function ActionButton({ children, title, onClick, disabled = false, danger = false }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`grid size-7 place-items-center rounded-md border bg-white transition disabled:cursor-not-allowed disabled:border-[#d8e0e9] disabled:text-[#a7b4c8] disabled:opacity-60 disabled:hover:bg-white ${danger ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-[#b3c3e4] text-[#0046dc] hover:bg-[#eef2fb]'}`}>{children}</button>
}

// The same empty state as the enterprise tables: an inbox icon with a title and a line of detail.
function EmptyState({ title, detail }) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 px-6 py-5 text-center text-[#8a94a6]">
      <Inbox size={26} strokeWidth={1.5} />
      <p className="text-[13px] font-bold text-[#5f5f5f]">{title}</p>
      <p className="max-w-[360px] text-xs text-[#5f5f5f]">{detail}</p>
    </div>
  )
}

const NO_FLAGS = new Set()

function InvoiceDetailModal({ preview, onClose, onReplace, replaceBusy = false, replaceError = '', clearReplaceError = () => {}, replaceDone = false, onViewReplaced = () => {}, onFinishReplace = () => {} }) {
  const replaceInput = useRef(null)
  const { onHold } = useAgreementHold()
  // The corrected file the user has picked but not yet confirmed.
  const [staged, setStaged] = useState(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const stagedInvoiceId = preview?.invoice?.id
  useEffect(() => { setStaged(null); setCompareOpen(false) }, [stagedInvoiceId])
  const stageFile = (file) => {
    clearReplaceError()
    if (!['.pdf', '.png', '.jpg', '.jpeg'].some((ext) => file.name.toLowerCase().endsWith(ext))) return onReplaceRejected('Please choose a PDF, PNG or JPG file.')
    if (file.size > 10 * 1024 * 1024) return onReplaceRejected('The file is larger than 10 MB.')
    setStaged(file)
    return undefined
  }
  const [stageError, setStageError] = useState('')
  const onReplaceRejected = (message) => { setStageError(message) }
  const [activeTab, setActiveTab] = useState('overview')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [returnInfo, setReturnInfo] = useState(null)
  const previewInvoiceId = preview?.invoice?.id
  const previewStatus = preview?.invoice?.status
  // Why the invoice was sent back, or rejected, shown above its details.
  useEffect(() => {
    setReturnInfo(null)
    if (!previewInvoiceId || !['Rejected', 'Returned to Vendor'].includes(previewStatus)) return undefined
    let ignore = false
    getInvoiceReturnReasons(previewInvoiceId).then((data) => { if (!ignore) setReturnInfo(data) }).catch(() => {})
    return () => { ignore = true }
  }, [previewInvoiceId, previewStatus])
  const flaggedFields = useMemo(() => new Set(returnInfo?.outcome === 'returned' ? (returnInfo.items ?? []).filter((item) => !item.fixed && item.field_key).map((item) => item.field_key) : []), [returnInfo])
  // The banner's View button: open the tab the field is on and bring it into view.
  const viewField = (fieldKey) => {
    setActiveTab(tabOfField(fieldKey))
    window.setTimeout(() => document.querySelector(`[data-flagged-field="${fieldKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }
  useEffect(() => {
    if (!previewInvoiceId) return undefined
    setActiveTab('overview')
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewInvoiceId, onClose])

  // An invoice that was replaced keeps its earlier versions: a bar of chips lets the vendor look at any of them, read-only.
  const versions = useInvoiceVersions(preview?.invoice)
  const viewing = versions.selected != null
  const previewUrl = viewing ? versions.view.url : preview?.url
  useEffect(() => setFrameLoaded(false), [previewUrl])

  if (!preview) return null
  const { invoice, loading, url, error } = viewing ? versions.view : preview
  const shown = invoice || preview.invoice
  const status = statusDetails(shown)
  const canReplaceHere = !viewing && preview.invoice.status === 'Returned to Vendor' && returnInfo?.outcome !== 'rejected'

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="relative flex h-[86dvh] max-h-[calc(100dvh-1rem)] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b-2 border-[#2566ff] bg-[#eef2fb] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#dce6ff] text-[#5f5f5f]"><FileText size={18} /></span>
            <div className="min-w-0">
              <h2 id="invoice-detail-title" className="text-[17px] font-bold text-[#000000]">Invoice Detail</h2>
              <div className="mt-1 flex items-center gap-2 text-xs text-[#5f5f5f]"><span>{display(invoiceNumber(shown))}</span><span>•</span>{viewing ? <VersionLabel versions={versions} /> : <span className={`rounded px-2 py-0.5 font-bold ${status.tone}`}>{status.label}</span>}<VersionPill versions={versions} /></div>
            </div>
          </div>
          {viewing && <VersionHeaderActions versions={versions} />}
          <button type="button" onClick={onClose} aria-label="Close invoice detail" className="grid size-8 place-items-center rounded-full bg-white/80 text-[#5f5f5f] transition hover:bg-white hover:text-[#000000]"><X size={18} /></button>
        </header>

        {!viewing && returnInfo && (returnInfo.items?.length > 0 || returnInfo.overall_remark) && (() => {
          const rejected = returnInfo.outcome === 'rejected'
          const pending = (returnInfo.items ?? []).filter((item) => !item.fixed)
          return (
            <div role="alert" className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-800">
              <div className="flex items-center gap-2">
                <p className="flex items-center gap-2 font-bold"><AlertCircle size={14} className="shrink-0" />{rejected ? 'This invoice was rejected' : 'Sent back for correction'}{!rejected && <span className="font-medium opacity-80">({pending.length} {pending.length === 1 ? 'item' : 'items'})</span>}</p>
              </div>
              <div className="mt-1 max-h-24 overflow-y-auto">
                {pending.map((item) => (
                  <div key={item.item_id ?? item.reason_label} className="flex items-baseline gap-2.5 py-0.5">
                    <p className="min-w-0 flex-1"><strong>{item.field_label}:</strong> {item.reason_label}{item.remark ? ` (${item.remark})` : ''}</p>
                    {!rejected && tabOfField(item.field_key) && <button type="button" onClick={() => viewField(item.field_key)} className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-[#b3c3e4] bg-white px-[9px] text-[11px] font-semibold text-[#052e86] transition hover:border-[#052e86] hover:bg-[#eef2fb]" style={BTN_11_SEMI}><Eye size={12} />View</button>}
                  </div>
                ))}
                {returnInfo.overall_remark && <p className="whitespace-pre-wrap py-0.5">{returnInfo.overall_remark}</p>}
              </div>
            </div>
          )
        })()}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[58%_42%] lg:grid-rows-1 lg:overflow-hidden">
          <div className="flex min-h-[420px] flex-col border-b lg:min-h-0 border-[#d8e0e9] lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 gap-5 border-b border-[#d8e0e9] px-5 text-xs" role="tablist">
              {[['overview', 'Overview'], ['amounts', 'Amounts & Line Items']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={activeTab === value} onClick={() => setActiveTab(value)} className={`-mb-px border-b-2 py-3 transition ${activeTab === value ? 'border-[#0046dc] text-[#0046dc]' : 'border-transparent text-[#5f5f5f] hover:text-[#0046dc]'}`}><span className={activeTab === value ? 'font-bold' : 'font-medium'}>{label}</span>{[...flaggedFields].some((field) => tabOfField(field) === value) && <span role="img" aria-label="Needs correction" title="Needs correction" className="ml-1.5 inline-block size-[7px] rounded-full bg-red-500 align-middle" />}</button>)}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <FlaggedContext.Provider value={viewing ? NO_FLAGS : flaggedFields}>
                {viewing && loading ? <PreviewMessage icon={<LoaderCircle size={28} className="animate-spin text-[#0046dc]" />} title="Loading this version..." detail="Fetching the earlier details." />
                  : viewing && !shown ? <PreviewMessage icon={<AlertCircle className="text-red-500" />} title="Version unavailable" detail={error} />
                    : activeTab === 'overview' ? <Overview invoice={shown} /> : <Amounts invoice={shown} />}
              </FlaggedContext.Provider>
            </div>
          </div>

          <div className="flex min-h-[520px] flex-col bg-[#fbfcfe] lg:min-h-0">
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#5f5f5f]">Original Document</p>
                <p className="mt-1 break-words text-xs text-[#5f5f5f]">File: {shown.name}</p>
              </div>
              {url && !loading && !error && (
                <a href={url} target="_blank" rel="noopener noreferrer" title="Open in new tab" aria-label="Open in new tab" className="grid size-8 shrink-0 place-items-center rounded-md border border-[#b3c3e4] bg-white text-[#0046dc] transition hover:bg-[#eef2fb]">
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
            <div className="relative mx-5 mb-4 min-h-0 flex-1 overflow-hidden rounded-lg border border-[#d8e0e9] bg-white">
              {loading ? <PreviewMessage icon={<LoaderCircle size={28} className="animate-spin text-[#0046dc]" />} title="Loading preview..." detail="Fetching the original document." />
                : error ? <PreviewMessage icon={<AlertCircle className="text-red-500" />} title="Preview unavailable" detail={error} />
                  : (
                    <>
                      <iframe src={pdfSrc(url)} title={`Preview of ${shown.name}`} onLoad={() => setFrameLoaded(true)} className="h-full min-h-[400px] w-full border-0 bg-white" />
                      {!frameLoaded && <div className="absolute inset-0 bg-white"><PreviewMessage icon={<LoaderCircle size={28} className="animate-spin text-[#0046dc]" />} title="Loading preview..." detail="Rendering the document, this may take a moment." /></div>}
                    </>
                  )}
            </div>
          </div>
        </div>
        {canReplaceHere && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#d8e0e9] bg-[#fbfcfe] px-5 py-3">
            <input ref={replaceInput} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; setStageError(''); if (file) stageFile(file) }} />
            {staged ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#dce6ff] text-[#5f5f5f]"><FileText size={17} /></span>
                  <div className="min-w-0">
                    <button type="button" title="Open the new file in a new tab" onClick={() => window.open(URL.createObjectURL(staged), '_blank', 'noopener')} className="block max-w-full truncate text-left text-xs font-semibold text-[#052e86] hover:underline" style={BTN_XS_BOLD}>{staged.name}</button>
                    <p className="mt-0.5 text-[11px] text-[#5f5f5f]">{staged.size >= 1048576 ? `${(staged.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(staged.size / 1024))} KB`} · Overwriting will replace this invoice&apos;s details with the new file.</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setCompareOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#b3c3e4] bg-white px-3 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb]" style={BTN_XS_BOLD}><Columns2 size={14} /> Compare</button>
                  <button type="button" onClick={() => replaceInput.current?.click()} className="inline-flex h-8 items-center rounded-md border border-[#b3c3e4] bg-white px-3 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb]" style={BTN_XS_BOLD}>Change</button>
                  <button type="button" onClick={() => { setStaged(null); setStageError('') }} title="Remove file" aria-label="Remove file" className="grid size-8 place-items-center rounded-md border border-[#c2cdda] bg-white text-[#bf4252] transition hover:bg-[#eef2fb]"><Trash2 size={14} /></button>
                  <button type="button" onClick={() => { const file = staged; onReplace(preview.invoice, file) }} className="inline-flex h-8 items-center gap-2 rounded-md bg-[#052e86] px-3.5 text-xs font-semibold text-white transition hover:bg-[#052e86]" style={BTN_XS_BOLD}><Upload size={14} /> Overwrite invoice</button>
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-[#474747]">Fixed what was asked? Upload the corrected invoice.</p>
                  <p className="mt-0.5 text-[11px] text-[#5f5f5f]">You can check the file before it replaces this invoice. PDF, PNG or JPG up to 10 MB.</p>
                </div>
                <button type="button" disabled={onHold} title={onHold ? HOLD_TOOLTIP : undefined} onClick={() => { clearReplaceError(); setStageError(''); replaceInput.current?.click() }} className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md bg-[#052e86] px-3.5 text-xs font-semibold text-white transition hover:bg-[#052e86] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#052e86]" style={BTN_XS_BOLD}><Upload size={14} /> Choose new invoice</button>
              </>
            )}
            {(replaceError || stageError) && <p className="w-full text-xs font-semibold text-red-600">{replaceError || stageError}</p>}
          </footer>
        )}
        {compareOpen && staged && <CompareOverlay invoice={preview.invoice} currentUrl={url} loading={loading} file={staged} invoiceNumber={display(invoiceNumber(preview.invoice))} onClose={() => setCompareOpen(false)} onOverwrite={() => { setCompareOpen(false); onReplace(preview.invoice, staged) }} />}
        {replaceBusy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-[1px]" role="status" aria-live="polite">
            <LoaderCircle size={34} className="animate-spin text-[#0046dc]" />
            <p className="text-sm font-bold text-[#000000]">Replacing your invoice…</p>
            <p className="max-w-xs text-center text-xs text-[#5f5f5f]">The new file is being read and the invoice details are being updated. Please keep this window open.</p>
          </div>
        )}
        {replaceDone && !replaceBusy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center" role="status" aria-live="polite">
            <span className="grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={34} /></span>
            <p className="text-base font-bold text-[#000000]">Invoice replaced successfully</p>
            <p className="max-w-sm text-xs leading-5 text-[#5f5f5f]">We have read your new file and updated this invoice&apos;s details. It has been sent back for approval, so it no longer needs correction.</p>
            <div className="mt-2 flex items-center gap-2.5">
              <button type="button" onClick={onViewReplaced} className="inline-flex h-8 items-center rounded-md border border-[#b3c3e4] bg-white px-3.5 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb]" style={BTN_XS_BOLD}>View updated invoice</button>
              <button type="button" onClick={onFinishReplace} className="inline-flex h-8 items-center rounded-md bg-[#052e86] px-3.5 text-xs font-semibold text-white transition hover:bg-[#052e86]" style={BTN_XS_BOLD}>Done</button>
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body,
  )
}


function PreviewMessage({ icon, title, detail }) {
  return <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 px-6 text-center text-[#5f5f5f]">{icon}<p className="text-xs font-semibold text-[#052e86]">{title}</p><p className="max-w-xs text-[11px]">{detail}</p></div>
}

// The vendor record behind an invoice, laid out like the vendor details popup in the enterprise app: avatar and chips in the header,
// then Overview / Compliance & Banking / Address & System tabs. Details come from the vendor's own profile; the name and GSTIN fall back
// to what was read from the invoice, with the GST check result shown alongside.
const VENDOR_TABS = [
  { label: 'Overview', sections: [
    { title: 'Identity & Classification', keys: [['name', 'Name'], ['vendor_legal_name', 'Customer Legal Name'], ['vendor_type', 'Customer Type'], ['status', 'Status']] },
    { title: 'Contact', keys: [['email', 'Email'], ['contact_no', 'Contact No']] },
  ] },
  { label: 'Compliance & Banking', sections: [
    { title: 'Registration & Compliance', keys: [['pan', 'PAN'], ['gstin', 'GSTIN'], ['gst_status', 'GST Status'], ['cin', 'CIN'], ['registration_number', 'Registration Number'], ['udyam_number', 'Udyam Number'], ['msme_status', 'MSME Status'], ['aadhaar_no', 'Aadhaar No']] },
    { title: 'Banking Details', keys: [['account_holder_name', 'Account Holder Name'], ['bank_name', 'Bank Name'], ['branch_name', 'Branch Name'], ['bank_account_no', 'Bank Account No'], ['ifsc_code', 'IFSC Code'], ['currency', 'Currency']] },
  ] },
  { label: 'Address & System', sections: [
    { title: 'Address', keys: [['street', 'Street'], ['city', 'City'], ['district', 'District'], ['region', 'State'], ['postal_code', 'Postal Code']] },
    { title: 'System & Audit', keys: [['sap_vendor', 'SAP Customer'], ['year_established', 'Year Established'], ['created_at', 'Created At'], ['updated_at', 'Updated At']] },
  ] },
  { label: 'Supporting Documents', documents: true },
]
const WIDE_VENDOR_KEYS = new Set(['street'])
const HEADER_CHIP = 'hidden rounded-md border border-[#c2cdda] bg-[#f7f9fc] px-2.5 py-1 text-[11px] font-medium text-[#5f5f5f] sm:inline'

function VendorInfoModal({ invoice, onClose }) {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState(0)
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const verified = vendorGstinVerified(invoice)
  const gstStatus = pick(invoice, ['vendor_gstin_status'])
  const name = profile?.vendor_legal_name || vendorName(invoice)
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?'
  const status = profile?.status

  const valueOf = (key) => {
    if (key === 'gst_status') return verified ? `Verified${gstStatus ? ` · ${gstStatus}` : ''}` : (gstStatus || 'Not verified')
    if (key === 'gstin') return profile?.gstin || vendorGstin(invoice)
    if (key === 'created_at' || key === 'updated_at') {
      const date = profile?.[key] ? new Date(profile[key]) : null
      return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''
    }
    return displayProfileValue(key, profile?.[key])
  }
  const tab = VENDOR_TABS[activeTab]

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="vendor-info-title">
        <header className="flex items-center justify-between gap-4 border-b-2 border-[#2566ff] bg-[#eef2fb] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#d8e0e9] text-sm font-bold text-[#5f5f5f]">{initials}</span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5f5f5f]">Customer record</p>
              <h2 id="vendor-info-title" className="truncate text-[17px] font-bold text-[#000000]">{name}</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {profile?.assigned_rm && <span className={HEADER_CHIP}>RM: {profile.assigned_rm}</span>}
            {profile?.sap_vendor && <span className={HEADER_CHIP}>SAP Customer {profile.sap_vendor}</span>}
            {status && <span className="rounded-full border border-[#cdbff5] bg-[#f4f0ff] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#5b3fb5]">&bull; {status}</span>}
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-[#5f5f5f] transition hover:bg-white hover:text-[#000000]"><X size={18} /></button>
          </div>
        </header>
        <nav className="flex shrink-0 gap-5 overflow-x-auto border-b border-[#d8e0e9] px-5 pt-3">
          {VENDOR_TABS.map((candidate, index) => (
            <button key={candidate.label} type="button" onClick={() => setActiveTab(index)} style={index === activeTab ? BTN_XS_BOLD : LINK_XS} className={`shrink-0 whitespace-nowrap border-b-2 py-2.5 transition ${index === activeTab ? 'border-[#052e86] text-[#052e86]' : 'border-transparent text-[#5f5f5f] hover:text-[#000000]'}`}>{candidate.label}</button>
          ))}
        </nav>
        <div className="h-[440px] max-h-full overflow-y-auto px-5 py-4">
          {tab.documents ? <VendorDocumentsTab /> : tab.sections.map((section) => (
            <DetailSection key={section.title} title={section.title}>
              <div className="grid gap-4 sm:grid-cols-3">
                {section.keys.map(([key, label]) => (
                  <div key={key} className={WIDE_VENDOR_KEYS.has(key) ? 'sm:col-span-3' : ''}>
                    <p className="text-[11px] font-semibold tracking-[0.02em] text-[#5f5f5f]">{label}</p>
                    <p className="mt-1.5 min-h-5 break-words text-[13px] font-medium leading-5 tabular-nums text-[#000000]">{display(valueOf(key))}</p>
                  </div>
                ))}
              </div>
            </DetailSection>
          ))}
        </div>
        <footer className="flex justify-end border-t border-[#d8e0e9] bg-[#fbfcfe] px-5 py-3">
          <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-[#b3c3e4] bg-white px-3.5 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb]" style={BTN_XS_BOLD}>Close</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
