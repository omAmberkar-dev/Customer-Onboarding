import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquareWarning, X } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import { declineAgreement } from '../../api/vendorApi'

const MIN = 3
const MAX = 500

// Asks the vendor why they cannot sign (3-500 characters) and sends it to our team.
export default function DeclineDialog({ open, agreementId, title = 'Request changes', description = 'Tell us what needs to change. Our team will review it and send you a corrected agreement.', confirmLabel = 'Send to our team', atStep = 'sign', onClose, onDeclined }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    setReason('')
    setError('')
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const trimmed = reason.trim()
  const valid = trimmed.length >= MIN && trimmed.length <= MAX

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await declineAgreement(agreementId, trimmed, atStep)
      onDeclined?.(result)
    } catch (err) {
      setError(err.message || 'Unable to send your response. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // The same look as the "Request changes" dialog: a tinted header and footer band around the form.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[#b3c3e4]/80 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="decline-title">
        <header className="flex items-start justify-between gap-3 border-b border-[#b3c3e4]/80 bg-[#eef2fb] px-5 py-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-amber-700 shadow-sm ring-1 ring-[#dce6ff]"><MessageSquareWarning size={19} /></span>
            <div>
              <p className="eyebrow">Customer agreement</p>
              <h2 id="decline-title" className="mt-0.5 text-xl font-extrabold tracking-[-0.02em] text-navy-950">{title}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog" className="interactive-icon -mr-2 min-h-9! min-w-9!"><X size={18} /></button>
        </header>

        <div className="px-5 py-4">
          <p className="text-xs leading-5 text-slate-600">{description}</p>
          <label htmlFor="decline-reason" className="mb-1 mt-3.5 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900">Reason <span className="text-red-600" aria-hidden="true">*</span></label>
          <textarea id="decline-reason" className="app-field h-28 min-h-0! resize-none py-2! text-[13px]! leading-5!" value={reason} maxLength={MAX} onChange={(event) => setReason(event.target.value)} disabled={busy} aria-required="true" placeholder="e.g. The agreement term is not what we discussed" autoFocus />
          <p className="mt-1 text-[11px] text-slate-500">{trimmed.length < MIN ? `Please write at least ${MIN} characters.` : `${trimmed.length} / ${MAX}`}</p>
          {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#b3c3e4]/80 bg-[#eef2fb] px-5 py-2.5 text-[13px]">
          <Button variant="secondary" className="min-h-9! px-4! py-1.5! text-[13px]!" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="min-h-9! px-4! py-1.5! text-[13px]!" onClick={submit} disabled={!valid || busy} aria-busy={busy}>
            {busy ? <><Loader /> Sending…</> : confirmLabel}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
