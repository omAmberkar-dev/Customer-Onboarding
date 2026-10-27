import { useContext } from 'react'
import { FlaggedContext, CELL_ALIGN, amount, customerGstin, dateValue, display, invoiceNumber, pick, rawItems, taxRate, totalValue, vendorGstin, vendorName } from './invoiceFields'

// The invoice detail views (Overview, Amounts), shared by the invoice details popup and the compare screen.

export function DetailSection({ title, anchor, children }) {
  return <section data-anchor={anchor} className="mb-3.5 rounded-lg border border-[#c2cdda] bg-white px-3.5 py-2.5"><div className="mb-3 flex items-center gap-2 border-b border-[#c2cdda] pb-2"><span className="size-1 rounded-full bg-[#0046dc]" /><h3 className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#5f5f5f]">{title}</h3></div>{children}</section>
}
export function Field({ label, value, wide = false, fieldKey }) {
  return <div className={wide ? 'sm:col-span-2' : ''}><Flagged fieldKey={fieldKey}><p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#5f5f5f]">{label}</p><p className="mt-1.5 min-h-5 break-words text-[13px] font-medium leading-5 text-[#000000]">{display(value)}</p></Flagged></div>
}

// The fields the reviewer flagged when sending the invoice back (and that are still to be corrected), marked in the detail.
export function Flagged({ fieldKey, children, className = '' }) {
  const flagged = useContext(FlaggedContext)
  if (!fieldKey || !flagged.has(fieldKey)) return className ? <div className={className}>{children}</div> : children
  return <div data-flagged-field={fieldKey} className={`-m-2 rounded-lg border-[1.5px] border-red-500 bg-red-50/60 p-2 ${className}`}>{children}</div>
}

export function Overview({ invoice }) {
  return (
    <>
      <DetailSection title="Customer" anchor="vendor"><div className="grid gap-4 sm:grid-cols-2"><Field label="Customer Name" value={vendorName(invoice)} fieldKey="vendor_name" /><Field label="GSTIN" value={vendorGstin(invoice)} fieldKey="vendor_tax_id" /><Field wide label="Address" value={pick(invoice, ['vendor_address', 'supplier_address', 'address'])} fieldKey="vendor_address" /></div></DetailSection>
      <DetailSection title="Customer / Billing" anchor="customer"><div className="grid gap-4 sm:grid-cols-2"><Field label="Customer Name" value={pick(invoice, ['customer_name', 'billing_name', 'buyer_name'])} fieldKey="customer_name" /><Field label="GSTIN" value={customerGstin(invoice)} fieldKey="customer_tax_id" /><Field wide label="Address" value={pick(invoice, ['customer_address', 'billing_address', 'buyer_address'])} fieldKey="billing_address" /></div></DetailSection>
      <DetailSection title="Invoice / Payment" anchor="invoice"><div className="grid gap-4 sm:grid-cols-2"><Field label="Invoice No." value={invoiceNumber(invoice)} fieldKey="invoice_number" /><Field label="System Invoice Ref." value={pick(invoice, ['inv_ref_gen'])} /><Field label="Currency" value={pick(invoice, ['currency'], 'INR')} fieldKey="currency" /><Field label="Invoice Date" value={dateValue(pick(invoice, ['invoice_date']))} fieldKey="invoice_date" /><Field label="Due Date" value={dateValue(pick(invoice, ['due_date']))} fieldKey="due_date" /><Field label="Payment Term" value={pick(invoice, ['payment_term', 'payment_terms'])} fieldKey="payment_term" /></div></DetailSection>
    </>
  )
}

export function Amounts({ invoice }) {
  const currency = pick(invoice, ['currency'], 'INR')
  const lineItems = rawItems(invoice)
  const taxes = pick(invoice, ['tax_details', 'taxes'], [])
  const taxRows = Array.isArray(taxes) ? taxes : []
  return (
    <>
      <DetailSection title="Amounts" anchor="amounts">
        <div className="grid gap-3 sm:grid-cols-3">
          <AmountTile label="Sub Total" fieldKey="subtotal" value={amount(pick(invoice, ['sub_total', 'subtotal', 'taxable_amount'], null), currency)} />
          <AmountTile label="Total Tax" fieldKey="total_tax" value={amount(pick(invoice, ['total_tax', 'tax_amount'], null), currency)} />
          <AmountTile label="Total Amount" fieldKey="total_amount" value={amount(totalValue(invoice), currency)} highlight />
        </div>
        {taxRows.length > 0 && <MiniTable headers={['Tax', 'Rate', 'Amount']} aligns={['center', 'center', 'right']} widths={['40%', '25%', '35%']} rows={taxRows.map((tax) => [tax.tax_desc ?? tax.tax_description ?? tax.name, taxRate(tax), amount(tax.amount ?? tax.tax_amount, currency)])} />}
      </DetailSection>
      <DetailSection title={`Line Items — ${display(invoiceNumber(invoice))}`} anchor="line-items"><Flagged fieldKey="line_items"><MiniTable headers={['#', 'Description', 'Qty', 'Unit Price', 'Amount']} aligns={['center', 'left', 'center', 'center', 'right']} widths={['3.5rem', null, '5rem', '8rem', '9rem']} rows={lineItems.map((item, index) => [index + 1, display(item.description ?? item.item_description), display(item.quantity), amount(item.unit_price, currency), amount(item.total_amount ?? item.taxable_amount ?? item.amount, currency)])} empty="No extracted line items are available." /></Flagged></DetailSection>
    </>
  )
}

export function AmountTile({ label, value, highlight = false, fieldKey }) {
  return (
    <Flagged fieldKey={fieldKey}>
    <div className={`rounded-lg border px-3.5 py-3 ${highlight ? 'border-[#b3c3e4] bg-[#f1f4f8]' : 'border-[#d8e0e9] bg-[#fbfcfe]'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#5f5f5f]">{label}</p>
      <p className={`mt-1.5 text-[15px] font-semibold ${highlight ? 'text-[#0046dc]' : 'text-[#000000]'}`}>{value}</p>
    </div>
    </Flagged>
  )
}

export function MiniTable({ headers, rows, aligns = [], widths = [], compact = false, empty = '' }) {
  if (!rows.length) return empty ? <p className="py-5 text-center text-xs text-slate-500">{empty}</p> : null
  return (
    <div className="mt-3 overflow-x-auto">
      <table className={`table-fixed border-collapse ${compact ? 'w-full max-w-[24rem]' : 'w-full min-w-[460px]'}`}>
        <colgroup>{headers.map((header, index) => <col key={header} style={widths[index] ? { width: widths[index] } : undefined} />)}</colgroup>
        <thead><tr>{headers.map((header) => <th key={header} className="border-b border-[#c2cdda] px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.03em] text-[#5f5f5f]">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={`border-b border-[#c2cdda] px-2 py-2 text-[13px] text-[#000000] ${CELL_ALIGN[aligns[cellIndex] || 'left']} ${aligns[cellIndex] === 'right' ? 'pr-4' : ''}`}>{display(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
