// My loans: how the journey LAS sends (GET /vendors/me/loans) reads on the page.

export const formatMoney = (value, currency = 'INR') => {
  const amount = Number(value)
  if (value === null || value === undefined || value === '' || Number.isNaN(amount)) return '—'
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en-IN')}`
  }
}

export const formatLoanDate = (value) => {
  const date = /^\d{4}-\d{2}-\d{2}/.test(value || '') ? new Date(`${value.slice(0, 10)}T00:00:00`) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export const formatRate = (value) => (value === null || value === undefined || value === '' ? '—' : `${Number(value)}% p.a.`)

// Badge colours by status: green once done, blue while in progress, grey for not approved.
const TONES = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  disbursed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  settled: 'border-slate-200 bg-slate-50 text-slate-700',
  under_review: 'border-brand-100 bg-brand-50 text-brand-700',
  requested: 'border-brand-100 bg-brand-50 text-brand-700',
  not_approved: 'border-slate-200 bg-slate-100 text-slate-600',
}
export const statusTone = (status) => TONES[status] || TONES.under_review

// The PDF behind a card: what the viewer and the download need.
const safe = (text) => String(text || '').replace(/[^\w.-]+/g, '_')
export const DOCUMENTS = {
  sanction: (s) => ({ kind: 'sanction', id: s.id, title: 'Sanction Memo', subtitle: s.sanctionNo ? `Sanction No. ${s.sanctionNo}` : '', fileName: `Sanction_Memo_${safe(s.sanctionNo || s.requestNo)}.pdf` }),
  drawdown: (d) => ({ kind: 'drawdown', id: d.id, title: 'Drawdown Memo', subtitle: d.drawdownNo ? `Drawdown No. ${d.drawdownNo}` : '', fileName: `Drawdown_Memo_${safe(d.drawdownNo || d.requestNo)}.pdf` }),
  invoice: (i) => ({ kind: 'invoice', id: i.id, title: 'Invoice', subtitle: i.title, fileName: `Invoice_${safe(i.month)}_${safe(i.kind)}_${safe(i.drawdownNo)}.pdf` }),
}
