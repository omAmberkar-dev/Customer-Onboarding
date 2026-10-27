import { useRef, useState } from 'react'
import { AlertCircle, Paperclip, UploadCloud, X } from 'lucide-react'
import { formatFileSize } from '../../utils/formatters'

const MAX_SIZE = 10 * 1024 * 1024

export default function InvoiceUploader({ onFiles, error, onDismissError }) {
  const inputRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [validationError, setValidationError] = useState('')

  const addToQueue = (fileList) => {
    const files = Array.from(fileList || [])
    const valid = files.filter((file) => (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) && file.size <= MAX_SIZE)
    if (valid.length) {
      setQueue((current) => [
        ...current,
        ...valid.map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file })),
      ])
    }
    setValidationError(valid.length !== files.length ? 'Some files were skipped. Only PDF files up to 10MB are accepted.' : '')
  }

  const handleUpload = () => {
    if (!queue.length) return
    onFiles(queue.map((item) => item.file))
    setQueue([])
  }

  return (
    <section className="rounded-xl border border-[#d8e0e9] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(40,83,130,0.04)] sm:px-6">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="size-1 rounded-full bg-[#0046dc]" />
          <h1 className="text-[12px] font-extrabold uppercase tracking-[0.055em] text-[#5f5f5f]">Invoice Upload</h1>
          <span className="grid min-w-5 place-items-center rounded-full bg-[#f1f4f8] px-1.5 py-0.5 text-[11px] font-bold text-[#0046dc]">{queue.length}</span>
        </div>
        {/* index.css sets `font: inherit` on buttons, so size/weight come from this wrapper. */}
        <div className="flex items-center gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!queue.length}
            className="inline-flex h-8 items-center gap-2 rounded-lg bg-[#0046dc] px-3.5 text-xs font-bold text-white transition hover:bg-[#052e86] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <UploadCloud size={14} /> Upload All {queue.length}
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#2566ff] bg-white px-3.5 text-xs font-bold text-[#0046dc] transition hover:bg-[#eef2fb]"
          >
            <Paperclip size={14} /> Add Invoices
          </button>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(event) => { addToQueue(event.target.files); event.target.value = '' }} />

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); addToQueue(event.dataTransfer.files) }}
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center transition ${dragActive ? 'border-brand-500 bg-[#eef2fb]' : 'border-[#d8e0e9] bg-[#fbfcfe] hover:border-[#b3c3e4] hover:bg-[#eef2fb]/40'}`}
      >
        <UploadCloud size={22} className="text-[#8a94a6]" />
        <p className="text-[13px] font-bold text-[#474747]">Click or drag PDF files here</p>
        <p className="text-[11px] text-[#5f5f5f]">PDF only — max 10MB per file</p>
      </div>

      {queue.length > 0 && (
        <div className="mt-3 grid gap-2">
          {queue.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#d8e0e9] bg-white px-4 py-2.5">
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-[#000000]">{item.file.name}</p>
              <span className="shrink-0 text-xs font-medium text-[#5f5f5f]">{formatFileSize(item.file.size)}</span>
              <button type="button" onClick={() => setQueue((current) => current.filter((file) => file.id !== item.id))} aria-label={`Remove ${item.file.name}`} className="grid size-6 shrink-0 place-items-center rounded-md text-red-500 transition hover:bg-red-50"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {(error || validationError) && (
        <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <span className="flex items-center gap-2"><AlertCircle size={14} /> {error || validationError}</span>
          <button type="button" onClick={() => { setValidationError(''); onDismissError?.() }}><span className="font-bold">Dismiss</span></button>
        </div>
      )}
    </section>
  )
}
