import { useState } from 'react'
import { ArrowRight, CheckSquare, Download, ExternalLink, FileText, KeyRound, MessageSquareWarning, PenLine } from 'lucide-react'
import Button from '../common/Button'
import Loader from '../common/Loader'
import useAgreementPdf from './useAgreementPdf'
import { SMALL_BUTTON, keyTermTiles, pdfReadSrc } from './agreementUtils'
import { downloadAgreement } from '../../api/vendorApi'

// The compact actions of the file card: rounded rectangles, not pills.
const ACTION = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-700 transition hover:border-[#b3c3e4] hover:bg-[#eef2fb] hover:text-[#0046dc] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-slate-50 disabled:hover:text-slate-700'
const ACTION_FONT = { fontSize: '13px', fontWeight: 500, lineHeight: '1.25rem' }

const NEXT = [
  { icon: CheckSquare, text: 'Tick the box once you have read it' },
  { icon: PenLine, text: 'Continue to the signature page: choose a drawn, typed or uploaded signature' },
  { icon: KeyRound, text: 'Confirm with the one-time code sent to your email' },
]

// "Read the agreement": the document fills the screen; a slim side panel (a stacked bar on phones) holds the key terms,
// the open / download actions and the "I have read" checkbox with Back and Continue.
export default function AgreementReadStep({ agreement, readOk, onReadChange, onBack, onContinue, onDecline = null }) {
  const { url, error, pages, retry } = useAgreementPdf(agreement.agreement_id)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const tiles = keyTermTiles(agreement)

  const download = async () => {
    setDownloading(true)
    setDownloadError('')
    try { await downloadAgreement(agreement.agreement_id, agreement.agreement_no) } catch (err) { setDownloadError(err.message || 'Unable to download the agreement.') } finally { setDownloading(false) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-3 lg:col-start-1 lg:row-start-1">
        <div>
          <p className="eyebrow">Read the agreement</p>
          <h2 className="mt-1 text-lg font-extrabold leading-tight text-navy-950">{agreement.agreement_no}</h2>
          <p className="text-xs font-semibold text-slate-500">Version {agreement.version}{pages ? ` · ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''}</p>
        </div>

        <section aria-label="Key terms at a glance">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Key terms at a glance</p>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {tiles.map(([name, value]) => (
              <li key={name} className="shrink-0 rounded-lg border border-[#d8e0e9] bg-[#f7f9fc] px-3 py-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">{name}</p>
                <p className="whitespace-nowrap text-[13px] font-bold text-navy-900">{value}</p>
              </li>
            ))}
          </ul>
          <dl className="hidden divide-y divide-slate-100 overflow-hidden rounded-lg border border-[#d8e0e9] bg-white lg:block">
            {tiles.map(([name, value]) => (
              <div key={name} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">{name}</dt>
                <dd className="whitespace-nowrap text-right text-[13px] font-bold text-navy-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Agreement file">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#eef2fb] text-blue-600"><FileText size={20} /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy-900">Customer Services Agreement</p>
              <p className="truncate text-xs text-slate-500">{agreement.agreement_no} · Version {agreement.version}{pages ? ` · ${pages} ${pages === 1 ? 'page' : 'pages'}` : ''} · PDF</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-2.5">
            <button
              type="button"
              title="Open in a new tab"
              aria-label="Open in a new tab"
              disabled={!url}
              onClick={() => window.open(url, '_blank', 'noopener')}
              className={ACTION}
              style={ACTION_FONT}
            >
              <ExternalLink size={16} /> Open
            </button>
            <button
              type="button"
              title="Download PDF"
              aria-label="Download PDF"
              disabled={downloading || !url}
              onClick={download}
              className={ACTION}
              style={ACTION_FONT}
            >
              {downloading ? <Loader /> : <Download size={16} />} Download
            </button>
          </div>
        </section>
        {downloadError && <p role="alert" className="text-xs font-medium text-red-600">{downloadError}</p>}

        <section className="hidden lg:block" aria-label="What happens next">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">What happens next</p>
          <ol className="space-y-2">
            {NEXT.map(({ icon: Icon, text }, index) => (
              <li key={text} className="flex items-start gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon size={13} /></span>
                <span className="text-xs leading-5 text-slate-600"><b className="mr-1 font-bold text-slate-500">{index + 1}.</b>{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      {/* A grey desk with the agreement as a centred sheet of paper, so a page is shown at a normal reading size. */}
      <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-lg bg-slate-200 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-[560px]">
        <p className="shrink-0 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-500">{pages ? `Scroll to read all ${pages} pages` : 'Scroll to read the whole agreement'}</p>
        <div className="flex min-h-0 flex-1 justify-center px-0 pb-3 sm:px-3">
          <div className="relative h-full min-h-[60vh] w-[min(100%,820px)] overflow-hidden rounded-md bg-white shadow-[0_2px_10px_rgba(16,42,76,0.18)] lg:min-h-0">
            {url && <iframe src={pdfReadSrc(url)} title={`Agreement ${agreement.agreement_no}`} className="absolute inset-0 size-full border-0" />}
            {!url && !error && <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600"><Loader /> Loading the agreement…</div>}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <FileText size={28} className="text-slate-400" />
                <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
                <Button variant="secondary" className={SMALL_BUTTON} onClick={retry}>Try again</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:col-start-1 lg:row-start-2 lg:mx-0 lg:self-start [@media(min-height:820px)]:lg:self-end lg:border-0 lg:p-0">
        <div className="rounded-xl border border-[#d8e0e9] bg-[#f7f9fc] p-3 lg:shadow-sm">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#d8e0e9] bg-white px-3 py-2.5 transition hover:border-slate-300">
            <input type="checkbox" className="size-4.5 shrink-0 accent-brand-600" checked={readOk} onChange={(event) => onReadChange(event.target.checked)} />
            <span className="text-[13px] font-semibold leading-5 text-navy-900">I have read the agreement</span>
          </label>
          <p className="mb-3 mt-2 hidden px-1 text-[11px] leading-4 text-slate-500 lg:block">Continue takes you to the signature step. Nothing is signed yet.</p>
          <div className="mt-3 flex items-center gap-2 lg:mt-0">
            {onBack && <Button variant="secondary" className={SMALL_BUTTON} onClick={onBack}>Back</Button>}
            <Button className={`${SMALL_BUTTON} flex-1 justify-center`} onClick={onContinue} disabled={!readOk}>
              Continue <ArrowRight size={15} aria-hidden="true" />
            </Button>
          </div>
          {onDecline && (
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 border-t border-[#d8e0e9] pt-2.5 text-center text-[11.5px] leading-5 text-slate-500">
              Not able to agree to these terms?
              <button type="button" onClick={onDecline} className="inline-flex items-center gap-1 rounded-md px-1 text-[11.5px]! font-bold! text-red-700 underline-offset-2 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30">
                <MessageSquareWarning size={13} aria-hidden="true" /> Decline agreement
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
