// Small helpers shared by the agreement screens.
export const formatDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export const formatPeriod = (agreement) => (agreement?.start_iso && agreement?.end_iso ? `${formatDate(agreement.start_iso)} - ${formatDate(agreement.end_iso)}` : '—')

// Whole days from today until the agreement's end date (negative once it has ended); null when there is no end date.
export const daysLeft = (agreement) => {
  const end = agreement?.end_iso ? new Date(agreement.end_iso) : null
  if (!end || Number.isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}

export const STATE_BADGES = {
  active: ['Active', 'border-emerald-200 bg-emerald-50 text-emerald-700'],
  awaiting: ['Awaiting your signature', 'border-[#b3c3e4] bg-[#eef2fb] text-[#052e86]'],
  scheduled: ['Scheduled', 'border-slate-300 bg-[#f1f4f8] text-[#474747]'],
  expired: ['Expired', 'border-amber-200 bg-amber-50 text-amber-800'],
  replaced: ['Replaced', 'border-slate-200 bg-slate-100 text-slate-600'],
  declined: ['Declined', 'border-red-200 bg-red-50 text-red-700'],
  corrections: ['Corrections requested', 'border-amber-200 bg-amber-50 text-amber-800'],
}

// Compact button sizing used across the agreement screens (Button's own size is larger; the global button font
// reset means text size must be forced with !important).
export const SMALL_BUTTON = 'min-h-9! px-4! py-1.5! text-[13px]!'
export const CHECK_ROW = 'flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#d8e0e9] bg-[#f7f9fc] px-3 py-2.5 transition hover:border-slate-300'

// Hide the PDF viewer's thumbnail sidebar and fit the page to the viewer width (same trick as the invoice compare view).
export const pdfSrc = (url) => (url ? `${url.split('#')[0]}#navpanes=0&pagemode=none&view=FitH` : url)

const plural = (count, unit) => `${count} ${unit}${Number(count) === 1 ? '' : 's'}`

// The headline terms as tiles: [label, value] - just the term and the validity period (the rest stays in the agreement text).
export const keyTermTiles = (agreement) => {
  const terms = agreement?.key_terms || {}
  return [
    terms.term_months != null && ['Term', plural(terms.term_months, 'month')],
    ['Validity', formatPeriod(agreement)],
  ].filter(Boolean)
}

// The reading view shows only the document: no browser toolbar, no thumbnails, fitted to the width.
export const pdfReadSrc = (url) => (url ? `${url.split('#')[0]}#toolbar=0&navpanes=0&scrollbar=1&view=FitH` : url)
