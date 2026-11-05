import { AlertTriangle, ArrowRight, Check, ChevronRight, CircleDashed } from 'lucide-react'
import { FORM_FIELD_BY_KEY, isDocumentKey } from '../../utils/rejectionFields'

const formatDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// "the maker" / "the checker", as LAS records who returned it; "our team" when it does not say.
const byWhom = (role) => {
  const name = String(role ?? '').trim().toLowerCase()
  return name ? `the ${name}` : 'our team'
}

const reasonText = (label, remark) => (remark ? `${label}: ${remark}` : label)

// What one return said, on one line: who returned it, when, and in which round.
const returnedLine = (entry) => [
  `Returned by ${byWhom(entry.rejected_by_role)}${formatDate(entry.rejected_at) ? ` on ${formatDate(entry.rejected_at)}` : ''}`,
  entry.round_no ? `Round ${entry.round_no}` : '',
].filter(Boolean).join(' · ')

// Past returns that were corrected and resubmitted (newest first), collapsed under one line so they never push the form down.
function EarlierCorrections({ history }) {
  const sorted = [...history].sort((a, b) => String(b.rejected_at ?? '').localeCompare(String(a.rejected_at ?? '')))
  return (
    <details className="vr-history">
      <summary><ChevronRight size={14} aria-hidden="true" /> Earlier corrections ({history.length})</summary>
      <ol>
        {sorted.map((entry, index) => (
          <li key={entry.rejection_id ?? `${entry.round_no}-${index}`}>
            <b>{returnedLine(entry)}</b>
            {formatDate(entry.resubmitted_at) && <span>Resubmitted on {formatDate(entry.resubmitted_at)}</span>}
            {entry.overall_remark && <span>“{entry.overall_remark}”</span>}
            {entry.items?.length > 0 && (
              <ul>
                {entry.items.map((item, itemIndex) => (
                  <li key={item.item_id ?? itemIndex}>{item.field_label ? `${item.field_label} — ` : ''}{reasonText(item.reason_label, item.remark)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  )
}

// Shown on every step of a returned application, in LAS's return-note look: "Correction Required", who returned it, their
// remark and every item they raised. `items` is [{ key, label, reasons, status, step }] for the flagged fields and documents;
// `onGo` jumps to one (changing step if needed). A reason that names no field ("Other") is listed with nothing to jump to.
// `history` is the earlier returns (correction_history), shown collapsed when there are any.
export default function ReturnedBanner({ rejection, items, onGo, history = [] }) {
  const open = items.filter((item) => item.status === 'open').length
  const general = (rejection.items || []).filter((item) => !isDocumentKey(item.field_key) && !FORM_FIELD_BY_KEY[item.field_key])

  return (
    <section role="region" aria-label="Correction required" className="vr-return">
      <div className="vr-return-top">
        <h2><AlertTriangle size={16} aria-hidden="true" /> Correction Required</h2>
        <span className="vr-return-meta">{returnedLine(rejection)}</span>
      </div>
      {rejection.overall_remark && (
        <p className="vr-return-remark"><b>Remark from {byWhom(rejection.rejected_by_role)}</b>{rejection.overall_remark}</p>
      )}
      {items.length + general.length > 0 && (
        <ul className="vr-return-items" aria-label="Items to correct">
          {items.map((item) => (
            <li key={item.key} className={item.status === 'open' ? 'open' : 'done'}>
              {item.status === 'open' ? <CircleDashed size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              <span className="vr-return-text">
                <strong>{item.label}</strong>
                <small>{item.reasons.map((reason) => reasonText(reason.label, reason.remark)).join('; ')}</small>
              </span>
              <button type="button" onClick={() => onGo(item)} className="vr-return-go" aria-label={`${item.status === 'open' ? 'Fix' : 'View'} ${item.label}`}>
                {item.status === 'open' ? 'Fix' : 'View'} <ArrowRight size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
          {general.map((item, index) => (
            <li key={item.item_id ?? `general-${index}`} className="open">
              <CircleDashed size={14} aria-hidden="true" />
              <span className="vr-return-text">
                <strong>{item.field_label || 'General'}</strong>
                <small>{reasonText(item.reason_label, item.remark)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <p className="vr-return-count" role="status">
          {open === 0
            ? 'Everything is handled: review and resubmit.'
            : `${open} of ${items.length} still to fix. Update each one, or confirm it is correct as entered, then resubmit for review.`}
        </p>
      )}
      {history.length > 0 && <EarlierCorrections history={history} />}
    </section>
  )
}
