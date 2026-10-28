import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import AgreementPdfViewer from '../agreement/AgreementPdfViewer'
import { downloadLoanDocument, fetchLoanDocumentUrl } from '../../api/vendorApi'

// One loan document (Sanction Memo, Drawdown Memo or invoice) in the agreement PDF viewer: full screen on a phone, a
// large dialog from tablet up. Phones that cannot show a PDF inline still get Open and Download above it.
export default function LoanDocumentDialog({ document: doc, onClose }) {
  useEffect(() => {
    if (!doc) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.document.addEventListener('keydown', onKey)
    return () => window.document.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  const source = useMemo(() => doc && {
    key: `${doc.kind}/${doc.id}`,
    label: [doc.title, doc.subtitle].filter(Boolean).join(' · '),
    load: () => fetchLoanDocumentUrl(doc.kind, doc.id),
    download: () => downloadLoanDocument(doc.kind, doc.id, doc.fileName),
  }, [doc])

  if (!doc) return null
  return createPortal(
    <div className="fixed inset-0 z-50 grid bg-navy-950/55 backdrop-blur-[2px] sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-full sm:max-w-4xl sm:rounded-xl sm:border sm:border-slate-200" role="dialog" aria-modal="true" aria-labelledby="loan-document-title">
        <header className="flex items-center justify-between gap-3 border-b border-[#b3c3e4] bg-[#eef2fb] px-4 py-2 sm:px-5 sm:py-3">
          <div className="min-w-0">
            <p className="eyebrow">My loans</p>
            <h2 id="loan-document-title" className="mt-0.5 truncate text-base font-extrabold text-navy-950">{doc.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="interactive-icon" aria-label="Close document"><X size={20} /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
          <AgreementPdfViewer source={source} buttonClassName="min-h-11! px-4! text-[13px]!" className="min-h-[60svh] flex-1 p-2! sm:h-[70vh] sm:p-4!" />
        </div>
      </div>
    </div>,
    window.document.body,
  )
}
