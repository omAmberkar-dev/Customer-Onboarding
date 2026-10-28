import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Eye, FileText, Pencil, PencilLine, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getMyDocuments, getUpdateRequests, getVendorProfile, UPDATE_REQUESTS_CHANGED_EVENT } from '../../api/vendorApi'
import Button from '../common/Button'
import useAgreementHold, { HOLD_TOOLTIP } from '../../hooks/useAgreementHold'
import Loader from '../common/Loader'
import EditDetailsModal from './EditDetailsModal'
import DocumentPreview from '../vendor-request/DocumentPreview'
import { documentPreviewItems, uploadedDocumentId } from '../../utils/documentPreview'
import { displayProfileValue, isRegisteredMsme, sections } from './profileFields'
import { cinApplies } from '../../data/vendorTypes'
import { documentTypes } from '../../data/documentTypes'
import { OPEN_REQUEST_CHANGES_EVENT } from '../../utils/events'

const POLL_INTERVAL_MS = 10000
const IN_REVIEW = ['update requested', 'sent for approval']
const wideKeys = new Set(['vendor_legal_name', 'street', 'account_holder_name'])

// The vendor's profile, read-only. "Edit details" opens a popup (EditDetailsModal) that shows the
// current details beside an editable copy; the change is then sent for approval rather than applied.
// With `readOnly` (the application is still under review) it is a copy of what was submitted: no editing and no update
// requests, but the uploaded documents are listed and there is a shortcut to ask for changes.
export default function VendorProfilePanel({ open, onClose, profile, onProfileRefresh, readOnly = false }) {
  const [editOpen, setEditOpen] = useState(false)
  const { onHold } = useAgreementHold()
  const [openRequest, setOpenRequest] = useState(null)
  const [sentNotice, setSentNotice] = useState(false)
  const [documents, setDocuments] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  // The received documents as a gallery for the preview (the same one the application form uses).
  const previewItems = useMemo(() => documentPreviewItems({}, documents || {}).filter((item) => item.blobName), [documents])

  const refreshRef = useRef(onProfileRefresh)
  useEffect(() => { refreshRef.current = onProfileRefresh }, [onProfileRefresh])

  useEffect(() => {
    if (!open) return
    setEditOpen(false)
    setSentNotice(false)
  }, [open])

  // While the panel is open, keep it in step with the review without a page reload: check the
  // request on a timer, when the tab regains focus, and right after a request is sent. When a
  // request that was in review is no longer (approved or rejected), reload the vendor's profile so
  // the new details - or the unchanged old ones - show immediately and Edit details comes back.
  const hadOpenRequest = useRef(false)
  useEffect(() => {
    if (!open || !readOnly) return
    getMyDocuments().then(setDocuments).catch(() => setDocuments({}))
  }, [open, readOnly])

  useEffect(() => {
    if (!open || readOnly || !profile?.vendor_id) return undefined
    const vendorId = profile.vendor_id
    let ignore = false

    const check = () => {
      getUpdateRequests(vendorId)
        .then(async (requests) => {
          if (ignore) return
          const inReview = requests.find((item) => IN_REVIEW.includes(item.status)) || null
          setOpenRequest(inReview)
          if (inReview) {
            hadOpenRequest.current = true
            return
          }
          if (hadOpenRequest.current) {
            hadOpenRequest.current = false
            setSentNotice(false)
            const fresh = await getVendorProfile(vendorId)
            if (!ignore && fresh) refreshRef.current?.(fresh)
          }
        })
        .catch(() => {})
    }
    const refresh = () => { if (document.visibilityState === 'visible') check() }

    check()
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
  }, [open, readOnly, profile?.vendor_id])

  if (!open) return null

  const pending = Boolean(openRequest) || sentNotice

  return (
    <>
      {/* The panel steps aside while the edit popup is open, and comes back when it closes. */}
      {!editOpen && <div
        // While reviewing, the panel sits beside the status page, below the header, with no dimming: nothing is covered.
        className={`fixed z-50 flex justify-end ${readOnly ? 'pointer-events-none bottom-0 right-0 top-14' : 'inset-0 bg-navy-950/45 backdrop-blur-[2px]'}`}
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      >
        <aside className={`flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl ${readOnly ? 'pointer-events-auto border-l border-[#b3c3e4]' : ''}`} role="dialog" aria-modal="true" aria-labelledby="vendor-profile-title">
          <header className={`flex items-start justify-between border-b px-5 py-4 sm:px-6 ${readOnly ? 'border-[#b3c3e4] bg-[#eef2fb]' : 'border-slate-200'}`}>
            <div className="min-w-0">
              <p className="eyebrow">{readOnly ? 'Submitted application' : 'Customer profile'}</p>
              <h2 id="vendor-profile-title" className="mt-1 truncate text-xl font-extrabold text-navy-950">
                {profile?.vendor_legal_name || profile?.email || 'Customer details'}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {readOnly
                ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{profile?.stage === 'rejected' ? 'Not approved' : profile?.stage === 'change_requested' ? 'Change requested' : profile?.stage === 'agreement_signed' ? 'Agreement signed' : 'In review'}</span>
                : profile?.status && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold capitalize text-emerald-700">{profile.status}</span>}
              <button type="button" onClick={onClose} className="interactive-icon" aria-label="Close customer profile"><X size={20} /></button>
            </div>
          </header>

          {!profile ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm font-semibold text-slate-600"><Loader /> Loading customer details...</div>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px] sm:px-6">
                {pending && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    <Clock size={15} className="mt-0.5 shrink-0" />
                    <p>
                      {sentNotice ? 'Your update request has been sent for review. ' : 'You have an update request awaiting approval. '}
                      Your current details stay active until it is approved. <Link to="/update-requests" onClick={onClose} className="font-bold underline">Track request</Link>
                    </p>
                  </div>
                )}

                {sections.map(({ title, icon: Icon, fields }) => (
                  <section key={title}>
                    <h3 className="flex items-center gap-2 border-b border-slate-100 pb-1.5 text-[13px] font-bold text-navy-900">
                      <Icon size={15} className="text-brand-600" /> {title}
                    </h3>
                    <div className="mt-2.5 grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
                      {fields.filter(([key]) => (key !== 'udyam_number' || isRegisteredMsme(profile)) && (key !== 'cin' || cinApplies(profile.msme_status) || String(profile.cin ?? '').trim() !== '')).map(([key, label]) => (
                        <div key={key} className={wideKeys.has(key) ? 'sm:col-span-2' : ''}>
                          <p className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">{label}</p>
                          <p className="mt-0.5 min-h-5 break-words text-[13px] font-semibold text-navy-900">{displayProfileValue(key, profile[key]) || '—'}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                {readOnly && (
                  <section>
                    <h3 className="flex items-center gap-2 border-b border-slate-100 pb-1.5 text-[13px] font-bold text-navy-900">
                      <FileText size={15} className="text-brand-600" /> Documents received
                    </h3>
                    {documents === null ? (
                      <p className="mt-2.5 flex items-center gap-2 text-xs text-slate-500"><Loader /> Loading…</p>
                    ) : Object.keys(documents).length === 0 ? (
                      <p className="mt-2.5 text-xs text-slate-500">No supporting documents were uploaded.</p>
                    ) : (
                      <ul className="mt-2.5 space-y-1.5">
                        {Object.entries(documents).map(([type, files]) => (
                          <li key={type} className="text-xs">
                            <span className="font-bold text-navy-900">{documentTypes.find((item) => item.key === type)?.label || type}</span>
                            <ul className="mt-0.5 space-y-0.5">
                              {files.map((file) => (
                                <li key={file.blob_name || file.original_name} className="flex items-center justify-between gap-2">
                                  {file.blob_name
                                    ? <button type="button" onClick={() => setPreviewId(uploadedDocumentId(file))} className="min-w-0 truncate text-left text-slate-600 hover:text-brand-700 hover:underline" title={file.original_name}>{file.original_name}</button>
                                    : <span className="min-w-0 truncate text-slate-600" title={file.original_name}>{file.original_name}</span>}
                                  {file.blob_name && (
                                    <button type="button" onClick={() => setPreviewId(uploadedDocumentId(file))} aria-label={`Preview ${file.original_name}`} title="Preview" className="grid size-6 shrink-0 place-items-center rounded-md text-brand-600 transition hover:bg-brand-50 hover:text-brand-700">
                                      <Eye size={14} />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </div>

              <footer className={`flex items-center justify-between gap-2 border-t px-5 py-3 text-[13px] sm:px-6 ${readOnly ? 'border-[#b3c3e4] bg-[#eef2fb]' : 'border-slate-200 bg-white'}`}>
                {readOnly ? (
                  profile?.stage === 'change_requested' ? (
                    <p className="text-xs text-slate-500">You have asked to change details. Our team will send your application back to you.</p>
                  ) : ['maker_review', 'checker_review'].includes(profile?.stage) ? (
                    <>
                      <p className="text-xs text-slate-500">Spotted a mistake? Our team can send the application back to you.</p>
                      <Button
                        variant="secondary"
                        className="min-h-9! shrink-0 px-4! py-1.5! text-[13px]!"
                        onClick={() => { onClose(); window.dispatchEvent(new Event(OPEN_REQUEST_CHANGES_EVENT)) }}
                      >
                        <PencilLine size={15} /> Request changes
                      </Button>
                    </>
                  ) : null
                ) : (
                <Button className="min-h-9! px-4! py-1.5!" type="button" onClick={() => setEditOpen(true)} disabled={pending || onHold} title={onHold ? HOLD_TOOLTIP : pending ? 'An update request is already awaiting approval' : undefined}>
                  <Pencil size={16} /> Edit details
                </Button>
                )}
              </footer>
            </>
          )}
        </aside>
      </div>}

      {/* A portal above the panel (z-60 over the panel's z-50): closing it, or pressing Esc, returns to the panel. */}
      <DocumentPreview items={previewItems} activeId={previewId} onChange={setPreviewId} onClose={() => setPreviewId(null)} />

      <EditDetailsModal
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSent={() => {
          setEditOpen(false)
          setSentNotice(true)
        }}
      />
    </>
  )
}
