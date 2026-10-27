import { useRef, useState } from 'react'
import { AlertCircle, Eye, FileText, Paperclip, UploadCloud, X } from 'lucide-react'
import Loader from '../common/Loader'
import FormSection from './FormSection'
import FlagNote from '../common/FlagNote'
import { DOCUMENT_ACCEPT, documentProblem, documentTypes } from '../../data/documentTypes'
import { fileKey, newDocumentId, uploadedDocumentId } from '../../utils/documentPreview'

// `files` are this type's picked files that are not uploaded yet (uploading, or failed, see `uploadState`); `existing` are the uploaded ones.
function DocumentSlot({ type, files, onPick, onRemovePicked, onRetry, uploadState = {}, existing = [], onDeleteExisting, onPreview, flag, onConfirm, onUnconfirm }) {
  const inputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [problem, setProblem] = useState('')
  const multiple = type.max > 1
  const full = multiple && existing.length + files.length >= type.max
  const busy = files.some((file) => uploadState[fileKey(type.key, file)]?.status === 'uploading')
  // An uploaded file is removed after a quick "Remove this document?" confirmation.
  const [confirming, setConfirming] = useState('')
  const [deleting, setDeleting] = useState('')
  const [rowError, setRowError] = useState({})
  const idOf = (file) => file.blob_name || file.original_name

  const removeExisting = async (file) => {
    setDeleting(idOf(file))
    setRowError({})
    try {
      await onDeleteExisting(type.key, file)
      setConfirming('')
    } catch (err) {
      setRowError({ [idOf(file)]: err.message || 'Unable to remove the document. Please try again.' })
    } finally {
      setDeleting('')
    }
  }

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || [])
    if (incoming.length === 0) return
    const bad = incoming.map(documentProblem).find(Boolean)
    if (bad) {
      setProblem(bad)
      return
    }
    // A single-file slot swaps its file for the new one; a multi-file slot adds until it is full. The file is uploaded right away.
    const next = multiple ? incoming : incoming.slice(0, 1)
    if (multiple && existing.length + files.length + next.length > type.max) {
      setProblem(`You can attach up to ${type.max} files here.`)
      return
    }
    setProblem('')
    onPick(type.key, next)
  }

  const remove = (file) => {
    setProblem('')
    onRemovePicked(type.key, file)
  }

  return (
    <div id={`doc-${type.key}`} className={`flex h-full min-w-0 flex-col rounded-lg border bg-white p-3 ${flag?.status === 'open' ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`}>
      <div className="mb-2 min-h-9">
        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-navy-900">{type.label}</p>
        {type.hint && <p className="text-[11px] leading-4 text-slate-500">{type.hint}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple={type.max > 1}
        className="hidden"
        tabIndex={-1}
        onChange={(event) => { addFiles(event.target.files); event.target.value = '' }}
      />

      {existing.length > 0 && (
        <ul className="mb-2 flex min-w-0 flex-col gap-1.5">
          {existing.map((file) => {
            const id = idOf(file)
            const busy = deleting === id
            return (
              <li key={id} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 basis-0 overflow-hidden">
                    {onPreview && file.blob_name
                      ? <button type="button" onClick={() => onPreview(uploadedDocumentId(file))} className="block max-w-full truncate text-left font-bold text-navy-900 hover:text-brand-700 hover:underline" style={FILE_NAME_STYLE} title={file.original_name}>{file.original_name}</button>
                      : <span className="block truncate font-bold text-navy-900" style={FILE_NAME_STYLE} title={file.original_name}>{file.original_name}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Uploaded</span>
                  {onPreview && file.blob_name && (
                    <button type="button" onClick={() => onPreview(uploadedDocumentId(file))} aria-label={`Preview ${file.original_name}`} title="Preview" className="grid size-6 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-brand-700">
                      <Eye size={14} />
                    </button>
                  )}
                  {onDeleteExisting && file.blob_name && (
                    <button
                      type="button"
                      onClick={() => { setRowError({}); setConfirming(confirming === id ? '' : id) }}
                      disabled={busy}
                      aria-label={`Remove ${file.original_name}`}
                      title="Remove"
                      className="grid size-6 shrink-0 place-items-center rounded-md text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {busy ? <Loader /> : <X size={14} />}
                    </button>
                  )}
                </div>
                {confirming === id && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-1.5" role="group" aria-label="Confirm removal">
                    <p className="text-[11px] font-semibold text-slate-700">Remove this document?</p>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => removeExisting(file)} disabled={busy} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-red-700 transition hover:bg-red-50 disabled:opacity-50" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        {busy ? <Loader /> : null} Remove
                      </button>
                      <button type="button" onClick={() => setConfirming('')} disabled={busy} className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-slate-700 transition hover:bg-slate-50 disabled:opacity-50" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                        Keep
                      </button>
                    </div>
                  </div>
                )}
                {rowError[id] && <p role="alert" className="mt-1 text-[11px] font-medium leading-4 text-red-600">{rowError[id]}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex min-w-0 flex-col gap-1.5">
          {files.map((file, index) => {
            const state = uploadState[fileKey(type.key, file)] || { status: 'uploading' }
            const failed = state.status === 'failed'
            return (
            <li key={fileKey(type.key, file)} className={`min-w-0 overflow-hidden rounded-lg border px-2.5 py-1.5 ${failed ? 'border-red-200 bg-red-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
             <div className="flex items-center gap-2">
              <FileText size={16} className={`shrink-0 ${failed ? 'text-red-600' : 'text-emerald-700'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 basis-0 overflow-hidden">
                {onPreview
                  ? <button type="button" onClick={() => onPreview(newDocumentId(type.key, index))} className="block max-w-full truncate text-left font-bold text-navy-900 hover:text-brand-700 hover:underline" style={FILE_NAME_STYLE} title={file.name}>{file.name}</button>
                  : <span className="block truncate font-bold text-navy-900" style={FILE_NAME_STYLE} title={file.name}>{file.name}</span>}
              </span>
              {failed
                ? <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Not uploaded</span>
                : <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-600" role="status"><Loader /> Uploading…</span>}
              {onPreview && (
                <button type="button" onClick={() => onPreview(newDocumentId(type.key, index))} aria-label={`Preview ${file.name}`} title="Preview" className="grid size-6 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-emerald-100 hover:text-brand-700">
                  <Eye size={14} />
                </button>
              )}
              {!failed && state.status === 'uploading' ? null : (
              <button
                type="button"
                onClick={() => remove(file)}
                aria-label={`Remove ${file.name}`}
                title="Remove"
                className="grid size-6 shrink-0 place-items-center rounded-md text-red-500 transition hover:bg-red-50"
              >
                <X size={14} />
              </button>
              )}
             </div>
             {failed && (
              <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                <p role="alert" className="min-w-0 flex-1 text-[11px] font-medium leading-4 text-red-700">{state.error}</p>
                <button type="button" onClick={() => onRetry(type.key, file)} className="inline-flex h-7 shrink-0 items-center rounded-md border border-red-200 bg-white px-2.5 text-red-700 transition hover:bg-red-50" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Retry</button>
              </div>
             )}
            </li>
            )
          })}
        </ul>
      )}

      {(!full || type.max === 1) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files) }}
          aria-label={`${files.length === 0 && existing.length === 0 ? 'Upload' : multiple ? 'Add another file to' : 'Replace'} ${type.label}`}
          className={`mt-auto flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-xs font-bold transition ${dragActive ? 'border-brand-500 bg-[#eef2fb] text-brand-700' : 'border-[#c2cdda] bg-[#fbfcfe] text-brand-600 hover:border-[#b3c3e4] hover:bg-[#eef2fb]/40'}`}
        >
          <UploadCloud size={16} aria-hidden="true" />
          {files.length === 0 && existing.length === 0 ? 'Click or drag a file' : multiple ? 'Add another file' : 'Replace file'}
        </button>
      )}

      {problem && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[11px] font-medium leading-4 text-red-600">
          <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" /> {problem}
        </p>
      )}
      <FlagNote flag={flag} onConfirm={onConfirm} onUnconfirm={onUnconfirm} />
    </div>
  )
}

// Optional supporting documents for the onboarding request: PAN, Aadhaar, GST certificate, bank proof, CIN, and others.
// `documents` is { [typeKey]: File[] } and lives in the page, so it survives moving between steps. `existing` is what is
// already uploaded ({ [typeKey]: [{ original_name, blob_name }] }); a new file replaces it, and `onDeleteExisting(type, file)` removes one. `flags` are the documents a returned
// application was flagged for, each with its status.
// Buttons take the page's inherited font size (a global rule beats the Tailwind size class), so the file name's size is set here.
const FILE_NAME_STYLE = { fontSize: '0.75rem', lineHeight: '1rem' }

export default function SupportingDocuments({ documents, onPick, onRemovePicked, onRetry, uploadState = {}, uploading = false, existing = {}, onDeleteExisting, onPreview, flags = {}, onConfirm, onUnconfirm }) {
  return (
    <FormSection
      icon={Paperclip}
      title="Upload supporting documents"
      description="Attach documents that support the details above. PDF, JPG or PNG, up to 5 MB each. Files upload as soon as you pick them. A new file replaces the one uploaded, or remove it with the x."
    >
      {uploading && <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600" role="status"><Loader /> Uploading documents…</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        {documentTypes.map((type) => (
          <DocumentSlot
            key={type.key}
            type={type}
            files={documents[type.key] || []}
            onPick={onPick}
            onRemovePicked={onRemovePicked}
            onRetry={onRetry}
            uploadState={uploadState}
            existing={existing[type.key] || []}
            onDeleteExisting={onDeleteExisting}
            onPreview={onPreview}
            flag={flags[type.key]}
            onConfirm={() => onConfirm?.(type.key)}
            onUnconfirm={() => onUnconfirm?.(type.key)}
          />
        ))}
      </div>
    </FormSection>
  )
}
