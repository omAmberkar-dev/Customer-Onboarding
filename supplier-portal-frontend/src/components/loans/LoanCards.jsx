import { useState } from 'react'
import { Download, Eye } from 'lucide-react'
import Loader from '../common/Loader'
import { downloadLoanDocument } from '../../api/vendorApi'
import { DOCUMENTS, formatLoanDate, formatMoney, formatRate, statusTone } from '../../utils/loans'

const ACTION = 'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg! border px-3 text-[13px]! font-semibold! transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none'

// The card's PDF: View opens it in the viewer, Download saves it straight away.
function DocumentActions({ doc, onView }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const download = async () => {
    setBusy(true)
    setError('')
    try { await downloadLoanDocument(doc.kind, doc.id, doc.fileName) } catch (err) { setError(err.message || 'Unable to download the document.') } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 border-t border-[#eef0f3] pt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onView(doc)} className={`${ACTION} border-brand-600 bg-brand-600 text-white hover:border-brand-700 hover:bg-brand-700`}><Eye size={16} /> View<span className="sr-only"> {doc.title}</span></button>
        <button type="button" onClick={download} disabled={busy} className={`${ACTION} border-[#c2cdda] bg-white text-navy-900 hover:border-brand-600 hover:bg-[#eef2fb] hover:text-brand-700`} aria-label={`Download ${doc.title}`}>{busy ? <Loader /> : <Download size={16} />} Download</button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  )
}

// One sanction, drawdown or invoice: its title and status, its facts as label / value pairs, and its PDF when issued.
function LoanCard({ eyebrow, title, status, statusLabel, facts, doc, onView }) {
  return (
    <article className="min-w-0 rounded-xl border border-[#d8e0e9] bg-white p-4 shadow-[0_4px_16px_rgba(40,83,130,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{eyebrow}</p>
          <h3 className="mt-0.5 break-words text-[15px] font-extrabold text-navy-950">{title}</h3>
        </div>
        {statusLabel && <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone(status)}`}>{statusLabel}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {facts.filter(([, value]) => value && value !== '—').map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">{term}</dt>
            <dd className="break-words text-[13px] font-semibold text-navy-900">{value}</dd>
          </div>
        ))}
      </dl>
      {doc && <DocumentActions doc={doc} onView={onView} />}
    </article>
  )
}

export function SanctionCard({ sanction: s, onView }) {
  return (
    <LoanCard
      eyebrow={s.product || 'Loan against securities'}
      title={s.sanctionNo ? `Sanction ${s.sanctionNo}` : `Application ${s.requestNo}`}
      status={s.status}
      statusLabel={s.statusLabel}
      facts={[
        [s.status === 'approved' ? 'Sanctioned limit' : 'Amount applied for', formatMoney(s.limit, s.currency)],
        ['Applied on', formatLoanDate(s.appliedOn)],
        ['Valid from', formatLoanDate(s.startDate)],
        ['Valid until', formatLoanDate(s.endDate)],
        [s.status === 'approved' ? 'Approved on' : 'Decided on', s.status === 'under_review' ? '' : formatLoanDate(s.decidedOn)],
      ]}
      doc={s.hasDocument ? DOCUMENTS.sanction(s) : null}
      onView={onView}
    />
  )
}

export function DrawdownCard({ drawdown: d, onView }) {
  return (
    <LoanCard
      eyebrow={d.sanctionNo ? `Under sanction ${d.sanctionNo}` : 'Drawdown'}
      title={d.drawdownNo ? `Drawdown ${d.drawdownNo}` : `Drawdown request ${d.requestNo}`}
      status={d.status}
      statusLabel={d.statusLabel}
      facts={[
        ['Amount', formatMoney(d.amount, d.currency)],
        ['Requested on', formatLoanDate(d.requestedOn)],
        ['Interest rate', formatRate(d.rate)],
        ['Interest paid', d.frequency || ''],
        ['From', formatLoanDate(d.startDate)],
        ['Repay by', formatLoanDate(d.endDate)],
      ]}
      doc={d.hasDocument ? DOCUMENTS.drawdown(d) : null}
      onView={onView}
    />
  )
}

export function InvoiceCard({ invoice: i, onView }) {
  return (
    <LoanCard
      eyebrow={i.kind === 'Dues' ? 'Interest and repayment' : 'Charges'}
      title={i.title}
      facts={[
        ['Amount', formatMoney(i.amount, i.currency)],
        ['Due date', formatLoanDate(i.dueDate)],
        ['Drawdown', i.drawdownNo],
        ['Sanction', i.sanctionNo],
      ]}
      doc={i.hasDocument ? DOCUMENTS.invoice(i) : null}
      onView={onView}
    />
  )
}
