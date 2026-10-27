import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { History, X } from 'lucide-react'

const BTN = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }
const CHIP = { fontSize: '0.6875rem', lineHeight: '1rem', fontWeight: 700 }

const stamp = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
}
const dayMonth = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
}
const replacedByText = (version) => (version?.replaced_by_role === 'maker' ? 'your Relationship Manager' : 'you')

// A simple side-by-side of the fields that changed between two versions (old | new), changed rows highlighted.
function ChangesDialog({ from, to, changes, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-slate-950/55 p-3" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={`Compare version ${from} with version ${to}`}>
        <header className="flex items-center justify-between gap-3 border-b-2 border-[#2566ff] bg-[#eef2fb] px-5 py-2.5">
          <p className="text-sm font-bold text-[#000000]">Version {from} compared with version {to}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-grid size-8 place-items-center rounded-md border border-[#b3c3e4] bg-white text-[#052e86] transition hover:bg-[#eef2fb]"><X size={16} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {changes.length === 0 ? (
            <p className="text-xs text-[#5f5f5f]">None of the compared details differ between these versions.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#5f5f5f]">
                  <th className="px-3 py-2">Detail</th><th className="px-3 py-2">Version {from}</th><th className="px-3 py-2">Version {to}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f4f8]">
                {changes.map((change) => (
                  <tr key={change.key} className="bg-[#fff9e8]">
                    <td className="px-3 py-2 font-semibold text-[#474747]">{change.label}</td>
                    <td className="break-words px-3 py-2 text-[#8a94a6] line-through">{change.from || '—'}</td>
                    <td className="break-words px-3 py-2 font-bold text-[#000000]">{change.to || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer className="flex justify-end border-t border-[#d8e0e9] bg-[#fbfcfe] px-5 py-3">
          <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-[#b3c3e4] bg-white px-3.5 text-xs font-semibold text-[#052e86] transition hover:bg-[#eef2fb]" style={BTN}>Close</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

const fullDay = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// The "v2" pill in the popup header: opens a small popover with the version history (nothing is added to the popup body).
export function VersionPill({ versions }) {
  const { info, selected, select } = versions
  const [open, setOpen] = useState(false)
  const [compare, setCompare] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!box.current?.contains(event.target)) setOpen(false) }
    // Capture phase, so Esc closes just the popover and not the whole invoice popup behind it.
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); event.stopImmediatePropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [open])

  if (!info || (info.versions.length === 0 && !info.earlier_versions_not_kept)) return null
  const latest = info.versions[0]

  const LINK = { fontSize: '0.8125rem', lineHeight: '1.25rem', fontWeight: 600 }
  const currentShown = selected == null

  return (
    <span ref={box} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Version history"
        className="inline-flex h-6 items-center gap-1 rounded-full border border-[#b3c3e4] bg-white px-2.5 text-[#052e86] transition hover:bg-[#eef2fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0046dc]/40"
        style={CHIP}
      >
        <History size={12} /> v{info.current_version}
      </button>
      {open && (
        <div role="dialog" aria-label="Version history" className="absolute left-0 top-full z-30 mt-1.5 w-[340px] max-w-[85vw] overflow-hidden rounded-lg border border-[#d8e0e9] bg-white shadow-[0_8px_24px_rgba(16,42,76,0.14)]">
          <p className="border-b border-[#f1f4f8] px-4 py-2.5 text-slate-500" style={{ fontSize: '0.6875rem', lineHeight: '1rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Version history</p>
          <ul className="divide-y divide-[#f1f4f8]">
            <li className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-[13px] font-bold text-[#000000]">v{info.current_version} · Current{currentShown && info.versions.length > 0 ? <span className="ml-2 text-[11px] font-medium text-slate-400">Viewing</span> : null}</p>
                <div className="flex shrink-0 items-center gap-3">
                  {!currentShown && <button type="button" onClick={() => { select(null); setOpen(false) }} className="text-[#0046dc] hover:underline" style={LINK}>View</button>}
                  {latest && <button type="button" onClick={() => { setCompare(true); setOpen(false) }} className="text-[#0046dc] hover:underline" style={LINK}>Compare</button>}
                </div>
              </div>
              {latest && <p className="mt-0.5 text-xs leading-5 text-slate-500">Replaced v{latest.version_no} on {stamp(latest.replaced_at)} by {replacedByText(latest)}</p>}
            </li>
            {info.versions.map((version) => (
              <li key={version.version_no} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="min-w-0 text-[13px] font-bold text-[#000000]">
                  v{version.version_no} · Replaced {fullDay(version.replaced_at)}
                  {selected === version.version_no && <span className="ml-2 text-[11px] font-medium text-slate-400">Viewing</span>}
                </p>
                {selected !== version.version_no && <button type="button" onClick={() => { select(version.version_no); setOpen(false) }} className="shrink-0 text-[#0046dc] hover:underline" style={LINK}>View</button>}
              </li>
            ))}
          </ul>
          {info.earlier_versions_not_kept > 0 && <p className="border-t border-[#f1f4f8] px-4 py-2.5 text-[11px] text-slate-400">Earlier versions of this invoice were not kept.</p>}
        </div>
      )}
      {compare && latest && <ChangesDialog from={latest.version_no} to={info.current_version} changes={latest.changes} onClose={() => setCompare(false)} />}
    </span>
  )
}

// The old version shown read-only: its amber label (instead of the status chip) and the two header buttons.
export function VersionLabel({ versions }) {
  const version = versions.info?.versions.find((item) => item.version_no === versions.selected)
  return <span className="rounded bg-amber-50 px-2 py-0.5 font-bold text-amber-800">Version {versions.selected} · Replaced {dayMonth(version?.replaced_at)}</span>
}

export function VersionHeaderActions({ versions }) {
  return (
    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={() => versions.select(null)} className="inline-flex h-8 items-center rounded-md bg-[#052e86] px-2.5 text-white transition hover:bg-[#052e86]" style={BTN}>Back to current</button>
    </div>
  )
}
