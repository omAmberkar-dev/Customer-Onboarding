import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

// Same footer as the tables in the enterprise app: "Showing X–Y of N" on the left, first / previous / page numbers / next / last in
// the middle, and a rows-per-page picker on the right. `page` is 1-based.
const SMALL = { fontSize: '0.6875rem', lineHeight: '1rem' }
const NUMBER = { ...SMALL, fontWeight: 700 }

function pageNumbers(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = new Set([1, pageCount, page])
  if (page - 1 >= 1) pages.add(page - 1)
  if (page + 1 <= pageCount) pages.add(page + 1)
  const sorted = [...pages].sort((a, b) => a - b)
  const result = []
  sorted.forEach((number, index) => {
    if (index > 0 && number - sorted[index - 1] > 1) result.push('ellipsis')
    result.push(number)
  })
  return result
}

function IconButton({ label, disabled, onClick, children }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-[5px] border border-[#c2cdda] bg-white text-[#052e86] transition hover:enabled:bg-[#eef2fb] disabled:cursor-not-allowed disabled:opacity-45">
      {children}
    </button>
  )
}

export default function InvoicePagination({ total, page, rowsPerPage, rowsPerPageOptions = [5, 10, 25, 50], onPageChange, onRowsPerPageChange, itemLabel = 'invoices' }) {
  const pageCount = Math.max(1, Math.ceil(total / rowsPerPage))
  const current = Math.min(page, pageCount)
  const start = total === 0 ? 0 : (current - 1) * rowsPerPage + 1
  const end = Math.min(total, current * rowsPerPage)
  return (
    <div className="grid grid-cols-1 items-center gap-3 border-t border-[#c2cdda] bg-[#fafcff] px-3.5 py-3 text-[#474747] sm:grid-cols-[1fr_auto_1fr]" style={SMALL}>
      <span role="status" className="whitespace-nowrap" style={SMALL}>Showing {start}&ndash;{end} of {total} {itemLabel}</span>
      <div className="flex items-center gap-1.5 sm:justify-self-center">
        <IconButton label="First page" disabled={current <= 1} onClick={() => onPageChange(1)}><ChevronsLeft size={14} /></IconButton>
        <IconButton label="Previous page" disabled={current <= 1} onClick={() => onPageChange(current - 1)}><ChevronLeft size={14} /></IconButton>
        {pageNumbers(current, pageCount).map((entry, index) => entry === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-0.5" style={SMALL}>&hellip;</span>
        ) : (
          <button key={entry} type="button" aria-label={`Page ${entry}`} aria-current={entry === current ? 'page' : undefined} onClick={() => onPageChange(entry)} style={NUMBER} className={`inline-flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-[5px] border px-1.5 ${entry === current ? 'border-[#052e86] bg-[#052e86] text-white' : 'border-[#c2cdda] bg-white text-[#052e86] hover:bg-[#eef2fb]'}`}>{entry}</button>
        ))}
        <IconButton label="Next page" disabled={current >= pageCount} onClick={() => onPageChange(current + 1)}><ChevronRight size={14} /></IconButton>
        <IconButton label="Last page" disabled={current >= pageCount} onClick={() => onPageChange(pageCount)}><ChevronsRight size={14} /></IconButton>
      </div>
      <div className="flex items-center gap-2 sm:justify-self-end">
        <span style={SMALL}>Rows</span>
        <select value={rowsPerPage} onChange={(event) => onRowsPerPageChange(Number(event.target.value))} className="min-h-7 cursor-pointer rounded-[7px] border border-[#c2cdda] bg-white px-1.5 py-0.5 text-[#5f5f5f]" style={SMALL}>
          {rowsPerPageOptions.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>
    </div>
  )
}
