import { useEffect, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import { downloadAgreement, fetchAgreementPdfUrl } from '../../api/vendorApi'
import { SMALL_BUTTON, pdfSrc } from './agreementUtils'

// The agreement PDF in an iframe. The PDF needs the vendor's token, so it is fetched and shown through a blob: URL.
// `source` shows another PDF behind the token the same way (a loan document on My loans): { key, label, load() -> blob:
// URL, download() }. `buttonClassName` sizes the toolbar's buttons (full-size tap targets on a phone).
export default function AgreementPdfViewer({ agreementId, agreementNo, className = 'min-h-[420px] flex-1', showToolbar = true, source = null, buttonClassName = SMALL_BUTTON }) {
  const label = source ? source.label : agreementNo ? `Agreement ${agreementNo}` : 'Agreement'
  const what = source ? 'the document' : 'the agreement'
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let ignore = false
    let created = ''
    setUrl('')
    setError('')
    const loading = source ? source.load() : fetchAgreementPdfUrl(agreementId)
    loading
      .then((blobUrl) => {
        if (ignore) URL.revokeObjectURL(blobUrl)
        else { created = blobUrl; setUrl(blobUrl) }
      })
      .catch((err) => { if (!ignore) setError(err.message || `Unable to load ${what}.`) })
    return () => {
      ignore = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [source ? source.key : agreementId, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setDownloading(true)
    try { await (source ? source.download() : downloadAgreement(agreementId, agreementNo)) } catch (err) { setError(err.message || `Unable to download ${what}.`) } finally { setDownloading(false) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-xs font-semibold text-slate-600">{label}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className={buttonClassName} disabled={!url} onClick={() => window.open(url, '_blank', 'noopener')}><ExternalLink size={15} /> Open in a new tab</Button>
            <Button variant="secondary" className={buttonClassName} disabled={downloading} onClick={download}>{downloading ? <Loader /> : <Download size={15} />} Download</Button>
          </div>
        </div>
      )}
      {/* The stage keeps the PDF off the edges of its card, dialog, header strip and footer. */}
      <div className={`flex flex-col rounded-lg bg-[#f1f4f8] p-4 ${className}`}>
        <div className="relative mx-auto min-h-0 w-full max-w-[820px] flex-1 overflow-hidden rounded-[10px] border border-[#c2cdda] bg-white shadow-[0_1px_3px_rgba(16,42,76,0.12)]">
          {url && <iframe src={pdfSrc(url)} title={label} className="absolute inset-0 size-full border-0" />}
          {!url && !error && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600"><Loader /> Loading {what}…</div>}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
              <Button variant="secondary" className={buttonClassName} onClick={() => setAttempt((count) => count + 1)}>Try again</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
