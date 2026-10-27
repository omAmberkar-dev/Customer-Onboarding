import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, LayoutList, LoaderCircle, Upload, X } from 'lucide-react'
import { getInvoicePreviewUrl, previewInvoiceReplacement } from '../../api/vendorApi'
import { Amounts, Overview } from './invoiceDetailViews'

const BTN = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }

// Hide the built-in thumbnail sidebar and fit the page to the viewer width; toolbar zoom then works from that baseline.
export const pdfSrc = (url) => (url ? `${url.split('#')[0]}#navpanes=0&pagemode=none&view=FitH` : url)

// The invoice's stored file as something an iframe can show: fetched here and re-served as an in-memory PDF, because the storage
// link's "attachment" headers would otherwise make the browser download it. Returns a blob: URL (the caller revokes it) or the
// storage link itself when it cannot be read from here. Throws a readable Error.
export async function loadInvoicePdfUrl(invoice) {
  if (invoice.source === 'local' && invoice.url) return invoice.url
  const sourceUrl = await getInvoicePreviewUrl(invoice.blobUrl || invoice.blob_url)
  let response
  try {
    response = await fetch(sourceUrl)
  } catch {
    // Storage blocks cross-origin reads (CORS): retry through the same-origin proxy.
    try {
      response = await fetch(`/blob-proxy?u=${encodeURIComponent(sourceUrl)}`)
    } catch {
      response = null
    }
  }
  if (!response) return sourceUrl
  if (!response.ok) throw new Error('The invoice file could not be found. It may not have been uploaded properly.')
  const buffer = await response.arrayBuffer()
  const isPdf = new TextDecoder().decode(buffer.slice(0, 1024)).includes('%PDF-')
  if (!buffer.byteLength || !isPdf) throw new Error('This invoice file is empty or is not a valid PDF, so it cannot be previewed.')
  return URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
}

// The invoice being replaced next to the file about to replace it, so the user can check it is the right one before overwriting.
// One switch in the header chooses Details (the invoice details of each side stacked in one scroll, scrolling together, with a
// row of links to jump to a section) or the two PDFs. The new file's details are read from it; nothing is saved.
const SECTIONS = [['vendor', 'Customer'], ['customer', 'Customer / Billing'], ['invoice', 'Invoice / Payment'], ['amounts', 'Amounts'], ['line-items', 'Line items']]

export function CompareOverlay({ invoice, currentUrl, loading, file, invoiceNumber, onClose, onOverwrite }) {
  // Created in an effect (not during render) so the cleanup that revokes it cannot kill the URL still on screen, e.g. when React
  // re-runs effects in development.
  const [nextUrl, setNextUrl] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setNextUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const nextIsImage = file.type.startsWith('image/')

  // What the new file says (read once for as long as the screen is open).
  const [reading, setReading] = useState({ state: 'loading', invoice: null, error: '' })
  useEffect(() => {
    let ignore = false
    setReading({ state: 'loading', invoice: null, error: '' })
    previewInvoiceReplacement(invoice.id, file)
      .then((data) => { if (!ignore) setReading({ state: 'ready', invoice: data, error: '' }) })
      .catch((err) => { if (!ignore) setReading({ state: 'error', invoice: null, error: err.message || 'The new file could not be read.' }) })
    return () => { ignore = true }
  }, [invoice.id, file])

  const [mode, setMode] = useState('details')

  // The two details panes scroll together: whichever the user scrolls, the other follows (the flag stops them chasing each other).
  const panes = useRef({ current: null, next: null })
  const syncing = useRef(false)
  const jumping = useRef(false)
  const onPaneScroll = (side) => () => {
    if (jumping.current) return
    if (syncing.current) { syncing.current = false; return }
    const source = panes.current[side]
    const target = panes.current[side === 'current' ? 'next' : 'current']
    if (!source || !target || Math.abs(target.scrollTop - source.scrollTop) < 1) return
    const before = target.scrollTop
    syncing.current = true
    target.scrollTop = source.scrollTop
    // A target that cannot move (already at its end) raises no scroll event, so there is nothing for the flag to swallow.
    if (Math.abs(target.scrollTop - before) < 1) syncing.current = false
  }
  const jumpTo = useCallback((anchor) => {
    // Each side goes to its own copy of the section (they may sit at different heights); the scroll sync is paused meanwhile.
    jumping.current = true
    window.setTimeout(() => { jumping.current = false }, 700)
    ;['current', 'next'].forEach((side) => {
      const container = panes.current[side]
      const section = container?.querySelector(`[data-anchor="${anchor}"]`)
      if (!container || !section) return
      container.scrollTo({ top: section.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 4, behavior: 'smooth' })
    })
  }, [])

  const switcher = (
    <div className="inline-flex shrink-0 gap-0.5 rounded-lg bg-[#f1f4f8] p-1" role="tablist" aria-label="What to compare">
      {[['details', 'Details', LayoutList], ['pdf', 'PDFs', FileText]].map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => setMode(value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0046dc]/40 ${mode === value ? 'bg-white text-[#052e86] shadow-[0_1px_2px_rgba(16,42,76,0.15)]' : 'text-[#5f5f5f] hover:text-[#000000]'}`}
          style={{ fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  )
  const pane = (title, subtitle, accent, body) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className={`border-b border-[#d8e0e9] border-t-[3px] px-4 py-2 ${accent}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">{title}</p>
        <p className="truncate text-[11.5px] text-[#5f5f5f]" title={subtitle}>{subtitle}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-[#f1f4f8]">{body}</div>
    </div>
  )
  const details = (side, data) => (
    <div ref={(node) => { panes.current[side] = node }} onScroll={onPaneScroll(side)} className="h-full overflow-y-auto px-4 py-3">
      <Overview invoice={data} />
      <Amounts invoice={data} />
    </div>
  )
  const message = (icon, text, tone = 'text-[#5f5f5f]') => (
    <div className={`grid h-full place-items-center px-6 text-center text-xs ${tone}`}>
      <div className="flex flex-col items-center gap-2">{icon}<p className="max-w-xs">{text}</p></div>
    </div>
  )

  const currentBody = mode === 'pdf'
    ? (loading ? message(<LoaderCircle size={24} className="animate-spin text-[#0046dc]" />, 'Loading the current invoice…')
      : currentUrl ? <iframe src={pdfSrc(currentUrl)} title="Current invoice" className="h-full min-h-[300px] w-full border-0" />
        : message(null, 'The current file could not be shown.'))
    : details('current', invoice)
  const nextBody = mode === 'pdf'
    ? (!nextUrl ? null : nextIsImage ? <img src={nextUrl} alt="New invoice" className="h-full w-full object-contain" /> : <iframe src={pdfSrc(nextUrl)} title="New invoice" className="h-full min-h-[300px] w-full border-0" />)
    : reading.state === 'loading' ? message(<LoaderCircle size={24} className="animate-spin text-[#0046dc]" />, 'Reading the new file…')
      : reading.state === 'error' ? message(null, `${reading.error} You can still compare the PDFs, or overwrite the invoice.`, 'text-red-600')
        : details('next', reading.invoice)

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex h-[94dvh] w-full max-w-[1600px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Compare invoices">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-[#2566ff] bg-[#eef2fb] px-5 py-2.5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5f5f5f]">Compare invoices</p>
          <p className="text-sm font-bold text-[#000000]">{invoiceNumber}</p>
        </div>
        <div className="flex items-center gap-3">
          {switcher}
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="inline-grid size-8 place-items-center rounded-md border border-[#b3c3e4] bg-white text-[#052e86] transition hover:bg-[#eef2fb]"><X size={16} /></button>
        </div>
      </header>
      {mode === 'details' && (
        <nav className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[#d8e0e9] bg-white px-5 py-2" aria-label="Jump to a section">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#5f5f5f]">Jump to</span>
          {SECTIONS.map(([anchor, label]) => (
            <button key={anchor} type="button" onClick={() => jumpTo(anchor)} className="inline-flex h-6 items-center rounded-full border border-[#c2cdda] bg-white px-2.5 text-[#5f5f5f] transition hover:border-[#0046dc] hover:text-[#0046dc]" style={{ fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }}>{label}</button>
          ))}
        </nav>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {pane('Current invoice', 'Will be replaced', 'border-t-[#a7b4c8]', currentBody)}
        <div className="hidden w-px bg-[#d8e0e9] lg:block" />
        {pane('New file', file.name, 'border-t-[#0046dc]', nextBody)}
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#d8e0e9] bg-[#fbfcfe] px-5 py-3">
        <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-[#b3c3e4] bg-white px-3.5 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb]" style={BTN}>Back</button>
        {onOverwrite && <button type="button" onClick={onOverwrite} className="inline-flex h-8 items-center gap-2 rounded-md bg-[#052e86] px-3.5 text-xs font-semibold text-white transition hover:bg-[#052e86]" style={BTN}><Upload size={14} /> Overwrite invoice</button>}
      </footer>
      </div>
    </div>,
    document.body,
  )
}
