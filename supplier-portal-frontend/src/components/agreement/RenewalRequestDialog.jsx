import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, CheckCircle2, Minus, Plus, X } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import { requestRenewal } from '../../api/vendorApi'
import { formatDate } from './agreementUtils'

const NOTE_MAX = 500
const label = 'mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900'

// Asks for a renewed agreement: a preferred start date (within the allowed window), the term in months and an optional note.
export default function RenewalRequestDialog({ open, renewal, onClose, onDone }) {
  const [start, setStart] = useState('')
  const [term, setTerm] = useState(24)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    setStart(renewal?.min_start || '')
    setTerm(Number(renewal?.default_term_months) || 24)
    setNote('')
    setError('')
    setSent(false)
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, renewal, onClose])

  if (!open) return null
  const termValid = Number.isInteger(term) && term >= 1 && term <= 60
  const startValid = Boolean(start) && start >= renewal.min_start && start <= renewal.max_start
  const valid = termValid && startValid && note.length <= NOTE_MAX

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      await requestRenewal({ start_date: start, term_months: term, note: note.trim() })
      setSent(true)
      onDone?.()
    } catch (err) {
      setError(err.message || 'Unable to send your request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-6 pb-6 pt-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="renewal-title">
        <div className="flex items-center justify-between">
          <div className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700">{sent ? <CheckCircle2 size={20} /> : <CalendarClock size={20} />}</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog" className="interactive-icon -mr-2 !min-h-9 !min-w-9"><X size={18} /></button>
        </div>

        {sent ? (
          <>
            <h2 id="renewal-title" className="mt-4 text-lg font-bold leading-6 text-navy-900">We have told our team</h2>
            <p className="mt-2 text-[13px] leading-5 text-slate-600">Your renewal request is with our team. You will get an email when your new agreement is ready to sign.</p>
            <div className="mt-6 flex justify-end"><Button className="min-h-10! px-4! py-2! text-[13px]!" onClick={onClose}>Done</Button></div>
          </>
        ) : (
          <>
            <h2 id="renewal-title" className="mt-4 text-lg font-bold leading-6 text-navy-900">Request renewal</h2>
            <p className="mt-2 text-[13px] leading-5 text-slate-600">Tell us when you would like your new agreement to start and for how long. Our team will issue it for your signature.</p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="renewal-start" className={label}>Preferred start date</label>
                <input id="renewal-start" type="date" className="app-field" value={start} min={renewal.min_start} max={renewal.max_start} onChange={(event) => setStart(event.target.value)} disabled={busy} />
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  {renewal.current_end ? `Your current agreement ends on ${formatDate(renewal.current_end)}, so the new one can start from ${formatDate(renewal.min_start)}.` : `The new agreement can start from ${formatDate(renewal.min_start)}.`} Up to {formatDate(renewal.max_start)}.
                </p>
              </div>
              <div>
                <label htmlFor="renewal-term" className={label}>Term (months)</label>
                <div className="inline-flex items-center gap-1.5">
                  <button type="button" className="grid size-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50" onClick={() => setTerm((value) => Math.max(1, (Number(value) || 1) - 1))} disabled={busy || term <= 1} aria-label="Fewer months"><Minus size={15} /></button>
                  <input id="renewal-term" type="number" min={1} max={60} className="app-field w-20 text-center" value={Number.isNaN(term) ? '' : term} onChange={(event) => setTerm(event.target.value === '' ? NaN : Number(event.target.value))} disabled={busy} />
                  <button type="button" className="grid size-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50" onClick={() => setTerm((value) => Math.min(60, (Number(value) || 0) + 1))} disabled={busy || term >= 60} aria-label="More months"><Plus size={15} /></button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">From 1 to 60 months.</p>
              </div>
              <div>
                <label htmlFor="renewal-note" className={label}>Note (optional)</label>
                <textarea id="renewal-note" className="app-field min-h-24 resize-y" value={note} maxLength={NOTE_MAX} onChange={(event) => setNote(event.target.value)} disabled={busy} placeholder="Anything you want us to know, for example details that changed" />
                <p className="mt-1 text-right text-[11px] text-slate-500">{note.length} / {NOTE_MAX}</p>
              </div>
            </div>

            {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2.5 text-[13px] sm:flex-row sm:justify-end">
              <Button variant="secondary" className="min-h-10! px-4! py-2!" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button className="min-h-10! px-4! py-2!" onClick={submit} disabled={!valid || busy} aria-busy={busy}>{busy ? <><Loader /> Sending…</> : 'Send request'}</Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
