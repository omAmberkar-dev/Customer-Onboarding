import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileWarning, Minus, Plus, X } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import { fetchMyDocumentBlob } from '../../api/vendorApi'
import { formatFileSize } from '../../utils/formatters'
import { isImageName } from '../../utils/documentPreview'

const SMALL = 'min-h-9! px-4! py-1.5! text-[13px]!'
// Zoom steps relative to the image's fit-to-window size (1 = fit).
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const FIT = ZOOM_STEPS.indexOf(1)
const PAD = 12

// Loads the file of the item being previewed as a blob: URL (fetched only now, revoked when it changes or closes).
function usePreviewFile(item, attempt) {
  const [state, setState] = useState({ url: '', error: '', loading: false })
  const itemRef = useRef(item)
  itemRef.current = item
  const id = item?.id
  useEffect(() => {
    const current = itemRef.current
    if (!id || !current) return undefined
    let ignore = false
    let created = ''
    setState({ url: '', error: '', loading: true })
    const load = current.file
      ? Promise.resolve(current.file)
      : fetchMyDocumentBlob(current.blobName)
    load
      .then((blob) => {
        if (ignore) return
        created = URL.createObjectURL(blob)
        setState({ url: created, error: '', loading: false })
      })
      .catch((err) => { if (!ignore) setState({ url: '', error: err.message || 'Preview unavailable', loading: false }) })
    return () => {
      ignore = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [id, attempt])
  return state
}

// A gallery over every document listed in the form: images (click to zoom) and PDFs, with Previous / Next, open in a tab and download.
export default function DocumentPreview({ items, activeId, onChange, onClose }) {
  const index = items.findIndex((entry) => entry.id === activeId)
  const item = index >= 0 ? items[index] : null
  const [attempt, setAttempt] = useState(0)
  const [zoomStep, setZoomStep] = useState(FIT)
  const [natural, setNatural] = useState(null) // { w, h } of the image being shown
  const [stage, setStage] = useState({ w: 0, h: 0 }) // the size of the scroll area
  const scroller = useRef(null)
  const drag = useRef(null)
  const zoomIn = useCallback(() => setZoomStep((step) => Math.min(ZOOM_STEPS.length - 1, step + 1)), [])
  const zoomOut = useCallback(() => setZoomStep((step) => Math.max(0, step - 1)), [])
  const zoomFit = useCallback(() => setZoomStep(FIT), [])
  const { url, error, loading } = usePreviewFile(item, attempt)
  const dialogRef = useRef(null)
  const image = item ? (item.file ? item.file.type.startsWith('image/') : isImageName(item.name)) : false
  const imageRef = useRef(image)
  imageRef.current = image

  const go = useCallback((step) => {
    if (items.length < 2 || index < 0) return
    onChange(items[(index + step + items.length) % items.length].id)
  }, [items, index, onChange])

  useEffect(() => { setZoomStep(FIT); setNatural(null); setAttempt(0) }, [activeId])
  useEffect(() => { setNatural(null) }, [url])

  useEffect(() => {
    if (!item) return undefined
    const previous = document.activeElement
    dialogRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      else if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
      else if (imageRef.current && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') && (event.key === '+' || event.key === '=')) { event.preventDefault(); zoomIn() }
      else if (imageRef.current && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') && (event.key === '-' || event.key === '_')) { event.preventDefault(); zoomOut() }
      else if (imageRef.current && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') && event.key === '0') { event.preventDefault(); zoomFit() }
      else if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled), a[href], iframe, [tabindex]:not([tabindex="-1"])')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [Boolean(item), go, onClose, zoomIn, zoomOut, zoomFit]) // eslint-disable-line react-hooks/exhaustive-deps

  // The scroll area's size (to work out the fit size), and Ctrl + mouse wheel to zoom (a native, non-passive listener so the page does not zoom).
  const showingImage = Boolean(url && image)
  useEffect(() => {
    const box = scroller.current
    if (!box || !showingImage) return undefined
    const measure = () => setStage({ w: box.clientWidth, h: box.clientHeight })
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(box)
    const onWheel = (event) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      if (event.deltaY < 0) zoomIn()
      else if (event.deltaY > 0) zoomOut()
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => { observer?.disconnect(); box.removeEventListener('wheel', onWheel) }
  }, [showingImage, zoomIn, zoomOut])

  if (!item) return null

  const download = () => {
    const link = document.createElement('a')
    link.href = url
    link.download = item.name
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-navy-950/60 p-3 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-preview-title"
        className="flex h-[min(760px,90vh)] w-[min(980px,94vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#b3c3e4] bg-[#eef2fb] px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#474747]">{item.typeLabel}</p>
            <h2 id="doc-preview-title" className="truncate text-sm font-extrabold text-navy-950" title={item.name}>{item.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {item.size ? <span className="hidden text-xs font-medium text-slate-500 sm:inline">{formatFileSize(item.size)}</span> : null}
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${item.saved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{item.saved ? 'Uploaded' : 'Not saved yet'}</span>
            <button type="button" onClick={onClose} className="interactive-icon" aria-label="Close preview"><X size={20} /></button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-200">
          {loading && <div className="absolute inset-0 grid place-items-center"><span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader /> Loading the document…</span></div>}
          {error && (
            <div className="absolute inset-0 grid place-items-center px-4 text-center">
              <div className="flex flex-col items-center gap-3">
                <FileWarning size={30} className="text-slate-400" />
                <p role="alert" className="text-sm font-semibold text-red-700">Preview unavailable</p>
                <p className="max-w-sm text-xs text-slate-500">{error}</p>
                <Button variant="secondary" className={SMALL} onClick={() => setAttempt((count) => count + 1)}>Try again</Button>
              </div>
            </div>
          )}
          {url && image && (() => {
            // The image is sized explicitly (its fit size times the zoom), so the scroll area's scrollbars work and it can be panned.
            const availW = Math.max(40, stage.w - PAD * 2)
            const availH = Math.max(40, stage.h - PAD * 2)
            const fitW = natural ? Math.min(natural.w, availW, (availH * natural.w) / natural.h) : 0
            const zoom = ZOOM_STEPS[zoomStep]
            const width = fitW * zoom
            const canPan = natural && (width + PAD * 2 > stage.w || (width * natural.h) / natural.w + PAD * 2 > stage.h)
            return (
              <>
                <div
                  ref={scroller}
                  className={`absolute inset-0 overflow-auto ${canPan ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  onDoubleClick={() => setZoomStep((step) => (ZOOM_STEPS[step] === 2 ? FIT : ZOOM_STEPS.indexOf(2)))}
                  onPointerDown={(event) => {
                    if (!canPan || event.button !== 0) return
                    drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    if (!drag.current) return
                    event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
                    event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y)
                  }}
                  onPointerUp={() => { drag.current = null }}
                  onPointerCancel={() => { drag.current = null }}
                >
                  <div className="flex min-h-full min-w-full" style={{ padding: PAD }}>
                    <img
                      src={url}
                      alt={item.name}
                      draggable={false}
                      onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth || 1, h: event.currentTarget.naturalHeight || 1 })}
                      className="m-auto block max-w-none shrink-0 select-none"
                      style={natural ? { width } : { maxWidth: '100%', maxHeight: '100%' }}
                    />
                  </div>
                </div>
                <div className="absolute right-4 top-3 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow" role="group" aria-label="Zoom">
                  <button type="button" onClick={zoomOut} disabled={zoomStep === 0} aria-label="Zoom out" title="Zoom out" className="grid size-7 place-items-center rounded-md text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><Minus size={15} /></button>
                  <button type="button" onClick={zoomFit} aria-label="Fit to window" title="Fit to window" className="min-w-[3.25rem] rounded-md px-1.5 py-1 text-center text-slate-700 transition hover:bg-slate-100" style={{ fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }}>{zoomStep === FIT ? 'Fit' : `${Math.round(zoom * 100)}%`}</button>
                  <button type="button" onClick={zoomIn} disabled={zoomStep === ZOOM_STEPS.length - 1} aria-label="Zoom in" title="Zoom in" className="grid size-7 place-items-center rounded-md text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={15} /></button>
                </div>
              </>
            )
          })()}
          {url && !image && <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={item.name} className="absolute inset-0 size-full border-0 bg-white" />}
        </div>

        <footer className="border-t border-slate-200 bg-white px-4 py-2.5">
          <p className="mb-2 text-[11px] text-slate-500">Check that this is the right document and that every page is readable.</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="secondary" className={SMALL} onClick={() => go(-1)} disabled={items.length < 2}><ChevronLeft size={15} /> Previous</Button>
              <span className="text-xs font-semibold text-slate-600" aria-live="polite">{index + 1} of {items.length}</span>
              <Button variant="secondary" className={SMALL} onClick={() => go(1)} disabled={items.length < 2}>Next <ChevronRight size={15} /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className={SMALL} onClick={() => window.open(url, '_blank', 'noopener')} disabled={!url}><ExternalLink size={15} /> Open in new tab</Button>
              <Button variant="secondary" className={SMALL} onClick={download} disabled={!url}><Download size={15} /> Download</Button>
            </div>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
