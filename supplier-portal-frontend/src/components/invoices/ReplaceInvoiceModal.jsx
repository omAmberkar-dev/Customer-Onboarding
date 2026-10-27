import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Columns2, FileText, LoaderCircle, Trash2, Upload, UploadCloud, X } from 'lucide-react'
import { getInvoiceReturnReasons, replaceInvoice } from '../../api/vendorApi'
import { CompareOverlay, loadInvoicePdfUrl } from './InvoiceCompare'

// The global `button { font: inherit }` rule beats Tailwind's font utilities (they are layered), so button text sizes are set inline.
const BTN_XS_BOLD = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }
const BTN_11_SEMI = { fontSize: '0.6875rem', lineHeight: '1rem', fontWeight: 600 }

const ACCEPTED = ['.pdf', '.png', '.jpg', '.jpeg']
const MAX_SIZE = 10 * 1024 * 1024

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

// Shown to the vendor for an invoice that was sent back: what needs correcting, and the upload of the corrected file.
// The same invoice is overwritten from the new file and goes back for approval. `onReplaced` may return a promise
// (the list refreshing): the dialog stays open, with a spinner, until it settles.
export default function ReplaceInvoiceModal({ invoice, onClose, onReplaced, onFinished }) {
  const [reasons, setReasons] = useState(null)
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [dragging, setDragging] = useState(false)
  // The invoice being replaced, loaded only when the user asks to compare it with the new file.
  const [compare, setCompare] = useState(null)
  const input = useRef(null)

  useEffect(() => {
    let ignore = false
    getInvoiceReturnReasons(invoice.id)
      .then((data) => { if (!ignore) setReasons(data) })
      .catch((e) => { if (!ignore) setError(e.message) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [invoice.id])

  const openCompare = async () => {
    setCompare({ loading: true, url: '' })
    try {
      setCompare({ loading: false, url: await loadInvoicePdfUrl(invoice) })
    } catch {
      setCompare({ loading: false, url: '' })
    }
  }
  const closeCompare = () => {
    if (compare?.url?.startsWith('blob:')) URL.revokeObjectURL(compare.url)
    setCompare(null)
  }

  const choose = (chosen) => {
    if (!chosen) return
    if (!ACCEPTED.some((ext) => chosen.name.toLowerCase().endsWith(ext))) { setError('Please choose a PDF, PNG or JPG file.'); return }
    if (chosen.size > MAX_SIZE) { setError('The file is larger than 10 MB.'); return }
    setError('')
    setFile(chosen)
  }

  const submit = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await replaceInvoice(invoice.id, file)
      await onReplaced()
      setDone(true)
    } catch (e) {
      setError(e.message || 'Unable to replace the invoice.')
    } finally {
      setBusy(false)
    }
  }

  const items = (reasons?.items ?? []).filter((item) => !item.fixed)
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && (done ? onFinished() : onClose())}>
      <section className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="replace-invoice-title">
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#2566ff] bg-[#eef2fb] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#dce6ff] text-[#5f5f5f]"><FileText size={18} /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5f5f5f]">Invoice needs correction</p>
              <h2 id="replace-invoice-title" className="truncate text-[17px] font-bold text-[#000000]">{invoice.invoice_number || invoice.name}</h2>
            </div>
          </div>
          <button type="button" onClick={done ? onFinished : onClose} disabled={busy} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-[#5f5f5f] transition hover:bg-white hover:text-[#000000]"><X size={18} /></button>
        </header>

        <div className="space-y-5 overflow-y-auto px-5 py-4 text-xs">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">What to fix</p>
            {loading ? <LoaderCircle size={16} className="animate-spin text-[#0046dc]" />
              : items.length === 0 && !reasons?.overall_remark ? <p className="text-[#5f5f5f]">Please check the invoice and upload a corrected copy.</p>
                : (
                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <div key={item.item_id ?? `${item.field_label}-${item.reason_label}`} className="rounded-lg border border-red-200 border-l-[3px] border-l-red-500 bg-red-50/50 px-3 py-2">
                        <p className="text-[#7a2a2a]"><span className="font-bold">{item.field_label}</span> · {item.reason_label}</p>
                        {item.remark && <p className="mt-0.5 text-[#5f5f5f]">{item.remark}</p>}
                      </div>
                    ))}
                    {reasons?.overall_remark && <p className="whitespace-pre-wrap pt-1 text-[#474747]">{reasons.overall_remark}</p>}
                  </div>
                )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">Corrected invoice</p>
            <input ref={input} type="file" accept={ACCEPTED.join(',')} className="hidden" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = '' }} />
            {file ? (
              <div className="flex items-center gap-3 rounded-md border border-[#b3c3e4] bg-[#f7f9fc] px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#dce6ff] text-[#5f5f5f]"><FileText size={17} /></span>
                <div className="min-w-0 flex-1">
                  <button type="button" title="Open the new file in a new tab" onClick={() => window.open(URL.createObjectURL(file), '_blank', 'noopener')} className="block max-w-full truncate text-left text-[13px] font-semibold text-[#052e86] hover:underline" style={BTN_XS_BOLD}>{file.name}</button>
                  <p className="mt-0.5 text-[11px] text-[#5f5f5f]">{formatSize(file.size)}</p>
                </div>
<button type="button" onClick={() => input.current?.click()} disabled={busy} className="shrink-0 rounded-md border border-[#b3c3e4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#052e86] transition hover:bg-[#eef2fb] disabled:opacity-50" style={BTN_11_SEMI}>Change</button>
                <button type="button" onClick={() => { setFile(null); setError('') }} disabled={busy} title="Remove file" aria-label="Remove file" className="grid size-7 shrink-0 place-items-center rounded-md border border-[#c2cdda] bg-white text-[#bf4252] transition hover:bg-[#eef2fb] disabled:opacity-50"><Trash2 size={13} /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]) }}
                className={`flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition ${dragging ? 'border-[#0046dc] bg-[#eef2fb]' : 'border-[#b3c3e4] bg-[#fbfcfe] hover:border-[#0046dc] hover:bg-[#eef2fb]/50'}`}
              >
                <UploadCloud size={22} className="text-[#0046dc]" />
                <span className="text-[13px] font-bold text-[#000000]">Click or drag the corrected invoice here</span>
                <span className="text-[11px] text-[#5f5f5f]">PDF, PNG or JPG — max 10 MB</span>
              </button>
            )}
            <p className="mt-2 text-[11px] text-[#5f5f5f]">Your invoice is read again, its details are overwritten and it goes back for approval.</p>
          </div>

          {error && <p className="flex items-start gap-1.5 font-medium text-red-600"><AlertCircle size={14} className="mt-px shrink-0" />{error}</p>}
        </div>

        <footer className="flex items-center gap-2.5 border-t border-[#d8e0e9] bg-[#fbfcfe] px-5 py-3">
          <button type="button" onClick={openCompare} disabled={busy || !file} title={file ? 'See the current invoice next to the new file' : 'Choose a file first'} className="mr-auto inline-flex h-8 items-center gap-2 rounded-md border border-[#b3c3e4] bg-white px-3.5 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb] disabled:opacity-50" style={BTN_XS_BOLD}><Columns2 size={14} /> Compare</button>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-8 items-center rounded-md border border-[#b3c3e4] bg-white px-3.5 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb] disabled:opacity-50" style={BTN_XS_BOLD}>Cancel</button>
          <button type="button" onClick={submit} disabled={!file || busy} className="inline-flex h-8 items-center gap-2 rounded-md bg-[#052e86] px-3.5 text-xs font-semibold text-white transition hover:bg-[#052e86] disabled:opacity-50" style={BTN_XS_BOLD}>
            <Upload size={14} /> Overwrite invoice
          </button>
        </footer>

        {compare && file && <CompareOverlay invoice={invoice} currentUrl={compare.url} loading={compare.loading} file={file} invoiceNumber={invoice.invoice_number || invoice.name} onClose={closeCompare} onOverwrite={() => { closeCompare(); submit() }} />}
        {done && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center" role="status" aria-live="polite">
            <span className="grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={34} /></span>
            <p className="text-base font-bold text-[#000000]">Invoice replaced successfully</p>
            <p className="max-w-sm text-xs leading-5 text-[#5f5f5f]">We have read your new file and updated the invoice's details. It has been sent back for approval, so it no longer needs correction.</p>
            <button type="button" onClick={onFinished} className="mt-2 inline-flex h-8 items-center rounded-md bg-[#052e86] px-3.5 text-xs font-semibold text-white transition hover:bg-[#052e86]" style={BTN_XS_BOLD}>Done</button>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-[1px]" role="status" aria-live="polite">
            <LoaderCircle size={32} className="animate-spin text-[#0046dc]" />
            <p className="text-sm font-bold text-[#000000]">Replacing your invoice…</p>
            <p className="max-w-xs text-center text-xs text-[#5f5f5f]">The new file is being read and the invoice details are being updated. Please keep this window open.</p>
          </div>
        )}
      </section>
    </div>,
    document.body,
  )
}
