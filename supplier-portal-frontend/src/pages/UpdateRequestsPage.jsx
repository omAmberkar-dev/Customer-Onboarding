import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, Clock, FilePenLine, Inbox, LoaderCircle, ShieldCheck, UserCheck, X, XCircle } from 'lucide-react'
import AppShell from '../components/layout/AppShell'
import PageContainer from '../components/layout/PageContainer'
import useAuth from '../hooks/useAuth'
import { getUpdateRequests, UPDATE_REQUESTS_CHANGED_EVENT } from '../api/vendorApi'

const POLL_INTERVAL_MS = 10000
const PAGE_SIZES = [5, 10, 20, 50]

const FIELD_LABELS = {
  vendor_legal_name: 'Customer legal name', contact_no: 'Phone number', vendor_type: 'Customer type', year_established: 'Year established',
  currency: 'Transaction currency', registration_number: 'Company registration number', msme_status: 'MSME status', udyam_number: 'MSME / Udyam number',
  gstin: 'GSTIN', pan: 'PAN', aadhaar_no: 'Aadhaar number', cin: 'CIN',
  street: 'Address line 1', city: 'City', district: 'District / County', region: 'State', postal_code: 'Postal / PIN code',
  account_holder_name: 'Account holder name', bank_name: 'Bank name', branch_name: 'Branch name', bank_account_no: 'Account number', ifsc_code: 'IFSC code',
}

// Same colours and shape as the status badges on the maker/checker vendor screens. The vendor only
// ever sees "Pending", "Approved" or "Rejected": who in the team is reviewing is not their concern.
const STATUS_STYLES = {
  'update requested': { label: 'Pending', bg: '#fff5e3', color: '#936716' },
  'sent for approval': { label: 'Pending', bg: '#fff5e3', color: '#936716' },
  approved: { label: 'Approved', bg: '#e9f7f1', color: '#1f7c64' },
  rejected: { label: 'Rejected', bg: '#fff0f1', color: '#bf4252' },
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || { label: status, bg: '#eef2fb', color: '#0046dc' }
  return (
    <span className="inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] px-2 py-[5px] text-[10px] font-bold leading-[1.2]" style={{ backgroundColor: style.bg, color: style.color }}>
      <i className="size-1 rounded-full bg-current" />
      {style.label}
    </span>
  )
}

const IN_REVIEW = ['update requested', 'sent for approval']

const STATUS_MESSAGES = {
  'update requested': 'Your request is being reviewed. We’ll update your details as soon as it is approved.',
  'sent for approval': 'Your request is being reviewed. We’ll update your details as soon as it is approved.',
  approved: 'Approved — your customer details have been updated.',
  rejected: 'This request was rejected. Your existing details are unchanged.',
}

const FILTERS = [
  ['all', 'All'],
  ['review', 'Pending'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
]

const HOW_IT_WORKS = [
  { icon: FilePenLine, title: 'You send a request', text: 'Edit your details from your profile and click Send request.' },
  { icon: UserCheck, title: 'We review it', text: 'Our team checks the changes you asked for.' },
  { icon: ShieldCheck, title: 'Your details are updated', text: 'Once approved, your customer details are updated everywhere.' },
]

// The database stores timestamps in UTC without a timezone marker ("2026-10-01 05:54:31"), so
// they are read as UTC and shown in the viewer's own local time.
const parseDate = (value) => {
  if (!value) return null
  const text = String(value).trim().replace(' ', 'T')
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(text)
  const date = new Date(hasZone ? text : `${text}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDate = (value) => {
  const date = parseDate(value)
  return date ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : String(value || '')
}

const timeAgo = (value) => {
  const date = parseDate(value)
  if (!date) return ''
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const fieldNames = (request) => request.changed_fields.map((field) => FIELD_LABELS[field] || field)

export default function UpdateRequestsPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(PAGE_SIZES[0])

  // Loads once with a spinner, then keeps the list fresh without one: on a timer, when the tab
  // regains focus, and straight away when a request is sent from the profile panel.
  useEffect(() => {
    if (!user?.vendor_id) return undefined
    let ignore = false
    const load = (initial) => {
      if (initial) setLoading(true)
      getUpdateRequests(user.vendor_id)
        .then((rows) => { if (!ignore) { setRequests(rows); setError('') } })
        .catch((requestError) => { if (!ignore && initial) setError(requestError?.message || 'Unable to load update requests.') })
        .finally(() => { if (!ignore && initial) setLoading(false) })
    }
    load(true)
    const refresh = () => { if (document.visibilityState === 'visible') load(false) }
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(UPDATE_REQUESTS_CHANGED_EVENT, refresh)
    return () => {
      ignore = true
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(UPDATE_REQUESTS_CHANGED_EVENT, refresh)
    }
  }, [user?.vendor_id])

  // Keep an open details popup in step with the latest data (e.g. its status moving on).
  useEffect(() => {
    setSelected((current) => (current ? requests.find((item) => item.request_id === current.request_id) || current : current))
  }, [requests])

  const counts = useMemo(() => ({
    total: requests.length,
    review: requests.filter((item) => IN_REVIEW.includes(item.status)).length,
    approved: requests.filter((item) => item.status === 'approved').length,
    rejected: requests.filter((item) => item.status === 'rejected').length,
  }), [requests])

  const openRequest = requests.find((item) => IN_REVIEW.includes(item.status))
  const matching = requests.filter((item) => filter === 'all' || (filter === 'review' ? IN_REVIEW.includes(item.status) : item.status === filter))
  const pageCount = Math.max(1, Math.ceil(matching.length / rowsPerPage))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = matching.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage)
  const rangeStart = matching.length ? currentPage * rowsPerPage + 1 : 0
  // Up to five page numbers, centred on the current page where there are enough pages.
  const windowStart = Math.max(0, Math.min(currentPage - 2, pageCount - 5))
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => windowStart + index)
  const rangeEnd = Math.min((currentPage + 1) * rowsPerPage, matching.length)

  return (
    <AppShell breadcrumb="Change Requests">
      <PageContainer wide className="vendor-workspace h-full">
        <div className="mx-auto flex h-full max-w-[1820px] min-h-0 flex-col gap-3 overflow-y-auto px-1 pb-3 sm:px-2">
          <div className="shrink-0 px-1">
            <h1 className="text-base font-extrabold text-[#000000]">Change Requests</h1>
            <p className="text-xs text-[#5f5f5f]">Track the changes you asked to make to your customer details. Your current details stay active until a request is approved.</p>
          </div>

          <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={ClipboardList} tone="text-[#0046dc] bg-[#f1f4f8]" label="Total requests" value={counts.total} />
            <StatTile icon={Clock} tone="text-amber-600 bg-amber-50" label="Pending" value={counts.review} />
            <StatTile icon={CheckCircle2} tone="text-emerald-600 bg-emerald-50" label="Approved" value={counts.approved} />
            <StatTile icon={XCircle} tone="text-red-500 bg-red-50" label="Rejected" value={counts.rejected} />
          </div>

          {openRequest && (
            <section className="shrink-0 rounded-xl border border-[#b3c3e4] bg-[#f7f9fc] px-4 py-3 shadow-[0_4px_16px_rgba(40,83,130,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#0046dc]">Current request</p>
                  <h2 className="mt-0.5 text-sm font-extrabold text-[#000000]">Request #{openRequest.request_id} · sent {timeAgo(openRequest.requested_at)}</h2>
                  <p className="mt-0.5 text-xs text-[#5f5f5f]">{STATUS_MESSAGES[openRequest.status]}</p>
                </div>
                <button type="button" onClick={() => setSelected(openRequest)} className="inline-flex h-8 shrink-0 items-center rounded-lg border border-[#2566ff] bg-white px-3.5 text-[#0046dc] transition hover:bg-[#eef2fb]"><span className="text-xs font-bold">View details</span></button>
              </div>
              <div className="mt-3"><StatusTimeline request={openRequest} /></div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[#5f5f5f]">Changing:</span>
                {fieldNames(openRequest).map((name) => <span key={name} className="rounded-full border border-[#c2cdda] bg-white px-2.5 py-0.5 font-medium text-[#474747]">{name}</span>)}
              </div>
            </section>
          )}

          <section className="shrink-0 overflow-hidden rounded-xl border border-[#d8e0e9] bg-white shadow-[0_4px_16px_rgba(40,83,130,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-5">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-extrabold text-[#000000]">Request history</h2>
                <span className="grid min-w-5 place-items-center rounded-full bg-[#f1f4f8] px-1.5 py-0.5 text-[11px] font-bold text-[#0046dc]">{matching.length}</span>
              </div>
              <div className="flex gap-1.5 text-xs" role="tablist" aria-label="Filter requests">
                {FILTERS.map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => { setFilter(value); setPage(0) }} className={`rounded-full border px-3 py-1 transition ${filter === value ? 'border-[#0046dc] bg-[#0046dc] text-white' : 'border-[#c2cdda] bg-white text-[#5f5f5f] hover:border-[#0046dc] hover:text-[#0046dc]'}`}>
                    <span className={filter === value ? 'font-bold' : 'font-medium'}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 border-t border-[#d8e0e9] px-6 py-10 text-sm font-semibold text-slate-600"><LoaderCircle size={18} className="animate-spin text-brand-600" /> Loading requests...</div>
            ) : error ? (
              <div role="alert" className="m-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-800"><AlertCircle size={18} /> {error}</div>
            ) : matching.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 border-t border-[#d8e0e9] px-6 py-6 text-center">
                <span className="grid size-9 place-items-center rounded-full bg-[#eef2fb] text-[#8a94a6]"><Inbox size={17} /></span>
                <p className="text-sm font-bold text-[#000000]">{requests.length ? 'No requests in this view' : 'No update requests yet'}</p>
                <p className="max-w-md text-xs text-slate-500">{requests.length ? 'Try another filter to see your other requests.' : 'When you edit your details from your profile and send a request, it will show up here so you can follow its progress.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse border-t border-[#d8e0e9] text-left">
                  <thead className="bg-[#f7f9fc] text-[9px] font-extrabold uppercase tracking-[0.04em] text-[#5f5f5f]">
                    <tr>
                      <th className="px-5 py-2">Request</th>
                      <th className="px-4 py-2">Requested on</th>
                      <th className="px-4 py-2">Changes</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-5 py-2 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f4f8]">
                    {visible.map((item) => {
                      return (
                        <tr key={item.request_id} className="cursor-pointer transition hover:bg-[#eef2fb]/35" onClick={() => setSelected(item)}>
                          <td className="px-5 py-2 text-xs font-extrabold text-[#000000]">#{item.request_id}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-xs text-[#000000]">{formatDate(item.requested_at)}</td>
                          <td className="max-w-md truncate px-4 py-2 text-xs text-[#000000]">{fieldNames(item).join(', ')}</td>
                          <td className="px-4 py-2"><StatusBadge status={item.status} /></td>
                          <td className="px-5 py-2 text-right text-[#0046dc]"><ChevronRight size={16} className="ml-auto" /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && !error && matching.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d8e0e9] bg-[#fbfcfe] px-4 py-2 text-xs text-[#474747] sm:px-5">
                <span>Showing {rangeStart}–{rangeEnd} of {matching.length} request{matching.length === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-1.5">
                  {[
                    [ChevronsLeft, 'First page', () => setPage(0), currentPage === 0],
                    [ChevronLeft, 'Previous page', () => setPage(currentPage - 1), currentPage === 0],
                  ].map(([Icon, label, onClick, disabled]) => (
                    <button key={label} type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid size-7 place-items-center rounded-md border border-[#c2cdda] bg-white text-[#5f5f5f] transition hover:border-[#0046dc] hover:text-[#0046dc] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#c2cdda] disabled:hover:text-[#5f5f5f]"><Icon size={14} /></button>
                  ))}
                  {pageNumbers.map((number) => (
                    <button
                      key={number}
                      type="button"
                      onClick={() => setPage(number)}
                      aria-current={number === currentPage ? 'page' : undefined}
                      className={`grid size-7 place-items-center rounded-md border text-xs font-bold transition ${number === currentPage ? 'border-[#0046dc] bg-[#0046dc] text-white' : 'border-[#c2cdda] bg-white text-[#474747] hover:border-[#0046dc] hover:text-[#0046dc]'}`}
                    >
                      {number + 1}
                    </button>
                  ))}
                  {[
                    [ChevronRight, 'Next page', () => setPage(currentPage + 1), currentPage >= pageCount - 1],
                    [ChevronsRight, 'Last page', () => setPage(pageCount - 1), currentPage >= pageCount - 1],
                  ].map(([Icon, label, onClick, disabled]) => (
                    <button key={label} type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid size-7 place-items-center rounded-md border border-[#c2cdda] bg-white text-[#5f5f5f] transition hover:border-[#0046dc] hover:text-[#0046dc] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#c2cdda] disabled:hover:text-[#5f5f5f]"><Icon size={14} /></button>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  Rows
                  <select value={rowsPerPage} onChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0) }} className="h-7 rounded-md border border-[#c2cdda] bg-white px-2 text-xs text-[#474747] outline-none transition focus:border-[#0046dc]">
                    {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="shrink-0 rounded-xl border border-[#d8e0e9] bg-white px-4 py-3 shadow-[0_4px_16px_rgba(40,83,130,0.04)]">
            <h2 className="text-[13px] font-extrabold text-[#000000]">How updating your details works</h2>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {HOW_IT_WORKS.map(({ icon: Icon, title, text }, index) => (
                <div key={title} className="flex items-start gap-2.5 rounded-lg border border-[#d8e0e9] bg-[#fbfcfe] px-2.5 py-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#f1f4f8] text-[#0046dc]"><Icon size={14} /></span>
                  <div>
                    <p className="text-xs font-bold text-[#000000]">{index + 1}. {title}</p>
                    <p className="text-[11.5px] leading-4 text-[#5f5f5f]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-[#5f5f5f]">You can have one request in review at a time. If a request is rejected, you’ll see the reason here and can send a new one.</p>
          </section>
        </div>
      </PageContainer>
      <RequestDetail request={selected} onClose={() => setSelected(null)} />
    </AppShell>
  )
}

function StatTile({ icon: Icon, tone, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#d8e0e9] bg-white px-3 py-2 shadow-[0_4px_16px_rgba(40,83,130,0.04)]">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={16} /></span>
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.03em] text-[#5f5f5f]">{label}</p>
        <p className="text-lg font-extrabold leading-6 text-[#000000]">{value}</p>
      </div>
    </div>
  )
}

const formatDateTime = (value) => {
  const date = parseDate(value)
  return date
    ? `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    : ''
}

// One entry per stage, with when it happened once it has - so the vendor can see how far the
// request has got and how long each step took.
function timelineSteps(request) {
  const status = request.status
  const inReview = IN_REVIEW.includes(status)
  const decidedAt = request.checker_actioned_at || request.maker_actioned_at || request.updated_at
  return [
    { title: 'Request sent', at: request.requested_at, state: 'done' },
    { title: 'Pending', at: '', state: inReview ? 'active' : 'done' },
    {
      title: status === 'rejected' ? 'Rejected' : 'Approved',
      at: inReview ? '' : decidedAt,
      state: status === 'approved' ? 'done' : status === 'rejected' ? 'failed' : 'pending',
    },
  ]
}

// A light stepper: one dot per stage joined by a line, with the stage name and date underneath.
function StatusTimeline({ request }) {
  const steps = timelineSteps(request)
  return (
    <ol className="flex items-start">
      {steps.map((step, index) => {
        const dot = {
          done: 'bg-emerald-500 text-white',
          active: 'bg-[#0046dc] text-white ring-4 ring-[#0046dc]/15',
          failed: 'bg-red-500 text-white',
          pending: 'border border-[#c2cdda] bg-white text-[#a7b4c8]',
        }[step.state]
        return (
          <li key={step.title} className="relative flex flex-1 flex-col items-center text-center">
            {index > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${steps[index - 1].state === 'done' ? 'bg-emerald-400' : 'bg-[#d8e0e9]'}`} aria-hidden="true" />}
            <span className={`relative z-10 grid size-7 place-items-center rounded-full text-xs font-bold ${dot}`}>
              {step.state === 'done' ? <Check size={14} /> : step.state === 'failed' ? <X size={14} /> : step.state === 'active' ? <Clock size={13} /> : index + 1}
            </span>
            <p className={`mt-2 text-xs font-bold ${step.state === 'pending' ? 'text-[#8a94a6]' : 'text-[#000000]'}`}>{step.title}</p>
            <p className="mt-0.5 text-[11px] text-[#5f5f5f]">
              {step.state === 'active' ? 'Being reviewed' : step.state === 'pending' ? 'Not yet' : formatDateTime(step.at)}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

function RequestDetail({ request, onClose }) {
  useEffect(() => {
    if (!request) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [request, onClose])

  if (!request) return null
  const rejected = request.status === 'rejected'
  const fields = request.changed_fields
  const show = (value) => (value === null || value === undefined || value === '' ? '' : String(value))

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Update request details">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-[#2566ff] bg-[#eef2fb] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[#000000]">Update request #{request.request_id}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={request.status} />
              <span className="text-xs text-[#5f5f5f]">Requested on {formatDate(request.requested_at)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-[#5f5f5f] transition hover:bg-white hover:text-[#000000]"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <StatusTimeline request={request} />
          <p className="mt-4 text-center text-xs text-[#5f5f5f]">{STATUS_MESSAGES[request.status]}</p>

          {rejected && request.rejection_reason && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"><AlertCircle size={15} className="mt-0.5 shrink-0" /><p><span className="font-bold">Reason:</span> {request.rejection_reason}</p></div>
          )}

          <h3 className="mb-3 mt-7 text-[11px] font-bold uppercase tracking-[0.05em] text-[#5f5f5f]">
            What is changing <span className="ml-1 font-semibold normal-case tracking-normal text-[#8a94a6]">({fields.length} field{fields.length === 1 ? '' : 's'})</span>
          </h3>
          <div className="overflow-hidden rounded-xl border border-[#d8e0e9]">
            <div className="grid grid-cols-[1fr_1fr] gap-4 bg-[#f7f9fc] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] sm:grid-cols-[1fr_1fr_1fr]">
              <span className="hidden text-[#5f5f5f] sm:block">Field</span>
              <span className="text-[#5f5f5f]">Current</span>
              <span className="text-[#0046dc]">Requested</span>
            </div>
            {fields.map((field) => (
              <div key={field} className="grid grid-cols-[1fr_1fr] gap-x-4 gap-y-1 border-t border-[#f1f4f8] px-5 py-3.5 sm:grid-cols-[1fr_1fr_1fr] sm:items-center">
                <p className="col-span-2 text-xs font-semibold text-[#000000] sm:col-span-1 sm:text-[13px]">{FIELD_LABELS[field] || field}</p>
                <p className="break-words text-[13px] text-[#5f5f5f]">{show(request.old_values?.[field]) || '—'}</p>
                <p className="break-words text-[13px] font-bold text-[#000000]">{show(request.new_values?.[field]) || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
