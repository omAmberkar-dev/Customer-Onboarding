import { createPortal } from 'react-dom'
import { AlertCircle, FileText, RotateCcw, X } from 'lucide-react'

// The global `button { font: inherit }` rule beats Tailwind's font utilities (they are layered), so button text sizes are set inline.
const BTN = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }

// Shown when an uploaded invoice could not be read. Such a file is not added to the invoice list (so it is in no tab): the vendor is
// told, and can try again with the same file or upload a clearer one.
export default function ReadFailureModal({ failures, onClose, onRetry }) {
  if (!failures.length) return null
  const many = failures.length > 1
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="read-failure-title">
        <header className="flex items-start justify-between gap-4 border-b-2 border-[#2566ff] bg-[#eef2fb] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#fff0f1] text-[#bf4252]"><AlertCircle size={19} /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5f5f5f]">Upload failed</p>
              <h2 id="read-failure-title" className="text-[17px] font-bold text-[#000000]">{many ? `${failures.length} invoices could not be read` : 'We could not read this invoice'}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-[#5f5f5f] transition hover:bg-white hover:text-[#000000]"><X size={18} /></button>
        </header>

        <div className="space-y-4 overflow-y-auto px-5 py-4 text-xs">
          <div className="space-y-1.5">
            {failures.map((failure) => (
              <div key={failure.id} className="flex items-start gap-3 rounded-lg border border-red-200 border-l-[3px] border-l-red-500 bg-red-50/50 px-3 py-2">
                <FileText size={15} className="mt-0.5 shrink-0 text-[#bf4252]" />
                <div className="min-w-0">
                  <p className="break-words font-semibold text-[#000000]">{failure.name}</p>
                  {failure.message && <p className="mt-0.5 break-words text-[#7a2a2a]">{failure.message}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[#5f5f5f]">
            <p className="font-semibold text-[#474747]">What you can do</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Try uploading {many ? 'them' : 'it'} again, in case it was a temporary problem.</li>
              <li>Upload a clearer, readable PDF: not blurred, cut off or password protected, with the text selectable if possible.</li>
            </ul>
            <p className="mt-2">{many ? 'These files have' : 'This file has'} not been added to your invoices.</p>
          </div>
        </div>

        <footer className="flex justify-end gap-2.5 border-t border-[#d8e0e9] bg-[#fbfcfe] px-5 py-3">
          <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-[#b3c3e4] bg-white px-3.5 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb]" style={BTN}>Close</button>
          <button type="button" onClick={() => onRetry(failures.map((failure) => failure.file).filter(Boolean))} className="inline-flex h-8 items-center gap-2 rounded-md bg-[#052e86] px-3.5 text-xs font-semibold text-white transition hover:bg-[#052e86]" style={BTN}><RotateCcw size={14} /> Try again</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
