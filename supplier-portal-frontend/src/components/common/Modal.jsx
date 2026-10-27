import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import Button from './Button'
import Loader from './Loader'

const DISCARD_TEXT = {
  title: 'Discard this request?',
  description: 'Everything you have entered will be lost, because your progress is not saved anywhere. This cannot be undone.',
  cancelLabel: 'Keep editing',
  confirmLabel: 'Discard request',
}

export default function Modal({ open, onClose, onConfirm, title = DISCARD_TEXT.title, description = DISCARD_TEXT.description, cancelLabel = DISCARD_TEXT.cancelLabel, confirmLabel = DISCARD_TEXT.confirmLabel, confirmVariant = 'danger', busy = false, busyLabel = 'Please wait…' }) {
  const cancelRef = useRef(null)
  const dialogRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    cancelRef.current?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, busy])
  if (!open) return null
  // Rendered on the body so the dimming covers the whole page, header included.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy-950/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-6 pb-6 pt-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-description"
      >
        <div className="flex items-center justify-between">
          <div className="grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close dialog" className="interactive-icon -mr-2 !min-h-9 !min-w-9">
            <X size={18} />
          </button>
        </div>
        <h2 id="cancel-title" className="mt-4 text-lg font-bold leading-6 text-navy-900">{title}</h2>
        <p id="cancel-description" className="mt-2 text-[13px] leading-5 text-slate-600">{description}</p>
        {/* Buttons take their text size from this wrapper (the global button reset ignores a size set on the button itself). */}
        <div className="mt-6 flex flex-col-reverse gap-2.5 text-[13px] sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" className="min-h-10! px-4! py-2!" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={confirmVariant} className="min-h-10! px-4! py-2!" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? <><Loader /> {busyLabel}</> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
