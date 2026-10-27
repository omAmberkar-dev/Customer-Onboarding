import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileImage, FileText, FolderOpen } from 'lucide-react'
import Loader from '../common/Loader'
import { fetchMyDocumentBlob, getMyDocuments } from '../../api/vendorApi'
import { documentPreviewItems, isImageName } from '../../utils/documentPreview'
import { formatFileSize } from '../../utils/formatters'

const LINK_XS_BOLD = { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 600 }

// The supporting documents the vendor uploaded (PAN, Aadhaar, GSTIN, bank proof, CIN, other), in the vendor record popup: a list on the left
// and the selected one previewed on the right. Issued agreements are not listed here; they have their own Agreement page.
export default function VendorDocumentsTab() {
  const [documents, setDocuments] = useState(null)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    let ignore = false
    getMyDocuments()
      .then((grouped) => { if (!ignore) setDocuments(grouped) })
      .catch(() => { if (!ignore) setFailed(true) })
    return () => { ignore = true }
  }, [])

  const items = useMemo(() => documentPreviewItems({}, documents || {}).filter((item) => item.blobName), [documents])
  const selected = items.find((item) => item.id === selectedId) ?? items[0]

  if (failed) return <Message icon={<FolderOpen size={26} />} title="Could not load supporting documents" detail="Please close this window and try again." />
  if (documents === null) return <Message icon={<Loader />} title="Loading supporting documents…" />
  if (items.length === 0) return <Message icon={<FolderOpen size={26} />} title="No supporting documents uploaded" detail="No documents were attached to your application." />

  return (
    <div className="grid h-full gap-3.5 md:grid-cols-[260px_minmax(0,1fr)]">
      <ul className="flex max-h-40 min-h-0 flex-col gap-2 overflow-y-auto md:max-h-none">
        {items.map((item) => {
          const active = item.id === selected?.id
          const Icon = isImageName(item.name) ? FileImage : FileText
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${active ? 'border-[#052e86] bg-[#f1f4f8]' : 'border-[#d8e0e9] bg-white hover:bg-[#f7f9fc]'}`}
              >
                <Icon size={16} className={`mt-0.5 shrink-0 ${active ? 'text-[#052e86]' : 'text-[#5f5f5f]'}`} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[#000000]">{item.typeLabel}</span>
                  <span className="block truncate text-xs text-[#5f5f5f]" title={item.name}>{item.name}</span>
                  {item.size ? <span className="block text-[11px] text-[#5f5f5f]">{formatFileSize(item.size)}</span> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {selected && <Preview key={selected.id} item={selected} />}
    </div>
  )
}

function Preview({ item }) {
  const [state, setState] = useState({ url: '', error: '', loading: true })

  useEffect(() => {
    let ignore = false
    let created = ''
    fetchMyDocumentBlob(item.blobName)
      .then((blob) => {
        if (ignore) return
        created = URL.createObjectURL(blob)
        setState({ url: created, error: '', loading: false })
      })
      .catch((err) => { if (!ignore) setState({ url: '', error: err?.message || 'Preview unavailable', loading: false }) })
    return () => {
      ignore = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [item.blobName])

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#d8e0e9]">
      <div className="flex items-center justify-between gap-3 border-b border-[#d8e0e9] px-3.5 py-2.5">
        <p className="min-w-0 truncate text-[13px] font-semibold text-[#000000]">{item.typeLabel} — {item.name}</p>
        {state.url && (
          <a href={state.url} target="_blank" rel="noreferrer" style={LINK_XS_BOLD} className="inline-flex shrink-0 items-center gap-1.5 text-[#052e86] hover:underline">
            <ExternalLink size={13} /> Open in new tab
          </a>
        )}
      </div>
      <div className="flex min-h-[260px] flex-1 items-center justify-center bg-[#f7f9fc]">
        {state.loading ? <Loader /> : state.error ? (
          <p className="px-6 text-center text-xs text-[#5f5f5f]">{state.error}</p>
        ) : isImageName(item.name) ? (
          <img src={state.url} alt={item.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <iframe src={state.url} title={item.name} className="size-full min-h-[340px] border-0 bg-white" />
        )}
      </div>
    </div>
  )
}

function Message({ icon, title, detail }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 px-6 text-center text-[#5f5f5f]">
      {icon}
      <p className="text-[13px] font-semibold text-[#000000]">{title}</p>
      {detail && <p className="max-w-xs text-xs">{detail}</p>}
    </div>
  )
}
