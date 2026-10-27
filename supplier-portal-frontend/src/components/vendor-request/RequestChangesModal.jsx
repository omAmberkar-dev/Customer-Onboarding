import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, PencilLine, Search, X } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import { declineAgreement, getChangeRequestFields, requestChanges } from '../../api/vendorApi'

const SECTION_ORDER = ['Contact', 'Vendor', 'Address', 'Bank', 'Documents']
const SECTION_TITLES = { Contact: 'Contact', Vendor: 'Company & tax details', Address: 'Registered address', Bank: 'Bank details', Documents: 'Supporting documents' }

// Lets a vendor whose application is under review pick the details they want to change. Sending the request tells the
// maker or checker, who then sends the application back so the vendor can edit those fields themselves.
// With `agreementId` it is the "Request changes" of the agreement's details review: the same picker plus a note, and sending
// it declines that agreement as a change request for the checker.
export default function RequestChangesModal({ open, onClose, onSent, agreementId = null }) {
  const [note, setNote] = useState('')
  const [fields, setFields] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    let ignore = false
    setSelected(new Set())
    setQuery('')
    setNote('')
    setError('')
    setFields(null)
    getChangeRequestFields()
      .then((list) => { if (!ignore) setFields(list) })
      .catch((err) => { if (!ignore) { setFields([]); setError(err.message || 'Unable to load the fields.') } })
    return () => { ignore = true }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    dialogRef.current?.focus()
    const handleKey = (event) => { if (event.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, busy, onClose])

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const grouped = new Map()
    ;(fields || [])
      .filter((field) => !needle || field.field_label.toLowerCase().includes(needle))
      .forEach((field) => grouped.set(field.section, [...(grouped.get(field.section) || []), field]))
    return [...grouped.entries()].sort(([a], [b]) => (SECTION_ORDER.indexOf(a) + 1 || 99) - (SECTION_ORDER.indexOf(b) + 1 || 99))
  }, [fields, query])

  if (!open) return null

  const toggle = (key) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const send = async () => {
    setBusy(true)
    setError('')
    try {
      if (agreementId) await declineAgreement(agreementId, note.trim(), 'review', [...selected])
      else await requestChanges([...selected])
      onSent()
    } catch (err) {
      setError(err.message || 'Unable to send your request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Rendered on the body so it covers the whole page, header included.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy-950/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div ref={dialogRef} tabIndex={-1} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#b3c3e4]/80 bg-white shadow-2xl outline-none" role="dialog" aria-modal="true" aria-labelledby="request-changes-title">
        <header className="flex items-start justify-between gap-3 border-b border-[#b3c3e4]/80 bg-[#eef2fb] px-5 py-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-sm ring-1 ring-[#dce6ff]"><PencilLine size={19} /></span>
            <div>
              <p className="eyebrow">{agreementId ? 'Before you sign' : 'Application under review'}</p>
              <h2 id="request-changes-title" className="mt-0.5 text-xl font-extrabold tracking-[-0.02em] text-navy-950">Request changes</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog" className="interactive-icon -mr-2 min-h-9! min-w-9!"><X size={18} /></button>
        </header>

        <div className="space-y-2 border-b border-slate-100 px-5 py-2.5">
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-600">
            <Info size={14} className="mt-0.5 shrink-0 text-brand-600" />
            Tick the details you want to correct. Everything else stays as submitted, and verified details stay verified.{agreementId ? ' Our team will send your application back so you can fix them, then send you a new agreement.' : ''}
          </p>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search, e.g. IFSC, address, PAN document"
              className="app-field min-h-10! pl-9 text-[13px]!"
              aria-label="Search the details you can change"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-3">
          {fields === null ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader /> Loading…</p>
          ) : sections.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">{query ? `No details match “${query.trim()}”.` : 'There is nothing you can request to change right now.'}</p>
          ) : sections.map(([section, items]) => (
            <fieldset key={section}>
              <legend className="mb-1.5 flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <span>{SECTION_TITLES[section] || section}</span>
                {items.some((field) => selected.has(field.field_key)) && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-700">{items.filter((field) => selected.has(field.field_key)).length} selected</span>}
              </legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {items.map((field) => {
                  const checked = selected.has(field.field_key)
                  return (
                    <label key={field.field_key} title={field.field_label} className={`flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[12.5px] font-semibold transition focus-within:ring-2 focus-within:ring-brand-600/40 ${checked ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-slate-50'}`}>
                      <input type="checkbox" className="size-4 shrink-0 cursor-pointer accent-brand-600" checked={checked} onChange={() => toggle(field.field_key)} disabled={busy} />
                      <span className="min-w-0 truncate">{field.field_label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {agreementId && (
          <div className="border-t border-slate-100 px-5 py-2.5">
            <label htmlFor="change-note" className="mb-1 block text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900">Add a note <span className="font-semibold normal-case tracking-normal text-slate-500">(optional)</span></label>
            <textarea id="change-note" className="app-field h-16 min-h-0! resize-none py-2! text-[13px]! leading-5!" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} disabled={busy} placeholder="e.g. The bank account number is wrong" />
          </div>
        )}
        <footer className="border-t border-[#b3c3e4]/80 bg-[#eef2fb] px-5 py-2.5">
          {error && <p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p>}
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <p className="text-xs font-semibold text-slate-600" role="status">
              {selected.size === 0 ? 'Nothing selected yet' : `${selected.size} detail${selected.size === 1 ? '' : 's'} selected`}
              {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} disabled={busy} className="ml-2 font-bold text-brand-700 hover:underline">Clear</button>}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="min-h-9! px-4! py-1.5! text-[13px]!" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button className="min-h-9! px-4! py-1.5! text-[13px]!" onClick={send} disabled={busy || selected.size === 0} aria-busy={busy}>
                {busy ? <><Loader /> Sending…</> : 'Send request'}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
