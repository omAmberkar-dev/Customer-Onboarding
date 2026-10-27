import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, FileText, PenLine } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import { previewSignedAgreement } from '../../api/vendorApi'
import { SMALL_BUTTON } from './agreementUtils'

const pageCount = async (pdf) => {
  try {
    const text = new TextDecoder('latin1').decode(await pdf.arrayBuffer())
    return (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length || null
  } catch { return null }
}

const PILL_BUTTON = 'inline-flex h-7! min-h-0! items-center gap-1.5 rounded-full border border-[#b3c3e4] bg-white px-2.5! py-0! text-[11px]! font-semibold! leading-none! text-brand-700 transition hover:border-brand-600 hover:bg-[#eef2fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-not-allowed disabled:opacity-50'

const src = ({ url, page }) => `${url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH&page=${page}`

// The agreement as it will look once signed: the real PDF, rebuilt by the server from what the vendor has filled in
// (`payload`: signer_name, signer_designation, method, signature). It refreshes shortly after each change. A new copy
// loads behind the one on screen and swaps in when ready, so the page does not flash. The live preview opens on the page with
// the signatures (with a button to get back to it); `final` is the review before signing: it adds the signing certificate page,
// opens at the top so the vendor reads it all, and offers the file to open or download.
export default function SignedPreviewPane({ agreementId, payload, final = false, debounceMs = 600, label = 'Live preview', hint = '', fileName = 'agreement-preview.pdf' }) {
  const [shown, setShown] = useState(null)      // { url, page } on screen
  const [incoming, setIncoming] = useState(null) // the next copy, loading behind
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [jump, setJump] = useState(0) // bumped to reopen the page with the signatures
  const urls = useRef({ shown: '', incoming: '' })
  const key = JSON.stringify({ ...payload, final })

  useEffect(() => {
    let ignore = false
    setError('')
    const timer = setTimeout(async () => {
      try {
        const blob = await previewSignedAgreement(agreementId, JSON.parse(key))
        const pdf = new Blob([blob], { type: 'application/pdf' })
        const pages = await pageCount(pdf)
        if (ignore) return
        const url = URL.createObjectURL(pdf)
        if (urls.current.incoming) URL.revokeObjectURL(urls.current.incoming)
        urls.current.incoming = url
        setIncoming({ url, page: final ? 1 : pages || 1 })
      } catch (err) {
        if (!ignore) setError(err.message || 'Unable to load the preview.')
      }
    }, debounceMs)
    return () => { ignore = true; clearTimeout(timer) }
  }, [agreementId, key, attempt, debounceMs, final])

  useEffect(() => () => {
    if (urls.current.shown) URL.revokeObjectURL(urls.current.shown)
    if (urls.current.incoming) URL.revokeObjectURL(urls.current.incoming)
  }, [])

  const swap = () => {
    if (urls.current.shown) URL.revokeObjectURL(urls.current.shown)
    urls.current.shown = urls.current.incoming
    urls.current.incoming = ''
    setShown(incoming)
    setIncoming(null)
  }

  const updating = !error && (incoming || !shown)
  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-[#b3c3e4]/80 bg-[#f1f4f8]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#b3c3e4]/80 bg-[#eef2fb] px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-[#dce6ff]"><FileText size={16} /></span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-4 text-navy-900">{label}</p>
            {hint && <p className="truncate text-[11px] leading-4 text-slate-500">{hint}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {final ? (
            <>
              <button type="button" onClick={() => shown && window.open(shown.url, '_blank', 'noopener')} disabled={!shown} className={PILL_BUTTON}>
                <ExternalLink size={12} aria-hidden="true" /> Open
              </button>
              <a
                href={shown?.url || undefined}
                download={fileName}
                aria-disabled={!shown}
                className={`${PILL_BUTTON} ${shown ? '' : 'pointer-events-none opacity-50'}`}
              >
                <Download size={12} aria-hidden="true" /> Download
              </a>
            </>
          ) : (
            <button type="button" onClick={() => setJump((count) => count + 1)} disabled={!shown} className={PILL_BUTTON}>
              <PenLine size={12} aria-hidden="true" /> Go to signatures
            </button>
          )}
          <span role="status" className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${updating ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {updating ? <><Loader /> Updating…</> : <><CheckCircle2 size={12} aria-hidden="true" /> Up to date</>}
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center px-0 py-3 sm:px-3">
        <div className="relative h-full w-[min(100%,820px)] overflow-hidden rounded-md bg-white shadow-[0_2px_10px_rgba(16,42,76,0.18)]">
          {shown && <iframe key={`${shown.url}-${jump}`} src={src(shown)} title="Signed agreement preview" className="absolute inset-0 size-full border-0" />}
          {incoming && <iframe key={incoming.url} src={src(incoming)} title="Updated agreement preview" className="invisible absolute inset-0 size-full border-0" onLoad={swap} />}
          {!shown && !error && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600"><Loader /> Preparing the preview…</div>}
          {error && !shown && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <FileText size={28} className="text-slate-400" />
              <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
              <Button variant="secondary" className={SMALL_BUTTON} onClick={() => setAttempt((count) => count + 1)}>Try again</Button>
            </div>
          )}
          {error && shown && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-red-50 px-3 py-2">
              <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>
              <Button variant="secondary" className={SMALL_BUTTON} onClick={() => setAttempt((count) => count + 1)}>Try again</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
