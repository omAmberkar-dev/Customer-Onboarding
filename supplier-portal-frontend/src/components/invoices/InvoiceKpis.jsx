import { useMemo } from 'react'
import { statusDetails } from '../../utils/invoiceStatus'

// The same dot colours as the status summary in the enterprise app (approved green, in-progress amber, problems red, other blue).
const DOT = { Approved: '#1f7c64', Processing: '#936716', 'Needs correction': '#bf4252', Failed: '#bf4252', Rejected: '#bf4252', Ready: '#0046dc' }

// Total first, then what needs the vendor to act (correct, retry, submit), then what is in progress, then the outcomes,
// with Rejected last. A status that is not listed goes after these, biggest first.
const ORDER = ['Needs correction', 'Failed', 'Ready', 'Processing', 'Approved', 'Rejected']
const position = (label) => (ORDER.includes(label) ? ORDER.indexOf(label) : ORDER.length)

// Total plus a count per status that actually has invoices, in that order.
export default function InvoiceKpis({ invoices }) {
  const summary = useMemo(() => {
    const counts = new Map()
    invoices.forEach((invoice) => {
      const { label } = statusDetails(invoice)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => position(a[0]) - position(b[0]) || b[1] - a[1])
  }, [invoices])

  if (!invoices.length) return null
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[#5f5f5f]" aria-label="Invoice summary">
      <span><b className="font-bold text-[#000000]">{invoices.length}</b> Total Invoices</span>
      {summary.map(([label, count]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <i className="size-1.5 rounded-full" style={{ backgroundColor: DOT[label] || '#0046dc' }} />
          <span><b className="font-bold text-[#000000]">{count}</b> {label}</span>
        </span>
      ))}
    </div>
  )
}
